const { chromium } = require('./tournament-ui-qa/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const live = process.argv.includes('--live');
const firstNames = [
  ['Sasha', 'Louka', 'Valentin', 'Yves', 'Aurélie'],
  ['Simon', 'Hugo', 'Samuel', 'Luca', 'Jippé'],
  ['Nicolas', 'Eloha', 'Pierre', 'Matteo', 'Corantyn'],
  ['Fiona', 'Antoine', 'Gaspard', 'Remy', 'Cyril'],
  ['Roland', 'Marie', 'Yanis', 'Alexandre', 'Jean-Mathieu'],
  ['Alexis', 'Sarah', 'Rémy', 'William', 'Marc'],
];

(async () => {
  const data = await fetch('https://www.andenne-bears.be/tournoi-public.php').then(response => response.json());
  if (!live) data.teams.forEach((team, index) => { team.players = firstNames[index]; });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (!live) {
        await page.route('**/journee-familiale.html*', route => route.fulfill({ path: path.join(root, 'journee-familiale.html'), contentType: 'text/html' }));
        await page.route('**/family-results.css*', route => route.fulfill({ path: path.join(root, 'family-results.css'), contentType: 'text/css' }));
        await page.route('**/scripts/family-results.js*', route => route.fulfill({ path: path.join(root, 'scripts/family-results.js'), contentType: 'application/javascript' }));
        await page.route('**/tournoi-public.php*', route => route.fulfill({ json: data }));
      }
      await page.goto('https://www.andenne-bears.be/journee-familiale.html?local-preview=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#family-results-ranking li:nth-child(6)', { timeout: 15000 });
      const result = await page.evaluate(() => ({
        ranks: document.querySelectorAll('#family-results-ranking li').length,
        matches: document.querySelectorAll('.family-results-match').length,
        rosters: document.querySelectorAll('.family-results-roster').length,
        players: document.querySelectorAll('.family-results-roster li').length,
        first: document.querySelector('#family-results-ranking li .family-results-team')?.textContent,
        titleHeight: Math.round(document.querySelector('#family-results-title').getBoundingClientRect().height),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      const memberPage = await browser.newPage({ viewport: { width, height: 900 } });
      await memberPage.goto('https://www.andenne-bears.be/membres.php?results-check=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
      result.oldMemberBlock = await memberPage.locator('.members-tournament-results').count();
      await memberPage.close();
      await page.locator('#resultats').screenshot({ path: path.join(root, 'tmp', `family-results-preview-${width}.png`) });
      console.log(JSON.stringify({ width, ...result, errors }));
      if (errors.length || result.overflow || result.ranks !== 6 || result.matches !== 18 || result.rosters !== 6 || result.players !== 30 || result.oldMemberBlock !== 0) process.exitCode = 1;
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
