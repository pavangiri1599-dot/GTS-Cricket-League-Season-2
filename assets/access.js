(() => {
  // This is a client-side convenience lock, not server-side authentication.
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
  $('#login-form').onsubmit = event => {
    event.preventDefault();
    if (VIEW) return;
    if ($('#operator-password').value.trim() !== EDIT_PASSWORD) {
      $('#login-message').textContent = 'Incorrect password. Try again.';
      $('#operator-password').value = ''; $('#operator-password').focus();
      return;
    }
    unlock();
  };
  $('#bShare').onclick = async () => {
    const url = new URL(location.href);
    if (url.protocol === 'file:') { url.hash = 'display'; url.search = ''; }
    else { url.pathname = '/watch'; url.hash = ''; url.search = ''; }
    const explanation = ' Viewing follows other tabs in this browser; updates are not shared across devices.';
    try { await navigator.clipboard.writeText(url.href); notice('Viewing link copied.' + explanation); }
    catch { notice('Viewing link: ' + url.href + explanation); }
  };
  if (VIEW) notice('This view follows the auction in other tabs of this browser. Updates are not shared across devices.');
  render();
})();
