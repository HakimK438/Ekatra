// OCR check in the browser: uploads one image to "Read a letter" and prints the confidence and what was found.
// Usage: OUT=./shots node e2e/ocr.mjs <path-to-image>
import puppeteer from 'puppeteer-core'
const BASE='http://localhost:5202', OUT=process.env.OUT
const b=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:'new',defaultViewport:{width:1440,height:1600}})
const p=await b.newPage()
await p.goto(BASE+'/login',{waitUntil:'networkidle0'}); await p.type('input[autocomplete="username"]','arao'); await p.type('input[type="password"]','demo')
await Promise.all([p.waitForNavigation({waitUntil:'networkidle0'}).catch(()=>{}),p.keyboard.press('Enter')])
await p.goto(BASE+'/letters',{waitUntil:'networkidle0'})
const input=await p.$('input[type=file]'); await input.uploadFile(process.argv[2])
const t0=Date.now()
await p.waitForFunction(()=>document.body.innerText.includes('OCR confidence'),{timeout:300000})
await p.waitForFunction(()=>document.body.innerText.includes('Check what was read')||document.body.innerText.includes('could not'),{timeout:60000}).catch(()=>{})
await new Promise(r=>setTimeout(r,800))
const t=await p.evaluate(()=>document.body.innerText)
console.log((t.match(/OCR confidence[^\n]*/)||[''])[0], '|', Math.round((Date.now()-t0)/1000),'s')
console.log('institution:', /Sahyadri Institute of Technology/.test(t), '| reply date 30 Oct:', t.includes('30.10.2026')||t.includes('on or before'), '| asked before:', t.includes('Asked before by another unit'))
await p.screenshot({path:OUT+'/ocr_phone.png',fullPage:true}); await b.close()
