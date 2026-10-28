// Browser check against the real backend: signs in through the form, visits screens, reports console errors and failed requests.
// Needs: npm i --no-save puppeteer-core ; Microsoft Edge installed ; API and website running (see README).
// Usage (Git Bash: export MSYS_NO_PATHCONV=1 first):  OUT=./shots node e2e/e2e.mjs arao "/,/cases,/overlaps"
import puppeteer from 'puppeteer-core'

const BASE = process.env.E2E_BASE || 'http://localhost:4180'
const OUT = process.env.OUT || '.'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const user = process.argv[2] || 'arao'
const paths = (process.argv[3] || '/,/cases,/institutions,/overlaps,/matching,/deadlines,/reports,/audit,/settings,/import').split(',')

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 1500 } })
const page = await browser.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error' && !/ResizeObserver|width\(0\)/.test(m.text())) problems.push('console: ' + m.text().slice(0, 200)) })
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${r.url().replace(BASE, '')}`) })

await page.goto(BASE + '/login', { waitUntil: 'networkidle0' })
await page.screenshot({ path: `${OUT}/login.png` })
// real sign-in through the form
await page.type('input[autocomplete="username"]', user)
await page.type('input[type="password"]', 'demo')
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), page.keyboard.press('Enter')])
for (const p of paths) {
  await page.goto(BASE + p, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 400))
  const name = p === '/' ? 'dashboard' : p.replace(/[^a-z0-9]+/gi, '_')
  const h1 = await page.$eval('h1', (e) => e.textContent).catch(() => '(no h1)')
  console.log(p.padEnd(22), '→', String(h1).slice(0, 60))
  await page.screenshot({ path: `${OUT}/${user}_${name}.png`, fullPage: !!process.env.FULL })
}
console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].join('\n') : 'no console errors, no failed requests')
await browser.close()
