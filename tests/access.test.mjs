import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

let browser, server, base;
before(async () => {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });

async function open(path = '/') {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const page = await context.newPage();
  const errors = [], apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  await page.goto(base + path);
  return { context, page, errors, apiRequests };
}
async function unlock(page, password = 'GTS 26') {
  if (await page.locator('#auth-panel').isHidden()) await page.locator('#bAccess').click();
  await page.locator('#operator-password').fill(password);
  await page.locator('#login-form button').click();
}

test('viewing is the default and incorrect passwords cannot enable editing', async () => {
  const { context, page, errors, apiRequests } = await open();
  assert.equal(await page.evaluate(() => RO), true);
  assert.equal(await page.locator('#bids').isHidden(), true);
  assert.equal(await page.locator('nav [data-v="setup"]').isHidden(), true);
  const before = await page.evaluate(() => JSON.stringify(S));
  await unlock(page, 'wrong-password');
  assert.match(await page.locator('#login-message').textContent(), /Incorrect password/);
  await page.evaluate(() => { bid(0); sold(); unsold(); draw(); undoBid(); undoSale(); rowAct({ dataset: { a: 'allpool' } }); save(); });
  await page.keyboard.press('Escape');
  await page.locator('#ttl').click();
  await page.keyboard.press('n');
  assert.equal(await page.evaluate(() => JSON.stringify(S)), before);
  assert.equal(await page.evaluate(() => localStorage.getItem(K)), null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem(EDIT_SESSION_KEY)), null);
  assert.ok(apiRequests.some(url => url.endsWith('/api/auction')));
  assert.deepEqual(errors, []);
  await context.close();
});

test('GTS 26 unlocks all controls, survives refresh and locks without losing the auction', async () => {
  const { context, page, errors, apiRequests } = await open('/auth');
  const players = await page.evaluate(() => JSON.stringify(S.players));
  await unlock(page);
  assert.equal(await page.evaluate(() => canEdit()), true);
  assert.equal(await page.locator('nav [data-v="setup"]').isVisible(), true);
  assert.equal(await page.locator('#bids').isVisible(), true);
  await page.evaluate(() => { mute = true; const player = S.players.find(p => p.name === 'Nilesh Shinde'); S.cur = { pid: player.id, bid: player.base, lead: null, hist: [] }; save(); render(); });
  await page.locator('#bids [data-i="2"]').click();
  const current = await page.evaluate(() => JSON.stringify(S.cur));
  await page.reload();
  assert.equal(await page.evaluate(() => canEdit()), true);
  assert.equal(await page.evaluate(() => JSON.stringify(S.cur)), current);
  assert.equal(await page.evaluate(() => JSON.stringify(S.players)), players);
  assert.equal(await page.locator('#operator-password').inputValue(), '');
  await page.locator('#bAccess').click();
  assert.equal(await page.evaluate(() => RO), true);
  await page.evaluate(() => { bid(0); sold(); });
  assert.equal(await page.evaluate(() => JSON.stringify(S.cur)), current);
  await page.reload();
  assert.equal(await page.evaluate(() => RO), true);
  assert.equal(await page.evaluate(() => JSON.stringify(S.cur)), current);
  await unlock(page);
  await page.locator('#bSold').click();
  assert.match(await page.locator('[data-result-card]').textContent(), /SOLD!/);
  assert.ok(apiRequests.some(url => url.endsWith('/api/auction')));
  assert.deepEqual(errors, []);
  await context.close();
});

test('watch stays view-only even with an editing flag, while display tabs receive this browser’s changes', async () => {
  const { context, page, errors } = await open();
  await unlock(page);
  const view = await context.newPage();
  await view.addInitScript(() => sessionStorage.setItem('gts-editing-unlocked-v1', 'yes'));
  await view.goto(base + '/?view=1');
  assert.equal(await view.evaluate(() => canEdit()), false);
  assert.equal(await view.locator('#bAccess').isHidden(), true);
  assert.equal(await view.locator('#bids').isHidden(), true);
  assert.equal(await view.locator('#connection-status').isHidden(), true);
  await page.evaluate(() => { mute = true; const player = S.players.find(p => p.name === 'Nilesh Shinde'); S.cur = { pid: player.id, bid: player.base, lead: null, hist: [] }; save(); render(); });
  await page.locator('#bids [data-i="5"]').click();
  await view.waitForFunction(() => S.cur?.lead === 5);
  assert.equal(await view.locator('[data-leading-team]').textContent(), 'Dhurandhar');
  await view.evaluate(() => { sold(); bid(0); });
  assert.equal(await view.evaluate(() => S.cur.lead), 5);
  await page.evaluate(() => { build({ ...S.cfg, title: 'Restarted local auction' }, T0, P0); save(); render(); });
  await view.waitForFunction(() => S.cfg.title === 'Restarted local auction');
  assert.equal(await view.evaluate(() => S.cur), null, 'resetting an auction must also refresh a display with a newer old version');
  const otherContext = await browser.newContext();
  await otherContext.route('https://fonts.googleapis.com/**', route => route.abort());
  const unrelated = await otherContext.newPage();
  await unrelated.goto(base + '/?view=1');
  assert.equal(await unrelated.evaluate(() => S.cur), null, 'a separate browser must not falsely appear to have live updates');
  assert.deepEqual(errors, []);
  await otherContext.close(); await context.close();
});

test('locking during a draw cancels it and retains all players', async () => {
  const { context, page } = await open();
  await unlock(page);
  const original = await page.evaluate(() => JSON.stringify(S.players));
  await page.locator('#bDraw').click();
  await page.locator('#bAccess').click();
  await page.waitForTimeout(2100);
  assert.equal(await page.evaluate(() => RO && !reeling && S.cur === null), true);
  assert.equal(await page.evaluate(() => JSON.stringify(S.players)), original);
  await context.close();
});

test('static build has no database/API dependencies and no old live client', async () => {
  const config = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(config.dependencies?.['@neondatabase/serverless'], undefined);
  assert.equal(config.dependencies?.['drizzle-orm'], undefined);
  assert.equal(config.scripts['db:migrate'], undefined);
  assert.equal(existsSync('api/auction.mjs'), true);
  assert.equal(existsSync('dist/assets/live.js'), false);
  const { context, page, apiRequests } = await open('/auth');
  assert.equal((await context.request.get(base + '/api/session')).status(), 404);
  await unlock(page);
  assert.equal(await page.evaluate(() => canEdit()), true);
  assert.ok(apiRequests.some(url => url.endsWith('/api/auction')));
  await context.close();
});
