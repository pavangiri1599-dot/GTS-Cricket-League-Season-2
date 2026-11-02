import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createAuctionApi } from '../server/auction-api.mjs';
import { serve } from '../scripts/serve.mjs';

const password = 'isolated-test-password-123456789';
function memoryStore() {
  let value = null;
  return {
    async read() { return structuredClone(value); },
    async write(state, expectedVersion) {
      if ((value?.v || 0) !== expectedVersion) return null;
      value = structuredClone({ ...state, v: expectedVersion + 1 });
      return structuredClone(value);
    },
  };
}
const fixture = { cfg: { title: 'Test auction', purse: 200000, squad: 11 }, teams: [{ id: 0, name: 'Team A' }], players: [], sales: [] };
async function host(apiHandler) {
  const server = await serve(0, { apiHandler });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('server rejects unauthenticated writes, forged sessions, cross-origin requests, and stale versions', async () => {
  const store = memoryStore();
  const server = await host(createAuctionApi({ store, password, local: true }));
  try {
    const request = (path, method = 'GET', data, cookie, origin = server.base) => fetch(server.base + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    assert.equal((await request('/api/auction', 'POST', { state: fixture, expectedVersion: 0 })).status, 401);
    assert.equal((await request('/api/session', 'POST', { password: 'wrong' })).status, 401);
    assert.equal((await request('/api/session', 'POST', { password }, undefined, 'https://example.invalid')).status, 403);
    const login = await request('/api/session', 'POST', { password });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    const write = await request('/api/auction', 'POST', { state: fixture, expectedVersion: 0 }, cookie);
    assert.equal(write.status, 200);
    assert.equal((await write.json()).state.v, 1);
    const publicRead = await request('/api/auction');
    assert.equal(publicRead.status, 200);
    assert.equal((await publicRead.json()).state.cfg.title, 'Test auction');
    assert.equal((await request('/api/auction', 'POST', { state: fixture, expectedVersion: 0 }, cookie)).status, 409);
    assert.equal((await request('/api/auction', 'POST', { state: fixture, expectedVersion: 1 }, cookie + 'forged')).status, 401);
    assert.equal((await request('/api/auction', 'POST', { state: fixture, expectedVersion: 1 }, cookie, 'https://example.invalid')).status, 403);
    assert.equal((await store.read()).v, 1, 'failed requests must not change auction state');
    assert.equal((await request('/api/session', 'DELETE', undefined, cookie)).status, 200);
  } finally { await server.close(); }
});

test('unconfigured hosting fails closed', async () => {
  const server = await host(createAuctionApi({ store: null, password: '' }));
  try {
    const response = await fetch(server.base + '/api/session');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).configured, false);
  } finally { await server.close(); }
});

test('spectators in a separate browser receive live bids and cannot edit or persist changes', async () => {
  const store = memoryStore();
  const server = await host(createAuctionApi({ store, password, local: true }));
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const operator = await browser.newContext();
    const spectator = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await operator.route('https://fonts.googleapis.com/**', route => route.abort());
    await spectator.route('https://fonts.googleapis.com/**', route => route.abort());
    const admin = await operator.newPage();
    await admin.goto(server.base + '/auth');
    await admin.locator('#operator-password').fill(password);
    await admin.locator('#login-form button').click();
    await admin.waitForFunction(() => !RO && DBOK);
    const viewer = await spectator.newPage();
    const errors = [];
    viewer.on('pageerror', e => errors.push(e.message));
    await viewer.goto(server.base + '/watch');
    await viewer.waitForFunction(() => RO && DBOK);
    assert.equal(await viewer.locator('#bids').isHidden(), true);
    assert.equal(await viewer.locator('nav [data-v="setup"]').isHidden(), true);
    await admin.evaluate(() => {
      mute = true;
      const player = S.players.find(p => p.name === 'Nilesh Shinde');
      S.cur = { pid: player.id, bid: player.base, lead: null, hist: [] };
      save(); render();
    });
    await admin.locator('#bids [data-i="5"]').click();
    await viewer.waitForFunction(() => S.cur?.lead === 5);
    assert.equal(await viewer.locator('[data-leading-team]').textContent(), 'Dhurandhar');
    const original = await viewer.evaluate(() => JSON.stringify(S));
    await viewer.evaluate(() => { bid(0); sold(); unsold(); draw(); undoBid(); undoSale(); rowAct({ dataset: { a: 'allpool' } }); save(); });
    await viewer.keyboard.press('1');
    await viewer.keyboard.press('s');
    assert.equal(await viewer.evaluate(() => JSON.stringify(S)), original);
    assert.equal(await viewer.evaluate(() => localStorage.getItem(K)), null, 'watch page must not write the operator browser storage');
    const forbidden = await spectator.request.post(server.base + '/api/auction', { headers: { Origin: server.base }, data: { state: await viewer.evaluate(() => S), expectedVersion: (await store.read()).v } });
    assert.equal(forbidden.status(), 401);
    await viewer.goto(server.base + '/');
    await viewer.waitForFunction(() => RO && DBOK);
    assert.equal(await viewer.locator('#bids').isHidden(), true, 'removing /watch must not grant write access');
    assert.deepEqual(errors, []);
    await operator.close(); await spectator.close();
  } finally { await browser?.close(); await server.close(); }
});

test('deployment has explicit spectator/auth routes and excludes secrets from static output', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.ok(config.rewrites.some(route => route.source === '/watch'));
  assert.ok(config.rewrites.some(route => route.source === '/auth'));
  assert.equal(existsSync('dist/.env.local'), false);
  assert.equal(existsSync('dist/server'), false);
});
