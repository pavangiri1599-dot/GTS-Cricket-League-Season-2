import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

let browser, server, base, imported;
before(async () => {
  imported = JSON.parse(JSON.stringify(runInNewContext(await readFile('assets/registered-players.js', 'utf8') + '\nREGISTERED_PLAYER_DATA;')));
  server = await serve(0); base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function open() {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/auth');
  await page.locator('#operator-password').fill('GTS 26');
  await page.locator('#login-form button').click();
  return { context, page, errors };
}

test('all fifty-four registrations and source fields load with the category prices', async () => {
  const { context, page, errors } = await open();
  const players = await page.evaluate(() => S.players);
  assert.equal(imported.players.length, 54);
  assert.equal(players.length, 54);
  assert.equal(new Set(players.map(p => p.name)).size, 54);
  for (const record of imported.players) {
    const player = players.find(p => p.name === record.name);
    assert.ok(player, record.name);
    assert.equal(player.gender, record.gender, record.name);
    assert.equal(player.registeredRole, record.role, record.name);
    assert.equal(player.cat, record.category, record.name);
    assert.equal(player.base, record.base, record.name);
    assert.equal(player.registrationNumber, record.number, record.name);
    assert.equal(player.f, record.gender === 'Female', record.name);
  }
  assert.equal(players.filter(p => p.f).length, 8);
  assert.equal(players.find(p => p.name === 'Rohit Singh').cat, 'Owner');
  assert.equal(players.find(p => p.name === 'Vishal Tiwari').cat, 'Icon');
  assert.equal(players.find(p => p.name === "Larry D'Cruz").cat, 'Batsman');
  assert.equal(players.find(p => p.name === 'Nilesh Shinde').cat, 'New Player');
  assert.equal(players.find(p => p.name === 'Pallavi Kudtarkar').registeredRole, 'All Rounder/Owner');
  assert.equal(players.find(p => p.name === 'Pallavi Kudtarkar').base, 15000);
  assert.equal(players.find(p => p.name === 'Payal Gurung').gender, 'Female');
  assert.equal(players.find(p => p.name === 'Payal Gurung').base, 2000);
  assert.equal(players.find(p => p.name === 'Amit Nagarkoti').gender, 'Male');
  assert.equal(players.find(p => p.name === 'Amit Nagarkoti').cat, 'New Player');
  assert.equal(players.find(p => p.name === 'Amit Nagarkoti').base, 5000);
  assert.equal(players.find(p => p.name === 'Yash Sonawane').gender, 'Male');
  assert.equal(players.find(p => p.name === 'Yash Sonawane').cat, 'All Rounder');
  assert.equal(players.find(p => p.name === 'Yash Sonawane').base, 20000);
  assert.equal(players.find(p => p.name === 'Abhinav Parab').gender, 'Male');
  assert.equal(players.find(p => p.name === 'Abhinav Parab').cat, 'Bowler');
  assert.equal(players.find(p => p.name === 'Abhinav Parab').base, 10000);
  assert.equal(players.some(p => p.name === 'Kunal Mittal'), false);
  assert.equal(await page.evaluate(() => S.cfg.squad), 11);
  await page.locator('nav [data-v="players"]').click();
  assert.equal(await page.locator('.player-row').count(), 54);
  assert.ok((await page.locator('.player-row').filter({ has: page.locator('[data-player-name]', { hasText: 'Khyati Modi' }) }).textContent()).includes('Female'));
  await page.locator('nav [data-v="setup"]').click();
  await page.evaluate(() => build({ ...S.cfg }, $('#sTe').value, $('#sPl').value));
  const roundTrip = await page.evaluate(() => S.players);
  assert.equal(roundTrip.length, 54);
  assert.equal(roundTrip.find(p => p.name === 'Pallavi Kudtarkar').f, true);
  assert.equal(roundTrip.find(p => p.name === 'Amit Nagarkoti').registeredRole, 'New Player');
  assert.deepEqual(errors, []);
  await context.close();
});

test('registration updates old saved pools while retaining stable IDs, bids, sold assignments and spending', async () => {
  const { context, page, errors } = await open();
  const before = await page.evaluate(() => {
    const state = structuredClone(S);
    delete state.registeredPlayersRevision;
    state.players = state.players.filter(p => !['Khyati Modi', 'Payal Gurung', 'Amit Nagarkoti'].includes(p.name));
    state.players.push({ id: 99, name: 'Kunal Mittal', cat: 'New Player', base: 5000, team: -1, price: 0, st: 'p', f: false });
    const active = state.players.find(p => p.name === 'Rohan Bhanushali');
    active.cat = 'Batsman'; active.base = 15000;
    state.cur = { pid: active.id, bid: 17000, lead: 3, hist: [[3, 17000]] };
    const sold = state.players.find(p => p.name === "Larry D'Cruz");
    sold.cat = 'Batsman'; sold.team = 2; sold.price = 27000; sold.st = 's';
    state.sales = [sold.id];
    const rohit = state.players.find(p => p.name === 'Rohit Singh'); rohit.cat = 'Icon'; rohit.base = 40000;
    localStorage.setItem(K, JSON.stringify(state));
    return state;
  });
  await page.reload();
  const updated = await page.evaluate(() => S);
  assert.equal(updated.players.length, 54);
  assert.deepEqual(updated.cur, before.cur);
  assert.deepEqual(updated.sales, before.sales);
  for (const old of before.players.filter(p => p.name !== 'Kunal Mittal')) {
    const player = updated.players.find(p => p.name === old.name);
    assert.equal(player.id, old.id, old.name);
    assert.equal(player.team, old.team, old.name);
    assert.equal(player.price, old.price, old.name);
    assert.equal(player.st, old.st, old.name);
  }
  assert.equal(updated.players.find(p => p.name === 'Rohan Bhanushali').base, 15000, 'retain an in-progress auction opening base');
  assert.equal(updated.players.find(p => p.name === 'Rohit Singh').cat, 'Owner');
  assert.equal(updated.players.find(p => p.name === 'Rohit Singh').price, 30000, 'registration import must not rewrite an existing fixed price');
  assert.equal(await page.evaluate(() => pl(S.cur.pid).name), 'Rohan Bhanushali');
  assert.equal(await page.evaluate(() => pl(S.sales[0]).price), 27000);
  assert.equal(await page.evaluate(() => spent(S.teams[2])), 97000);
  await page.locator('#bSold').click();
  assert.equal(await page.evaluate(() => S.players.find(p => p.name === 'Rohan Bhanushali').base), 5000, 'the source base takes effect once the in-progress auction finishes');
  await page.locator('[data-close-result]').click();
  await page.locator('#bUs').click();
  assert.equal(await page.locator('#pname').textContent(), 'Rohan Bhanushali');
  const again = await page.evaluate(() => JSON.stringify(S));
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.stringify(S)), again, 'reloading must not apply the registration twice');
  assert.deepEqual(errors, []);
  await context.close();
});

test('players 51 through 54 join an existing registered auction pool once without changing auction progress', async () => {
  const { context, page, errors } = await open();
  const before = await page.evaluate(() => {
    S.players = S.players.filter(p => !['Shubham Desai', 'Vikas Tripathi', 'Yash Sonawane', 'Abhinav Parab'].includes(p.name));
    S.registeredPlayersRevision = 'e979f91f6c1565c1';
    const active = S.players.find(p => p.name === 'Rohan Bhanushali');
    S.cur = { pid: active.id, bid: 17000, lead: 3, hist: [[3, 17000]] };
    const sold = S.players.find(p => p.name === "Larry D'Cruz");
    sold.team = 2; sold.price = 27000; sold.st = 's';
    S.sales = [sold.id];
    save();
    return structuredClone(S);
  });
  await page.reload();
  const updated = await page.evaluate(() => S);
  assert.equal(updated.players.length, 54);
  assert.deepEqual(updated.players.slice(0, before.players.length), before.players);
  assert.deepEqual(updated.cur, before.cur);
  assert.deepEqual(updated.sales, before.sales);
  for (const [name, number, category, basePrice] of [
    ['Shubham Desai', 51, 'All Rounder', 20000],
    ['Vikas Tripathi', 52, 'Bowler', 10000],
    ['Yash Sonawane', 53, 'All Rounder', 20000],
    ['Abhinav Parab', 54, 'Bowler', 10000],
  ]) {
    const player = updated.players.find(p => p.name === name);
    assert.ok(player, name);
    assert.equal(player.registrationNumber, number);
    assert.equal(player.gender, 'Male');
    assert.equal(player.registeredRole, category);
    assert.equal(player.cat, category);
    assert.equal(player.base, basePrice);
    assert.equal(player.team, -1);
    assert.equal(player.price, 0);
    assert.equal(player.st, 'p');
  }
  await page.reload();
  assert.deepEqual(await page.evaluate(() => S), updated);
  assert.deepEqual(errors, []);
  await context.close();
});

test('an obsolete player with auction activity is retained rather than deleting referenced history', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    delete S.registeredPlayersRevision;
    S.players.push({ id: 200, name: 'Kunal Mittal', cat: 'New Player', base: 5000, team: 1, price: 9000, st: 's', f: false });
    S.sales.push(200);
    save();
  });
  await page.reload();
  assert.equal(await page.evaluate(() => pl(200).price), 9000);
  assert.equal(await page.evaluate(() => pl(200).registered), false);
  assert.equal(await page.evaluate(() => S.sales.includes(200)), true);
  assert.equal(await page.evaluate(() => S.players.filter(p => p.registered).length), 54);
  await context.close();
});
