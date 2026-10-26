import { pathToFileURL } from 'node:url';
const { chromium }=await import(pathToFileURL('C:/www/4TH & LEGACY/frontend/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  for (const path of ['suivi-inscriptions.php','tirage-equipes.html']) {
    for (const width of [1920,390]) {
      const page=await browser.newPage({viewport:{width,height:1080}});
      const response=await page.goto(`https://www.andenne-bears.be/${path}`,{waitUntil:'domcontentloaded'});
      await page.locator('.organizer-nav a').first().waitFor();
      const result=await page.evaluate(()=>({links:[...document.querySelectorAll('.family-header .organizer-nav a')].map(a=>({text:a.textContent,current:a.getAttribute('aria-current')})),styleLoaded:[...document.styleSheets].some(s=>s.href?.includes('organizer-nav.css')),scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}));
      console.log(path,width,response.status(),JSON.stringify(result));
      if (response.status()!==200 || result.links.length!==4 || result.links.filter(a=>a.current==='page').length!==1 || !result.styleLoaded || result.scrollWidth>width+1) process.exitCode=1;
      await page.locator('.family-header').screenshot({path:`tmp/organizer-nav-live-${path.replace('.','-')}-${width}.png`});
      await page.close();
    }
  }
} finally { await browser.close(); }
