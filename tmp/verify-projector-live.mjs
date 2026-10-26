import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL('C:/www/4TH & LEGACY/frontend/node_modules/playwright/index.mjs').href);

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{ if(response.status()>=400) errors.push(`${response.status()} ${response.url()}`); });
  const response=await page.goto('https://www.andenne-bears.be/tournoi-ecran.html',{waitUntil:'networkidle'});
  await page.locator('#standings .standing').first().waitFor();
  const result=await page.evaluate(()=>({title:document.title,heading:document.getElementById('current-title').textContent,progress:document.getElementById('progress').textContent,sync:document.getElementById('sync').textContent,teams:document.querySelectorAll('#standings .standing').length,matches:document.querySelectorAll('#current-matches .large-match').length,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,viewportWidth:innerWidth,viewportHeight:innerHeight}));
  await page.screenshot({path:'tmp/tournament-dashboard-20261022/projector-live-1920.png'});
  console.log(JSON.stringify({http:response.status(),result,errors}));
  if (response.status()!==200 || errors.length || result.scrollWidth>1920 || result.scrollHeight>1080 || result.teams!==6 || result.matches!==3) process.exitCode=1;
} finally { await browser.close(); }
