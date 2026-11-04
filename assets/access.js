(() => {
  // The password is verified by the server when live sharing is configured.
  const EDIT_PASSWORD = 'GTS 26';
  const notice = message => { $('#connection-status').hidden = !message; $('#connection-status').textContent = message; };

  function unlock() {
    if (VIEW) return;
    editingUnlocked = true; RO = false; authOpen = false; LV = null;
    try { sessionStorage.setItem(EDIT_SESSION_KEY, 'yes'); } catch (e) { }
    $('#operator-password').value = ''; $('#login-message').textContent = '';
    if (!['auction', 'squads', 'players', 'setup'].includes(S.view)) S.view = 'auction';
    save(); render();
    if (S.view === 'setup') fillSetup();
  }
  function lock() {
    if (reeling) { clearInterval(reelTimer); reelTimer = null; reeling = false; }
    editingUnlocked = false; RO = true; authOpen = false; LV = null;
    try { sessionStorage.removeItem(EDIT_SESSION_KEY); } catch (e) { }
    $('#operator-password').value = ''; $('#login-message').textContent = '';
    $('#v-players').replaceChildren(); $('#v-setup').replaceChildren();
    render();
  }
  $('#bAccess').onclick = () => {
    if (canEdit()) lock();
    else { authOpen = !authOpen; render(); if (authOpen) $('#operator-password').focus(); }
  };
  $('#login-form').onsubmit = async event => {
    event.preventDefault();
    if (VIEW) return;
    const password = $('#operator-password').value.trim();
    if (password !== EDIT_PASSWORD) {
      $('#login-message').textContent = 'Incorrect password. Try again.';
      $('#operator-password').value = ''; $('#operator-password').focus();
      return;
    }
    if (liveAvailable !== false) {
      try {
        const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        if (!response.ok) throw new Error('Authentication unavailable');
      } catch (e) {
        $('#login-message').textContent = 'Live authentication is unavailable. Check the deployment setup.';
        return;
      }
    }
    unlock();
  };
  $('#bShare').onclick = async () => {
    const url = new URL(location.href);
    if (url.protocol === 'file:') { url.hash = 'display'; url.search = ''; }
    else { url.pathname = '/auth'; url.hash = ''; url.search = ''; }
    const explanation = ' Anyone with this link can watch the live auction; editing still requires the operator password.';
    try { await navigator.clipboard.writeText(url.href); notice('Live auction link copied.' + explanation); }
    catch { notice('Live auction link: ' + url.href + explanation); }
  };
  if (VIEW) notice('Display mode follows the shared live auction.');
  render();
})();
