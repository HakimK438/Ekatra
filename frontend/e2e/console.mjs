import puppeteer from 'puppeteer-core'
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const b = await puppeteer.launch({ executablePath: edge, headless: 'new' })
const p = await b.newPage()
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
p.on('requestfailed', (r) => console.log('FAILED', r.url()))
await p.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' })
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 200))
await p.screenshot({ path: process.argv[2] ?? 'login.png' })
await b.close()
