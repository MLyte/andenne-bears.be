const { chromium } = require('./tournament-ui-qa/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://www.andenne-bears.be/membres.php?deploy=20261026', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => document.querySelectorAll('#members-tournament-list li').length === 6, { timeout: 15000 });
      const result = await page.evaluate(() => ({
        current: document.querySelector('#members-current-title')?.textContent,
        archived: document.querySelector('#members-archived-title')?.textContent,
        ranking: [...document.querySelectorAll('#members-tournament-list li')].map(item => item.textContent),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }));
      console.log(JSON.stringify({ width, ...result, errors }));
      if (errors.length || result.horizontalOverflow || result.ranking.length !== 6) process.exitCode = 1;
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
