// Speech uses installed device voices only; no remote voice service is selected.
const auctionAnnouncer = (() => {
  const synth = window.speechSynthesis;
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  let current = null;
  function words(n) {
    if (n < 20) return small[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + small[n % 10] : '');
    for (const [size, label] of [[10000000, 'crore'], [100000, 'lakh'], [1000, 'thousand'], [100, 'hundred']]) {
      if (n >= size) return words(Math.floor(n / size)) + ' ' + label + (n % size ? ' ' + words(n % size) : '');
    }
  }
  function rupees(amount) {
    const totalPaise = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) return null;
    const whole = Math.floor(totalPaise / 100), paise = totalPaise % 100;
    return words(whole) + (whole === 1 ? ' rupee' : ' rupees') + (paise ? ' and ' + words(paise) + (paise === 1 ? ' paisa' : ' paise') : '');
  }
  function stop() {
    current = null;
    try { synth?.cancel(); } catch { }
  }
  function sold(playerName, teamName, price, onError) {
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    try {
      const english = synth.getVoices().filter(v => v.localService === true && /^en(?:[-_]|$)/i.test(v.lang));
      const voice = english.find(v => /^en[-_]IN$/i.test(v.lang)) || english.find(v => v.default) || english[0];
      const amount = rupees(price);
      if (!voice || !amount) return false;
      stop();
      const utterance = new SpeechSynthesisUtterance(`${playerName} sold to ${teamName} for ${amount}.`);
      utterance.voice = voice; utterance.lang = voice.lang;
      utterance.rate = 0.95; utterance.pitch = 1; utterance.volume = 1;
      utterance.onend = () => { if (current === utterance) current = null; };
      utterance.onerror = event => {
        if (current !== utterance) return;
        current = null;
        if (!['canceled', 'interrupted'].includes(event.error)) onError?.();
      };
      current = utterance; synth.speak(utterance);
      return true;
    } catch { current = null; return false; }
  }
  // Request the voice list early: some browsers populate it asynchronously.
  try { synth?.getVoices(); } catch { }
  addEventListener('pagehide', stop);
  return { sold, stop };
})();
