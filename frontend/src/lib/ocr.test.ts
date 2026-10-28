import { describe, expect, it } from 'vitest'
import { sauvola, stretch, toGrey } from './ocr'

describe('image preparation for OCR', () => {
  it('stretches a faint image to full contrast', () => {
    const g = new Uint8Array(1000).map((_, i) => 100 + (i % 50)) // values 100..149 only
    const s = stretch(g)
    expect(Math.min(...s)).toBe(0)
    expect(Math.max(...s)).toBe(255)
  })

  it('keeps dark text readable under a shadow (area by area, not one threshold)', () => {
    // Paper gets darker from left (230) to right (90); text strokes are 60 darker than the paper around them.
    const w = 200, h = 60
    const g = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const paper = 230 - (140 * x) / w
      const ink = y >= 25 && y < 35 && x % 10 < 3
      g[y * w + x] = ink ? paper - 60 : paper
    }
    const bw = sauvola(g, w, h, 21)
    const at = (x: number, y: number) => bw[y * w + x]
    // Ink is black and paper is white on both the bright and the shadowed side.
    expect(at(10, 30)).toBe(0)
    expect(at(15, 10)).toBe(255)
    expect(at(190, 30)).toBe(0)
    expect(at(195, 10)).toBe(255)
  })

  it('makes grey from colour', () => {
    expect([...toGrey(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))]).toEqual([255, 0])
  })
})
