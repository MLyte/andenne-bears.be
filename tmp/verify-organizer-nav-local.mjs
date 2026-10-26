import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const { chromium }=await import(pathToFileURL('C:/www/4TH & LEGACY/frontend/node_modules/playwright/index.mjs').href);
const socket=createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;
await new Promise(resolve=>socket.close(resolve));
const server=spawn('php',['-S',`127.0.0.1:${port}`,'-t','.'],{stdio:'ignore'});
let browser;
try {
  for (let i=0;i<60;i++) { try { await fetch(`http://127.0.0.1:${port}/suivi-inscriptions.php`); break; } catch { await new Promise(resolve=>setTimeout(resolve,50)); } }
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  for (const path of ['suivi-inscriptions.php','tirage-equipes.html']) {
    for (const width of [1920,1280,390]) {
      const page=await browser.newPage({viewport:{width,height:1080}});
      const response=await page.goto(`http://127.0.0.1:${port}/${path}`);
      const result=await page.evaluate(()=>({links:[...document.querySelectorAll('.family-header .organizer-nav a')].map(a=>({text:a.textContent,current:a.getAttribute('aria-current')})),scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,navHeight:document.querySelector('.organizer-nav')?.getBoundingClientRect().height,headerHeight:document.querySelector('.family-header')?.getBoundingClientRect().height}));
      if (response.status()!==200 || result.links.length!==4 || result.links.filter(link=>link.current==='page').length!==1 || result.scrollWidth>width+1) throw new Error(`${path} ${width}: ${JSON.stringify(result)}`);
      if (width===1920 || width===390) await page.locator('.family-header').screenshot({path:`tmp/organizer-nav-${path.replace('.','-')}-${width}.png`});
      console.log(path,width,JSON.stringify(result));
      await page.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
  await new Promise(resolve=>server.once('exit',resolve));
}
