// Sharp screenshots of single panels for the presentation, taken from the running app (real API, synthetic data).
// Usage: E2E_BASE=http://localhost:5202 OUT=./shots node e2e/deckshots.mjs
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE || 'http://localhost:5202'
const OUT = process.env.OUT || '.'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 1700, deviceScaleFactor: 2 } })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function as(user) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' })
  await page.type('input[autocomplete="username"]', user)
  await page.type('input[type="password"]', 'demo')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), page.keyboard.press('Enter')])
  return page
}
const click = (page, text) => page.evaluate((t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(t)); b?.click(); return !!b }, text)

/** Screenshot the panel (section) whose text contains `text`. */
async function panel(page, text, file, { wide = false } = {}) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 60000 }, text)
  await wait(700)
  const handle = await page.evaluateHandle((t, wide) => {
    const all = [...document.querySelectorAll('section, figure, details')].filter((s) => s.innerText.includes(t))
    all.sort((a, b) => a.innerText.length - b.innerText.length)
    let el = all[0]
    if (wide) while (el.parentElement && el.parentElement.getBoundingClientRect().width < 1200) el = el.parentElement
    // The app's top bar sticks while scrolling; release it so it does not cover the panel.
    document.querySelectorAll('*').forEach((e) => { if (getComputedStyle(e).position === 'sticky') e.style.position = 'static' })
    el.scrollIntoView({ block: 'start' })
    return el
  }, text, wide)
  await wait(300)
  await handle.asElement().screenshot({ path: `${OUT}/${file}.png` })
  console.log('saved', file)
}

const pgrc = await as('arao')
await pgrc.goto(BASE + '/letters', { waitUntil: 'networkidle0' })
await click(pgrc, 'PGRC asks for documents')
await panel(pgrc, 'What other units have already asked', 'deck_letter_findings')
await click(pgrc, 'Scanned photo (OCR)')
await pgrc.waitForFunction(() => document.body.innerText.includes('OCR confidence'), { timeout: 240000 })
await panel(pgrc, 'The text Ekatra read', 'deck_letter_ocr')
await panel(pgrc, 'Check what was read', 'deck_letter_facts')
await pgrc.goto(BASE + '/allocation', { waitUntil: 'networkidle0' })
await panel(pgrc, 'Who holds what', 'deck_assign')

const rb = await as('siyer')
await rb.goto(BASE + '/team', { waitUntil: 'networkidle0' })
await panel(rb, 'Also on your institutions', 'deck_team')
await rb.goto(BASE + '/check?inst=inst-57', { waitUntil: 'networkidle0' })
await wait(1500)
await rb.screenshot({ path: `${OUT}/deck_check_full.png` })

const boss = await as('rdas')
await boss.goto(BASE + '/', { waitUntil: 'networkidle0' })
await panel(boss, 'Open work by department', 'deck_cells')

const coord = await as('mkhan')
await coord.goto(BASE + '/my-day', { waitUntil: 'networkidle0' })
await panel(coord, 'Decisions waiting for you', 'deck_myday')
await coord.goto(BASE + '/radar', { waitUntil: 'networkidle0' })
await panel(coord, 'Came back after closure', 'deck_radar')

const admin = await as('vjoshi')
await admin.goto(BASE + '/policy', { waitUntil: 'networkidle0' })
await admin.evaluate(() => { const i = document.querySelector('input[aria-label="All other sources: time to dispose"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '20'); i.dispatchEvent(new Event('input', { bubbles: true })) })
await panel(admin, 'What would change today', 'deck_policy')

await browser.close()
