// Reading an uploaded letter into text, entirely in the browser: the file is never sent anywhere or stored.
// 1. Digital PDFs (most e-Office letters) carry their text: it is read exactly, with no OCR guessing.
// 2. Scans and phone photos go through OCR (Tesseract). Photos are hard: shadows, uneven light, tilt, sideways shots.
//    So the image is prepared several ways and the best reading wins:
//    - turned upright using the photo's own orientation tag, and resized to the size OCR reads best;
//    - a grey version with the contrast stretched (Tesseract binarises it itself);
//    - a black-and-white version made area by area (Sauvola), so a shadow on one side does not wipe out the text;
//    - English first; English + Hindi only when Hindi is likely (Hindi on an English letter turns specks into letters);
//    - if every reading is poor, the page turned a quarter turn either way (photos taken sideways).
// The OCR engine sits behind `recognise`, so a stronger engine (for example Bhashini OCR) can replace it later.

export type ReadMethod = 'text_file' | 'pdf_text' | 'ocr'
export interface ReadResult {
  text: string
  method: ReadMethod
  pages: number
  /** OCR only: average word confidence 0-100, the words read with low confidence (to check by eye), and how the best reading was made. */
  confidence?: number
  unsure?: string[]
  how?: string
}
export type Progress = (stage: string, pct: number) => void

const MIN_PDF_TEXT = 60 // fewer characters than this: a scanned PDF, so use OCR
const TARGET_WIDTH = 2200 // text height around 30 px at A4 width, where Tesseract reads best
const GOOD_ENOUGH = 82 // stop trying other versions once a reading is this confident

export async function readLetterFile(file: File, onProgress: Progress = () => {}): Promise<ReadResult> {
  const name = file.name.toLowerCase()
  if (file.type.startsWith('text/') || name.endsWith('.txt')) {
    return { text: await file.text(), method: 'text_file', pages: 1 }
  }
  try {
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return await readPdf(file, onProgress)
    if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|tiff?)$/.test(name)) {
      onProgress('Preparing the image', 3)
      const canvas = await imageToCanvas(file)
      return { ...(await ocrPages([canvas], onProgress)), pages: 1 }
    }
  } finally {
    await stopWorkers()
  }
  throw new Error('Upload a PDF, a photo or scan (JPG, PNG), or a text file.')
}

async function readPdf(file: File, onProgress: Progress): Promise<ReadResult> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  onProgress('Opening the PDF', 5)
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = Math.min(doc.numPages, 6) // letters are short; the first pages hold the facts
  const texts: string[] = []
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Rebuild lines from the positions of the text pieces (same height = same line).
    const lines = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!('str' in it)) continue
      const y = Math.round(it.transform[5] / 3) * 3
      lines.set(y, [...(lines.get(y) ?? []), { x: it.transform[4], s: it.str }])
    }
    texts.push([...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n'))
    onProgress('Reading the text in the PDF', 5 + (p / pages) * 40)
  }
  const text = texts.join('\n\n')
  if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) return { text, method: 'pdf_text', pages }

  // A scan inside a PDF: draw each page and read it with OCR.
  const canvases: HTMLCanvasElement[] = []
  for (let p = 1; p <= Math.min(pages, 3); p++) {
    const page = await doc.getPage(p)
    const base = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: TARGET_WIDTH / base.width })
    const c = document.createElement('canvas')
    c.width = vp.width
    c.height = vp.height
    await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
    canvases.push(c)
  }
  return { ...(await ocrPages(canvases, onProgress)), pages: canvases.length }
}

/** Upright (from the photo's orientation tag) and resized to the width OCR reads best. */
async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = TARGET_WIDTH / Math.max(bmp.width, 1)
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return c
}

// ---------------------------------------------------------------- image preparation (pure, tested)
/** Grey values of an RGBA buffer. */
export function toGrey(d: Uint8ClampedArray): Uint8Array {
  const g = new Uint8Array(d.length / 4)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0
  return g
}

/** Stretch contrast so the darkest 1% is black and the lightest 1% white (faint photos, grey paper). */
export function stretch(g: Uint8Array): Uint8Array {
  const hist = new Array<number>(256).fill(0)
  for (const v of g) hist[v]++
  const cut = g.length * 0.01
  let lo = 0, hi = 255, acc = 0
  while (lo < 255 && (acc += hist[lo]) < cut) lo++
  acc = 0
  while (hi > 0 && (acc += hist[hi]) < cut) hi--
  if (hi - lo < 10) return g
  const out = new Uint8Array(g.length)
  for (let i = 0; i < g.length; i++) out[i] = Math.max(0, Math.min(255, ((g[i] - lo) * 255) / (hi - lo)))
  return out
}

/** Even out the lighting: divide each pixel by the brightness of the paper around it (a wide local mean),
 *  so a shadow across half the page becomes white paper again while the ink stays dark. */
export function flatten(g: Uint8Array, w: number, h: number, win = Math.max(31, Math.round(w / 12) | 1)): Uint8Array {
  const mean = localMean(g, w, h, win)
  const out = new Uint8Array(g.length)
  for (let i = 0; i < g.length; i++) out[i] = Math.min(255, (g[i] * 235) / Math.max(1, mean[i] * 1.08))
  return out
}

function localMean(g: Uint8Array, w: number, h: number, win: number): Float64Array {
  const W = w + 1
  const sum = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let rs = 0
    for (let x = 0; x < w; x++) { rs += g[y * w + x]; sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs }
  }
  const r = win >> 1
  const out = new Float64Array(g.length)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      out[y * w + x] = (sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]) / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}

/** Black and white decided area by area (Sauvola): each pixel is compared with its neighbourhood, so shadows and
 *  uneven light do not turn whole regions black or white. Uses integral images, so it is fast at any window size. */
export function sauvola(g: Uint8Array, w: number, h: number, win = Math.max(15, Math.round(w / 45) | 1), k = 0.2): Uint8Array {
  const W = w + 1
  const sum = new Float64Array(W * (h + 1))
  const sq = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x]
      rs += v
      rq += v * v
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq
    }
  }
  const r = win >> 1
  const out = new Uint8Array(g.length)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      const n = (x1 - x0) * (y1 - y0)
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]
      const q = sq[y1 * W + x1] - sq[y0 * W + x1] - sq[y1 * W + x0] + sq[y0 * W + x0]
      const mean = s / n
      const sd = Math.sqrt(Math.max(0, q / n - mean * mean))
      out[y * w + x] = g[y * w + x] > mean * (1 + k * (sd / 128 - 1)) ? 255 : 0
    }
  }
  return out
}

function greyCanvas(g: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g[j]
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function rotate(c: HTMLCanvasElement, quarter: 1 | 3): HTMLCanvasElement {
  const r = document.createElement('canvas')
  r.width = c.height
  r.height = c.width
  const ctx = r.getContext('2d')!
  ctx.translate(r.width / 2, r.height / 2)
  ctx.rotate((quarter * Math.PI) / 2)
  ctx.drawImage(c, -c.width / 2, -c.height / 2)
  return r
}

/** The versions of one page to try, best first: stretched grey, then area-by-area black and white. */
function versions(c: HTMLCanvasElement): { name: string; canvas: HTMLCanvasElement }[] {
  const ctx = c.getContext('2d')!
  const grey = toGrey(ctx.getImageData(0, 0, c.width, c.height).data)
  const even = stretch(flatten(grey, c.width, c.height))
  return [
    { name: 'lighting evened out', canvas: greyCanvas(even, c.width, c.height) },
    { name: 'black and white, area by area', canvas: greyCanvas(sauvola(even, c.width, c.height), c.width, c.height) },
    { name: 'grey, contrast stretched', canvas: greyCanvas(stretch(grey), c.width, c.height) },
  ]
}

// ---------------------------------------------------------------- OCR
interface Reading { text: string; confidence: number; unsure: string[]; how: string; score: number }
type Langs = 'eng' | 'eng+hin'
type TWorker = { recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number; words?: { text: string; confidence: number }[] } }>; terminate: () => Promise<unknown> }
const workers = new Map<Langs, Promise<TWorker>>()
let report: (fraction: number) => void = () => {}

/** Tesseract.js, free and in the browser. Language data is downloaded once and cached by the browser. One worker per language set. */
function worker(langs: Langs): Promise<TWorker> {
  if (!workers.has(langs)) {
    workers.set(langs, import('tesseract.js').then(({ createWorker }) => createWorker(langs.split('+'), 1, {
      logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') report(m.progress) },
    }) as unknown as Promise<TWorker>))
  }
  return workers.get(langs)!
}

async function stopWorkers() {
  const all = [...workers.values()]
  workers.clear()
  await Promise.all(all.map((w) => w.then((x) => x.terminate()).catch(() => undefined)))
}

async function recognise(canvas: HTMLCanvasElement, langs: Langs, how: string): Promise<Reading> {
  const { data } = await (await worker(langs)).recognize(canvas)
  const words = data.words ?? []
  // Confidence counts only real words, so a few stray specks do not hide a good reading (or flatter a bad one).
  const real = words.filter((w) => /[\p{L}\p{N}]{2,}/u.test(w.text))
  const conf = real.length ? real.reduce((a, w) => a + w.confidence, 0) / real.length : data.confidence
  // Which reading is best: how much text was read with confidence, not the average alone (a reading that skips the
  // hard half of a page can still have a high average).
  const score = real.filter((w) => w.confidence >= 60).reduce((a, w) => a + w.text.length * w.confidence, 0)
  return { text: data.text, confidence: Math.round(conf), unsure: real.filter((w) => w.confidence < 60).map((w) => w.text), how: `${how}, ${langs === 'eng' ? 'English' : 'English and Hindi'}`, score }
}

const devanagariShare = (t: string) => (t.match(/[ऀ-ॿ]/g)?.length ?? 0) / Math.max(1, t.replace(/\s/g, '').length)

/** Read one page several ways and keep the most confident reading. Stops early once a reading is good. */
async function bestReading(page: HTMLCanvasElement, step: (label: string, fraction: number) => void): Promise<Reading> {
  const tries: { label: string; run: () => Promise<Reading> }[] = []
  const vs = versions(page)
  for (const v of vs) tries.push({ label: v.name, run: () => recognise(v.canvas, 'eng', v.name) })
  let best: Reading | null = null
  const attempt = async (label: string, run: () => Promise<Reading>, i: number, n: number) => {
    report = (f) => step(label, (i + f) / n)
    const r = await run()
    if (!best || r.score > best.score) best = r
  }
  for (let i = 0; i < tries.length; i++) {
    await attempt(tries[i].label, tries[i].run, i, tries.length + 2)
    if (best!.confidence >= GOOD_ENOUGH) break
  }
  // Hindi only when the page seems to have it, or English alone read poorly.
  const b = best as Reading | null
  if (b && (b.confidence < GOOD_ENOUGH || devanagariShare(b.text) > 0.02)) {
    const v = vs.find((x) => b.how.startsWith(x.name)) ?? vs[0]
    await attempt('English and Hindi', () => recognise(v.canvas, 'eng+hin', v.name), tries.length, tries.length + 2)
  }
  // A photo taken sideways reads as noise: try a quarter turn either way.
  if ((best as Reading | null)!.confidence < 55) {
    for (const q of [1, 3] as const) {
      const turned = versions(rotate(page, q))[0]
      await attempt('Page turned sideways', () => recognise(turned.canvas, 'eng', `${turned.name}, turned ${q === 1 ? 'right' : 'left'}`), tries.length + 1, tries.length + 2)
      if ((best as Reading | null)!.confidence >= GOOD_ENOUGH) break
    }
  }
  return best!
}

async function ocrPages(pages: HTMLCanvasElement[], onProgress: Progress): Promise<Omit<ReadResult, 'pages'>> {
  const out: Reading[] = []
  for (let i = 0; i < pages.length; i++) {
    out.push(await bestReading(pages[i], (label, f) => onProgress(`Page ${i + 1} of ${pages.length}: reading (${label})`, 8 + ((i + Math.min(1, f)) / pages.length) * 90)))
  }
  return {
    text: out.map((r) => r.text).join('\n\n'), method: 'ocr',
    confidence: Math.round(out.reduce((a, r) => a + r.confidence, 0) / out.length),
    unsure: [...new Set(out.flatMap((r) => r.unsure))].slice(0, 30),
    how: out[0]?.how,
  }
}
