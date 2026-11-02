(() => {
  let version = 0, polling = false, stopped = false;
  const notice = message => { $('#connection-status').hidden = !message; $('#connection-status').textContent = message; };
  const access = authenticated => { RO = VIEW || !authenticated; $('#bLogout').hidden = RO; render(); };
  const request = async (path, options = {}) => {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    let data;
    try { data = await response.json(); } catch { throw Object.assign(new Error('Live auction service is not available.'), { status: response.status }); }
    if (!response.ok) throw Object.assign(new Error(data.error || 'Live request failed.'), { status: response.status, data });
    return data;
  };
  function receive(state) {
    if (!state) return;
    version = state.v || 0;
    applyRemote(JSON.stringify(state));
  }
  async function poll() {
    if (polling || wBusy || stopped) return;
    polling = true;
    try {
      const data = await request('/api/auction');
      if (wBusy) return;
      if (data.state && (data.state.v || 0) >= version) receive(data.state);
      DBOK = true;
      notice(data.state ? '' : 'Waiting for the operator to publish the auction.');
      render();
    } catch (error) { DBOK = false; notice(error.message + ' Showing the last available auction.'); render(); }
    finally { polling = false; }
  }
  async function connect(authenticated) {
    window.auctionApiConnected = true;
    const data = await request('/api/auction');
    if (data.state) receive(data.state);
    else version = 0;
    DB = { doc: () => ({ set: async ({ json }) => {
      try {
        const result = await request('/api/auction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: JSON.parse(json), expectedVersion: version }) });
        version = result.state.v; S.v = version; lastJ = JSON.stringify(result.state); DBOK = true; notice('');
      } catch (error) {
        if (error.status === 401) access(false);
        if (error.status === 409 && error.data.state) { lastJ = ''; first = true; receive(error.data.state); }
        DBOK = false;
        throw error;
      }
    } }) };
    access(authenticated); DBOK = true;
    if (!data.state && canEdit()) await push();
    notice(data.state || canEdit() ? '' : 'Waiting for the operator to publish the auction.'); render();
  }
  $('#login-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.target.querySelector('button'); button.disabled = true;
    try {
      await request('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#operator-password').value }) });
      $('#operator-password').value = ''; $('#login-message').textContent = ''; await connect(true);
    } catch (error) { $('#login-message').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#bLogout').onclick = async () => {
    try { await request('/api/session', { method: 'DELETE' }); access(false); }
    catch (error) { notice(error.message); }
  };
  $('#bShare').onclick = async () => {
    const url = new URL('/watch', location.href).href;
    try { await navigator.clipboard.writeText(url); notice('Viewing link copied. Spectators can watch the auction and squads without editing.'); }
    catch { notice('Viewing link: ' + url); }
  };
  (async () => {
    try {
      const c = window.claude, db = c && await c.use('db');
      if (db) {
        const user = await c.use('user'); DB = db; access(user ? await user.canEdit() : false);
        db.doc('auction/state').onSnapshot(snapshot => { DBOK = true; if (snapshot.exists) applyRemote((snapshot.data() || {}).json); else if (canEdit()) push(); render(); }, () => { DBOK = false; notice('Live connection lost. Reconnecting is required for updates.'); render(); });
        return;
      }
      const session = await request('/api/session');
      await connect(session.authenticated);
      setInterval(poll, 2000);
      addEventListener('focus', poll);
      addEventListener('pagehide', () => { stopped = true; });
      addEventListener('pageshow', () => { stopped = false; poll(); });
    } catch (error) {
      if (!LOCAL) access(false);
      if (VIEW || !LOCAL) notice(error.message + ' Live updates are not connected.');
    }
  })();
})();
