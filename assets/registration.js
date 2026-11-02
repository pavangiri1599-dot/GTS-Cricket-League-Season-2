const registrationKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const registrationByName = new Map(REGISTERED_PLAYER_DATA.players.map(p => [registrationKey(p.name), p]));
const registrationFields = record => ({
  registrationKey: registrationKey(record.name),
  registrationNumber: record.number,
  gender: record.gender,
  registeredRole: record.role,
  registered: true,
});

function migrateRegisteredPlayers(state) {
  if (state.registeredPlayersRevision === REGISTERED_PLAYER_DATA.revision) return false;
  const existing = new Map(state.players.map(p => [p.registrationKey || registrationKey(p.name), p]));
  let nextId = Math.max(-1, ...state.players.map(p => p.id)) + 1;
  const matched = new Set();
  for (const record of REGISTERED_PLAYER_DATA.players) {
    const key = registrationKey(record.name);
    let player = existing.get(key);
    if (!player) {
      player = { id: nextId++, team: -1, price: 0, st: 'p' };
      state.players.push(player);
    }
    matched.add(player.id);
    // Current bid amounts, sold prices, team assignments and all stable IDs remain intact.
    const active = state.cur?.pid === player.id;
    Object.assign(player, registrationFields(record), { name: record.name, cat: record.category, f: record.gender === 'Female' });
    if (active && Number.isFinite(player.base)) {
      if (player.base !== record.base) player.pendingRegistrationBase = record.base;
    } else { player.base = record.base; delete player.pendingRegistrationBase; }
  }
  state.players = state.players.filter(player => {
    if (matched.has(player.id)) return true;
    const active = state.cur?.pid === player.id || state.ev?.pid === player.id || (state.sales || []).includes(player.id);
    // Remove only the unused, obsolete placeholder from the previous built-in list.
    if (registrationKey(player.name) === 'kunal mittal' && player.team < 0 && player.st === 'p' && !active) return false;
    player.registered = false;
    return true;
  });
  state.registeredPlayersRevision = REGISTERED_PLAYER_DATA.revision;
  return true;
}

function finishRegistrationPrice(player) {
  if (Number.isFinite(player.pendingRegistrationBase)) {
    player.base = player.pendingRegistrationBase;
    delete player.pendingRegistrationBase;
  }
}
