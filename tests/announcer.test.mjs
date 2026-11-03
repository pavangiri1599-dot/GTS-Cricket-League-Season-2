import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile('assets/announcer.js', 'utf8');
const indian = { name: 'Installed Indian English', lang: 'en-IN', localService: true };
const english = { name: 'Installed English', lang: 'en-US', localService: true, default: true };
function setup(voices = [english, indian], available = true) {
  const spoken = [], events = {};
  let canceled = 0;
  class Utterance { constructor(text) { this.text = text; } }
  const synth = { getVoices: () => voices, speak: u => spoken.push(u), cancel: () => canceled++ };
  const window = available ? { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } : {};
  const announcer = runInNewContext(source + '\nauctionAnnouncer;', { window, SpeechSynthesisUtterance: Utterance, addEventListener: (name, fn) => { events[name] = fn; } });
  return { announcer, spoken, synth, events, get canceled() { return canceled; } };
}

test('sale speech uses player, winning team and the final price with an installed Indian English voice', () => {
  const f = setup();
  assert.equal(f.announcer.sold('Shubham Desai', 'Dhurandhar', 21000), true);
  assert.equal(f.spoken[0].text, 'Shubham Desai sold to Dhurandhar for twenty one thousand rupees.');
  assert.equal(f.spoken[0].voice, indian);
  assert.equal(f.spoken[0].lang, 'en-IN');
  assert.equal(f.spoken[0].volume, 1);
});

test('spoken prices use Indian rupee units and retain paise', () => {
  const f = setup();
  for (const [price, expected] of [
    [0, 'zero rupees'], [1, 'one rupee'], [20000, 'twenty thousand rupees'],
    [125000, 'one lakh twenty five thousand rupees'], [200000, 'two lakh rupees'],
    [10000000, 'one crore rupees'], [15000.5, 'fifteen thousand rupees and fifty paise'],
  ]) {
    assert.equal(f.announcer.sold('Player', 'Team A', price), true);
    assert.equal(f.spoken.at(-1).text, `Player sold to Team A for ${expected}.`);
  }
  assert.equal(f.announcer.sold('Player', 'Team A', NaN), false);
});

test('unavailable speech and remote-only voices allow the existing chime without using a remote service', () => {
  for (const f of [setup([], false), setup([]), setup([{ ...english, localService: false }])]) {
    assert.equal(f.announcer.sold('Player', 'Team A', 20000), false);
    assert.equal(f.spoken.length, 0);
    assert.doesNotThrow(() => f.announcer.stop());
  }
  const local = setup([english]);
  assert.equal(local.announcer.sold('Player', 'Team A', 20000), true);
  assert.equal(local.spoken[0].voice, english);
  const delayed = setup([]);
  delayed.synth.getVoices = () => [indian];
  assert.equal(delayed.announcer.sold('Player', 'Team A', 20000), true, 'newly loaded voices are picked up on the next sale');
});

test('muting, undo, navigation and subsequent announcements can cancel speech without playing error chimes', () => {
  const f = setup();
  let failures = 0;
  f.announcer.sold('First player', 'Team A', 20000, () => failures++);
  const first = f.spoken[0];
  f.announcer.stop();
  first.onerror({ error: 'interrupted' });
  assert.equal(failures, 0);
  f.announcer.sold('Second player', 'Team B', 10000, () => failures++);
  f.spoken[1].onerror({ error: 'not-allowed' });
  assert.equal(failures, 1, 'a real speech failure can play the normal chime');
  f.events.pagehide();
  assert.ok(f.canceled >= 3);
});
