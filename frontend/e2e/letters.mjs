// Browser run of the letter flow against the real backend: digital PDF, scanned photo (OCR), record, and the new screens.
// Usage: E2E_BASE=http://localhost:5202 OUT=./shots node e2e/letters.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE || 'http://localhost:5202'
const OUT = process.env.OUT || '.'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 1600 } })
const problems = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(user) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !/ResizeObserver|width\(0\)/.test(m.text())) problems.push(`${user} console: ` + m.text().slice(0, 200)) })
  page.on('pageerror', (e) => problems.push(`${user} pageerror: ` + String(e).slice(0, 200)))
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${user} http ${r.status()} ${r.url().replace(BASE, '')}`) })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' })
  await page.type('input[autocomplete="username"]', user)
  await page.type('input[type="password"]', 'demo')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), page.keyboard.press('Enter')])
  return page
}
const click = (page, text) => page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t)); if (!b) return false; b.click(); return true }, text)
const textOf = (page) => page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)

const p = await session('arao')
await p.goto(BASE + '/letters', { waitUntil: 'networkidle0' })
await click(p, 'Digital PDF')
await p.waitForFunction(() => document.body.innerText.includes('Check what was read'), { timeout: 60000 }).catch(async () => {
  await p.screenshot({ path: `${OUT}/letter_fail.png`, fullPage: true }); console.log('FAILED:', (await textOf(p)).slice(0, 1500)); console.log([...new Set(problems)].join(' | ')); process.exit(1)
})
await wait(800)
let t = await textOf(p)
console.log('digital PDF →', t.includes('Digital PDF: exact text') ? 'exact text' : '?', '| institution:', /Sahyadri Institute of Technology/.test(t), '| asked before:', t.includes('Asked before by another unit'))
await p.screenshot({ path: `${OUT}/letter_pdf.png`, fullPage: true })

await click(p, 'Scanned photo (OCR)')
const t0 = Date.now()
await p.waitForFunction(() => document.body.innerText.includes('OCR confidence'), { timeout: 240000 })
await p.waitForFunction(() => document.body.innerText.includes('Check what was read'), { timeout: 60000 })
await wait(800)
t = await textOf(p)
const conf = (t.match(/OCR confidence (\d+)%/) || [])[1]
console.log(`scanned photo → OCR ${conf}% in ${Math.round((Date.now() - t0) / 1000)} s | institution found:`, t.includes('Sahyadri Institute of Technology'), '| SHC hearing:', t.includes('SHC hearing') || t.includes('Standing Hearing'))
await p.screenshot({ path: `${OUT}/letter_ocr.png`, fullPage: true })

// Record the PGRC letter (sample 2) and see it on the requests page.
await click(p, 'PGRC asks for documents')
await p.waitForFunction(() => document.body.innerText.includes('Record the request'), { timeout: 60000 })
await wait(500)
await click(p, 'Record the request')
await p.waitForFunction(() => document.body.innerText.includes('Request recorded') || document.body.innerText.includes('has already been recorded'), { timeout: 30000 })
console.log('record →', (await textOf(p)).includes('Request recorded') ? 'recorded' : 'not recorded')
for (const path of ['/requests', '/my-day', '/radar']) {
  await p.goto(BASE + path, { waitUntil: 'networkidle0' }); await wait(600)
  console.log(path.padEnd(10), '→', (await p.$eval('h1', (e) => e.textContent)).slice(0, 50))
  await p.screenshot({ path: `${OUT}/arao${path.replace('/', '_')}.png`, fullPage: true })
}

// Close dialog shows the closure check.
await p.goto(BASE + '/cases?unit=PGRC', { waitUntil: 'networkidle0' })
const caseHref = await p.$$eval('a[href^="/cases/c"]', (as) => as[0]?.getAttribute('href'))
await p.goto(BASE + caseHref, { waitUntil: 'networkidle0' }); await wait(500)
if (await click(p, 'Close the case')) {
  await wait(400)
  await p.type('textarea', 'Advised to approach the state government')
  await p.waitForFunction(() => document.body.innerText.includes('Closure check'), { timeout: 15000 }).catch(() => {})
  await wait(700)
  console.log('closure check →', (await textOf(p)).includes('sends the complainant to another office') ? 'flags "approach another office"' : 'not shown')
  await p.screenshot({ path: `${OUT}/closure_check.png` })
}

// Policy: the administrator proposes, senior management approves.
const a = await session('vjoshi')
await a.goto(BASE + '/policy', { waitUntil: 'networkidle0' }); await wait(500)
await a.evaluate(() => { const i = document.querySelector('input[aria-label="All other sources: time to dispose"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '20'); i.dispatchEvent(new Event('input', { bubbles: true })) })
await a.waitForFunction(() => document.body.innerText.includes('On today’s records'), { timeout: 20000 })
await a.type('textarea', 'AICTE letter of 20 Oct sets 20 days for non-CPGRAMS complaints.')
await click(a, 'Send for approval')
await a.waitForFunction(() => document.body.innerText.includes('Waiting for approval'), { timeout: 20000 })
await a.screenshot({ path: `${OUT}/policy_admin.png`, fullPage: true })
const s = await session('rdas')
await s.goto(BASE + '/policy', { waitUntil: 'networkidle0' }); await wait(500)
await click(s, 'Approve')
await s.waitForFunction(() => document.body.innerText.includes('Approved'), { timeout: 20000 })
console.log('policy → proposed by admin, approved by senior management')
await s.screenshot({ path: `${OUT}/policy_approved.png`, fullPage: true })

console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].join('\n') : 'no console errors, no failed requests')
await browser.close()
