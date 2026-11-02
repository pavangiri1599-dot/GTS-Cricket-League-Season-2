import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const executablePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const server = await serve(0);
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  // A temporary profile keeps these captures separate from real auction data.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(() => {
    mute = true;
    const player = S.players.find(p => p.name === 'Nilesh Shinde');
    S.cur = { pid: player.id, bid: player.base, lead: null, hist: [] };
    render();
    [4, 2, 4, 3, 2, 4, 3].forEach(bid);
  });
  await mkdir('docs/images', { recursive: true });
  await page.screenshot({ path: 'docs/images/auction-desktop.png', fullPage: true });
  await page.locator('#stage').screenshot({ path: 'docs/images/leading-team.png' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#stage').screenshot({ path: 'docs/images/auction-mobile.png' });
  await page.locator('nav [data-v="squads"]').click();
  await page.locator('#v-squads > div > div').first().screenshot({ path: 'docs/images/squad-mobile.png' });
  await page.locator('nav [data-v="auction"]').click();
  await page.locator('#bSold').click();
  await page.locator('[data-result-card]').waitFor();
  await page.screenshot({ path: 'docs/images/sold-mobile.png' });
  await context.close();
  console.log('Saved five UI screenshots to docs/images/.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
