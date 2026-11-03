import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

let browser, server, base;
before(async () => {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  await mkdir('test-results', { recursive: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function open(viewport = { width: 375, height: 812 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The page must remain usable if external fonts are unavailable.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto(base);
  await page.locator('#teams .tc').first().waitFor();
  await page.locator('#bAccess').click();
  await page.locator('#operator-password').fill('GTS 26');
  await page.locator('#login-form button').click();
  await page.waitForFunction(() => !RO);
  return { context, page, errors };
}

async function checkLayout(page, label) {
  const issues = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      issues.push(`page overflows ${document.documentElement.scrollWidth}/${innerWidth}`);
      for (const el of document.querySelectorAll('#stage *, #bids *, #teams *')) {
        if (el.checkVisibility() && el.scrollWidth > el.clientWidth + 2) issues.push(`overflow source: ${el.id || el.tagName} ${el.textContent.slice(0, 100)}`);
      }
    }
    for (const el of document.querySelectorAll('#ttl, #brand-logo, #pname, .sl b, h3, [data-player-name], #teams b, #bids b, [data-leading-team], [data-leading-owners], [data-result-card]')) {
      if (!el.checkVisibility()) continue;
      const rect = el.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1) issues.push(`outside viewport: ${el.textContent}; parent=${el.parentElement.id || el.parentElement.className}; bounds=${rect.left},${rect.right}`);
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) issues.push(`clipped: ${el.textContent}`);
    }
    for (const el of document.querySelectorAll('button, input, select')) {
      if (!el.checkVisibility()) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < 43) issues.push(`small control: ${el.textContent || el.getAttribute('data-f')} (${rect.height})`);
    }
    return issues;
  });
  assert.deepEqual(issues, [], label);
}

test('all views reflow on phones, tablets, desktop, and landscape without changing player data', async () => {
  const { context, page, errors } = await open();
  const players = await page.evaluate(() => JSON.stringify(S.players));
  for (const [width, height] of [[320, 740], [375, 812], [390, 844], [768, 1024], [900, 700], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const view of ['auction', 'squads', 'players', 'unsold', 'setup']) {
      await page.locator(`nav [data-v="${view}"]`).click();
      await checkLayout(page, `${view} at ${width}×${height}`);
      const visible = await page.locator('section:visible').count();
      assert.equal(visible, 1, 'only the active view occupies layout space');
      if (width === 375 && view === 'squads' || width === 1440 && view === 'auction') {
        await page.waitForTimeout(180);
        await page.screenshot({ path: `test-results/${view}-${width}.png`, fullPage: view === 'auction' });
      }
    }
  }
  assert.equal(await page.evaluate(() => JSON.stringify(S.players)), players, 'layout/navigation must preserve player records');
  assert.deepEqual(errors, []);
  await context.close();
});

test('draw, bid, undo, sold, unsold and result dismissal work on mobile', async () => {
  const { context, page, errors } = await open();
  await page.locator('#bMute').click();
  await page.locator('#bDraw').click();
  await page.waitForFunction(() => !!S.cur && !reeling);
  await checkLayout(page, 'drawn player');
  const name = await page.locator('#pname').textContent();
  await page.screenshot({ path: 'test-results/auction-live-375.png', fullPage: true });
  await page.locator('#bids [data-i="0"]').click();
  assert.equal(await page.locator('.team-leading').count(), 1);
  await page.locator('#bids [data-i="1"]').click();
  await page.locator('#bUb').click();
  assert.equal(await page.evaluate(() => S.cur.lead), 0);
  await page.locator('#bSold').click();
  await page.locator('[data-result-card]').waitFor();
  assert.match(await page.locator('[data-result-card]').textContent(), /SOLD!/);
  assert.ok((await page.locator('[data-result-card]').textContent()).includes(name));
  assert.equal(await page.evaluate(() => document.querySelector('#app').inert), true);
  await checkLayout(page, 'sold result');
  await page.screenshot({ path: 'test-results/sold-375.png' });
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-close-result]').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ov').isHidden(), true);
  assert.equal(await page.evaluate(() => document.querySelector('#app').inert), false);
  await page.locator('#bUs').click();
  assert.equal(await page.locator('#pname').textContent(), name);
  await page.locator('#bUns').click();
  assert.match(await page.locator('[data-result-card]').textContent(), /UNSOLD/);
  await page.locator('[data-close-result]').click();
  await page.locator('nav [data-v="unsold"]').click();
  assert.equal(await page.locator('.player-row').count(), 1);
  await page.locator('[data-a="rel"]').click();
  assert.equal(await page.locator('.player-row').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('long names wrap in squads, player editor, auction, and results; saved edits survive reload', async () => {
  const { context, page, errors } = await open({ width: 320, height: 740 }, { reducedMotion: 'reduce' });
  const longName = 'Anshuman Mukherjee With A Very Long Player Name';
  await page.locator('nav [data-v="players"]').click();
  await page.locator('.player-row [data-f="name"]').first().fill(longName);
  await page.locator('.player-row [data-f="name"]').first().press('Tab');
  assert.equal(await page.locator('[data-player-name]').first().textContent(), longName);
  await page.reload();
  assert.equal(await page.locator('.player-row [data-f="name"]').first().inputValue(), longName);
  await page.locator('nav [data-v="squads"]').click();
  assert.equal(await page.locator('.sl b').first().textContent(), longName);
  await checkLayout(page, 'long roster name');
  await page.screenshot({ path: 'test-results/long-name-320.png', fullPage: true });
  await page.locator('nav [data-v="players"]').click();
  await page.locator('.player-row [data-a="now"]').first().click();
  await checkLayout(page, 'long auction name');
  await page.locator('#bids [data-i="0"]').click();
  await page.locator('#bSold').click();
  await checkLayout(page, 'long result name');
  await page.setViewportSize({ width: 740, height: 320 });
  await checkLayout(page, 'landscape result');
  await page.locator('[data-close-result]').click();
  assert.deepEqual(errors, []);
  await context.close();
});

test('presentation has a touch exit; display and read-only modes render usable screens', async () => {
  const { context, page } = await open();
  await page.locator('#bPres').click();
  assert.equal(await page.locator('#nav').isHidden(), true);
  await page.locator('#bExitPres').click();
  assert.equal(await page.locator('#nav').isVisible(), true);
  await page.goto(base + '/#display');
  await page.reload();
  await checkLayout(page, 'display mode');
  assert.equal(await page.locator('#bids').isHidden(), true);
  const ro = await context.newPage();
  await ro.goto(base + '/watch');
  await ro.waitForFunction(() => document.body.classList.contains('ro'));
  assert.equal(await ro.locator('#bids').isHidden(), true);
  await ro.locator('nav [data-v="squads"]').click();
  await checkLayout(ro, 'read-only squads');
  assert.equal(await ro.locator('.sl .x:visible').count(), 0);
  await context.close();
});

test('larger text and unbroken names remain readable without horizontal scrolling', async () => {
  const { context, page } = await open({ width: 375, height: 812 });
  await page.evaluate(() => {
    S.players[0].name = 'VeryLongUnbrokenPlayerName'.repeat(3);
    S.teams[0].name = 'VeryLongUnbrokenTeamName'.repeat(3);
    document.documentElement.style.fontSize = '200%';
    render();
  });
  for (const view of ['auction', 'squads', 'players', 'setup']) {
    await page.locator(`nav [data-v="${view}"]`).click();
    await checkLayout(page, `${view} with 200% text`);
  }
  await context.close();
});

test('both HTML entry points stay identical and use the compiled Tailwind asset', async () => {
  assert.equal(await readFile('index.html', 'utf8'), await readFile('GTS Cricket League Season 2.html', 'utf8'));
  const { context, page } = await open();
  await page.goto(base + '/GTS%20Cricket%20League%20Season%202.html');
  await page.locator('#teams .tc').first().waitFor();
  assert.equal(await page.locator('#stage').evaluate(el => getComputedStyle(el).display), 'flex');
  await context.close();
});

test('eleven-slot squads and team/owner headings appear across the interface', async () => {
  const { context, page } = await open();
  assert.equal(await page.evaluate(() => S.cfg.squad), 11);
  const labels = ['Team A (Tejas & Rohit)', 'Team B (Avneesh & Vinay)', 'YODDHAS (Manmohan, Nahas & Priya Singh)', 'Team D (Rakshit & Pallavi)', 'Ruffryderz (Ashutosh & Alok)', 'Dhurandhar (Sudip & Kunal)'];
  assert.deepEqual(await page.locator('#bids b').allTextContents(), labels);
  assert.deepEqual(await page.locator('#teams b').allTextContents(), labels);
  await page.locator('nav [data-v="squads"]').click();
  assert.deepEqual(await page.locator('h3').allTextContents(), labels);
  assert.equal(await page.locator('.sl').count(), 66);
  await page.locator('nav [data-v="setup"]').click();
  assert.equal(await page.locator('#sS').inputValue(), '11');
  assert.match(await page.locator('#sTe').inputValue(), /Dhurandhar, Sudip & Kunal/);
  await page.evaluate(() => build({ ...S.cfg }, $('#sTe').value, $('#sPl').value));
  assert.equal(await page.evaluate(() => S.teams[2].owner), 'Manmohan, Nahas & Priya Singh', 'commas in owner names must survive setup parsing');
  assert.equal(await page.evaluate(() => S.teams[2].color), '#ffd54a');
  await context.close();
});

test('existing saved and shared-browser auctions gain new team labels and slots without changing players or bids', async () => {
  const { context, page, errors } = await open();
  const legacy = await page.evaluate(() => {
    const state = structuredClone(S);
    delete state.teamSetupVersion;
    state.cfg.squad = 8;
    const names = ['Tejas & Rohit', 'Avneesh & Vinay', 'Manmohan', 'Rakshit & Pallavi', 'Ashutosh & Alok', 'Sudip'];
    state.teams.forEach((t, i) => { t.name = names[i]; t.owner = 'Icon: original player'; });
    state.cur = { pid: 11, bid: 2000, lead: 5, hist: [[5, 2000]] };
    state.sales = [];
    localStorage.setItem(K, JSON.stringify(state));
    return state;
  });
  await page.reload();
  const migrated = await page.evaluate(() => S);
  assert.equal(migrated.cfg.squad, 11);
  assert.deepEqual(migrated.players, legacy.players);
  assert.deepEqual(migrated.cur, legacy.cur);
  assert.deepEqual(migrated.sales, legacy.sales);
  assert.equal(migrated.teams[5].name, 'Dhurandhar');
  assert.equal(migrated.teams[5].owner, 'Sudip & Kunal');
  await page.evaluate(state => applyStoredState(JSON.stringify({ ...state, v: 100 })), legacy);
  assert.equal(await page.evaluate(() => S.cfg.squad), 11);
  assert.equal(await page.evaluate(() => S.teams[0].name), 'Team A');
  assert.deepEqual(await page.evaluate(() => S.players), legacy.players);
  const custom = structuredClone(legacy);
  custom.cfg.squad = 12;
  custom.teams[0].name = 'Custom Team';
  custom.teams[0].owner = 'Custom Owner';
  await page.evaluate(state => applyStoredState(JSON.stringify({ ...state, v: 101 })), custom);
  assert.equal(await page.evaluate(() => S.cfg.squad), 12);
  assert.equal(await page.evaluate(() => S.teams[0].name), 'Custom Team');
  await page.evaluate(() => {
    S.teams[2].name = 'Team C'; S.teams[2].owner = 'Manmohan'; S.teamSetupVersion = 1;
    S.teams[4].name = 'Team E';
    save();
  });
  await page.reload();
  assert.equal(await page.evaluate(() => S.teams[2].name), 'YODDHAS');
  assert.equal(await page.evaluate(() => S.teams[4].name), 'Ruffryderz');
  assert.deepEqual(await page.evaluate(() => S.players), legacy.players);
  assert.deepEqual(await page.evaluate(() => S.cur), legacy.cur);
  assert.equal(await page.evaluate(() => S.teams[2].owner), 'Manmohan, Nahas & Priya Singh', 'already migrated auctions must repair the truncated owner label');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the eleventh acquisition fills a squad and further bidding is blocked', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    const team = S.teams[0];
    while (tp(team).length < 10) {
      const player = S.players.find(p => p.team === -1);
      player.team = 0; player.price = 1000; player.st = 's'; S.sales.push(player.id);
    }
    const player = S.players.find(p => p.team === -1);
    S.cur = { pid: player.id, bid: player.base, lead: null, hist: [] };
    render();
  });
  assert.equal(await page.locator('#bids [data-i="0"]').isEnabled(), true);
  await page.locator('#bids [data-i="0"]').click();
  await page.locator('#bSold').click();
  assert.equal(await page.evaluate(() => tp(S.teams[0]).length), 11);
  await page.locator('[data-close-result]').click();
  await page.locator('#bDraw').click();
  await page.waitForFunction(() => !!S.cur && !reeling);
  assert.equal(await page.locator('#bids [data-i="0"]').isDisabled(), true);
  assert.match(await page.locator('#bids [data-i="0"]').textContent(), /Squad full/);
  await context.close();
});

test('Dhurandhar sale announcement names the player, winning team, owners and price on mobile and desktop', async () => {
  const { context, page } = await open();
  await page.locator('#bMute').click();
  await page.locator('#bDraw').click();
  await page.waitForFunction(() => !!S.cur && !reeling);
  const name = await page.locator('#pname').textContent();
  await page.locator('#bids [data-i="5"]').click();
  const price = await page.evaluate(() => fmt(S.cur.bid));
  await page.locator('#bSold').click();
  const result = page.locator('[data-result-card]');
  assert.ok((await result.textContent()).includes(`${name} has been sold to`));
  assert.equal(await page.locator('[data-result-team]').textContent(), 'Dhurandhar');
  assert.match(await result.textContent(), /\(Sudip & Kunal\)/);
  assert.equal(await page.locator('[data-result-price]').textContent(), price);
  for (const [width, height] of [[320, 740], [375, 812], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await checkLayout(page, `professional sale result at ${width}`);
    await page.screenshot({ path: `test-results/dhurandhar-sold-${width}.png` });
  }
  await context.close();
});

test('the current leading team is prominent and changes on bids and undo without a history strip', async () => {
  const { context, page } = await open();
  await page.evaluate(() => {
    mute = true;
    const player = S.players.find(p => p.name === 'Nilesh Shinde');
    S.cur = { pid: player.id, bid: player.base, lead: null, hist: [] };
    render();
  });
  assert.match(await page.locator('#lead').textContent(), /Waiting for the first bid/);
  await page.locator('#bids [data-i="3"]').click();
  assert.equal(await page.locator('[data-leading-team]').textContent(), 'Team D');
  assert.equal(await page.locator('[data-leading-owners]').textContent(), '(Rakshit & Pallavi)');
  await page.locator('#bids [data-i="5"]').click();
  assert.equal(await page.locator('[data-leading-team]').textContent(), 'Dhurandhar');
  await page.locator('#bUb').click();
  assert.equal(await page.locator('[data-leading-team]').textContent(), 'Team D');
  assert.equal(await page.locator('#hist').count(), 0);
  assert.equal(await page.evaluate(() => S.cur.hist.length), 1, 'bid history remains available for undo');
  for (const [width, height] of [[320, 740], [375, 812], [768, 1024], [1440, 900], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const size = await page.locator('[data-leading-team]').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(size >= 36, 'leading team should use a large display font');
    await checkLayout(page, `large leading team at ${width}`);
  }
  await page.evaluate(() => {
    S.teams[3].name = 'LongUnbrokenLeadingTeamName'.repeat(3);
    S.teams[3].owner = 'An owner with a much longer name and another owner';
    document.documentElement.style.fontSize = '200%';
    render();
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await checkLayout(page, 'enlarged text and a long leading team');
  await page.locator('#bUb').click();
  assert.match(await page.locator('#lead').textContent(), /Waiting for the first bid/);
  await context.close();
});

test('SOLD speaks once with the final amount, respects mute during results, and stops on undo', async () => {
  const { context, page, errors } = await open();
  await page.evaluate(() => {
    window.spokenSales = []; window.speechStops = 0;
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    speechSynthesis.getVoices = () => [{ name: 'Test local voice', lang: 'en-IN', localService: true }];
    speechSynthesis.speak = utterance => window.spokenSales.push(utterance.text);
    speechSynthesis.cancel = () => window.speechStops++;
    const p = S.players.find(p => p.name === 'Shubham Desai');
    S.cur = { pid: p.id, bid: 21000, lead: 5, hist: [[5, 21000]] };
    render();
  });
  await page.locator('#bSold').click();
  assert.deepEqual(await page.evaluate(() => window.spokenSales), ['Shubham Desai sold to Dhurandhar for twenty one thousand rupees.']);
  await page.evaluate(() => { render(); render(); });
  assert.equal(await page.evaluate(() => window.spokenSales.length), 1, 'rendering the result again must not repeat narration');
  const beforeMute = await page.evaluate(() => window.speechStops);
  await page.keyboard.press('m');
  assert.equal(await page.evaluate(() => mute), true);
  assert.ok(await page.evaluate(before => window.speechStops > before, beforeMute), 'mute must interrupt speech while the dialog is open');
  await page.locator('[data-close-result]').click();
  const beforeUndo = await page.evaluate(() => window.speechStops);
  await page.locator('#bUs').click();
  assert.ok(await page.evaluate(before => window.speechStops > before, beforeUndo));
  await page.locator('#bSold').click();
  assert.equal(await page.evaluate(() => window.spokenSales.length), 1, 'a muted sale must not speak');
  await page.reload();
  assert.equal(await page.locator('[data-result-card]').count(), 0, 'refresh must not replay a sale');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the header logo loads locally and the new league title upgrades saved and shared-browser auctions', async () => {
  const { context, page } = await open();
  const title = 'GTS Cricket League Season 2';
  assert.equal(await page.locator('#ttl').textContent(), title);
  await page.locator('#brand-logo').evaluate(img => img.decode());
  const image = await page.locator('#brand-logo').evaluate(img => ({ loaded: img.complete && img.naturalWidth > 0, ratio: img.getBoundingClientRect().width / img.getBoundingClientRect().height }));
  assert.equal(image.loaded, true);
  assert.ok(Math.abs(image.ratio - 2) < .05, 'logo proportions should be preserved');
  const response = await page.request.get(base + '/assets/globe-teleservices-logo.jpg');
  assert.equal(response.status(), 200);
  assert.match(response.headers()['content-type'], /image\/jpeg/);
  assert.deepEqual(await readFile('assets/globe-teleservices-logo.jpg'), await readFile('dist/assets/globe-teleservices-logo.jpg'));
  const before = await page.evaluate(() => {
    S.cfg.title = 'GTS PREMIER LEAGUE';
    S.cur = { pid: 11, bid: 3000, lead: 5, hist: [[5, 3000]] };
    localStorage.setItem(K, JSON.stringify(S));
    return structuredClone(S);
  });
  await page.reload();
  assert.equal(await page.locator('#ttl').textContent(), title);
  assert.deepEqual(await page.evaluate(() => S.players), before.players);
  assert.deepEqual(await page.evaluate(() => S.cur), before.cur);
  assert.deepEqual(await page.evaluate(() => S.sales), before.sales);
  await page.evaluate(state => applyStoredState(JSON.stringify({ ...state, v: 100 })), before);
  assert.equal(await page.locator('#ttl').textContent(), title);
  await page.locator('nav [data-v="setup"]').click();
  assert.equal(await page.locator('#sT').inputValue(), title);
  await context.close();
});
