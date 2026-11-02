import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'gts_operator';
const MAX_BODY = 512 * 1024;
function digest(value) { return createHash('sha256').update(value).digest(); }
function equal(a, b) { return timingSafeEqual(digest(a), digest(b)); }
function sign(payload, password) { return createHmac('sha256', password).update(payload).digest('base64url'); }
function token(password) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return payload + '.' + sign(payload, password);
}
function authenticated(req, password) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!cookie || !password) return false;
  const [payload, signature, extra] = cookie.split('.');
  if (!payload || !signature || extra || !equal(signature, sign(payload, password))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url')).exp > Date.now(); } catch { return false; }
}
function originAllowed(req, local) {
  if (!req.headers.origin) return false;
  try {
    const origin = new URL(req.headers.origin);
    return origin.host === req.headers.host && (origin.protocol === 'https:' || local && origin.protocol === 'http:');
  } catch { return false; }
}
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Use application/json.'), { status: 415 });
  let raw = '';
  req.setEncoding?.('utf8');
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('Request too large.'), { status: 413 }); }
  if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('Request too large.'), { status: 413 });
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}
function validState(state) {
  return state && Array.isArray(state.teams) && state.teams.length > 0 && state.teams.length <= 8 && Array.isArray(state.players)
    && state.players.length <= 2000 && Array.isArray(state.sales) && state.cfg && typeof state.cfg.title === 'string'
    && Number.isFinite(state.cfg.purse) && Number.isFinite(state.cfg.squad);
}

export function createAuctionApi({ store, password, local = false }) {
  return async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!store || !password || password.length < 16) return send(503, { error: 'Live auction hosting is not configured yet.', configured: false });
      if (path === '/api/session') {
        if (req.method === 'GET') return send(200, { authenticated: authenticated(req, password), configured: true });
        if (!originAllowed(req, local)) return send(403, { error: 'Origin not allowed.' });
        if (req.method === 'DELETE') {
          res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${local ? '' : '; Secure'}`);
          return send(200, { authenticated: false });
        }
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
        const input = await body(req);
        if (typeof input.password !== 'string' || input.password.length > 1024 || !equal(input.password, password)) return send(401, { error: 'Incorrect operator password.' });
        res.setHeader('Set-Cookie', `${COOKIE}=${token(password)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200${local ? '' : '; Secure'}`);
        return send(200, { authenticated: true });
      }
      if (path !== '/api/auction') return send(404, { error: 'Not found.' });
      if (req.method === 'GET') {
        const state = await store.read();
        return send(200, { state });
      }
      if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      // The server checks permission independently of every spectator UI flag.
      if (!authenticated(req, password)) return send(401, { error: 'Operator login required.' });
      if (!originAllowed(req, local)) return send(403, { error: 'Origin not allowed.' });
      const input = await body(req);
      if (!validState(input.state) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) return send(400, { error: 'Invalid auction state.' });
      const state = await store.write(input.state, input.expectedVersion);
      if (!state) return send(409, { error: 'Auction changed in another operator session. Latest state loaded; retry your action.', state: await store.read() });
      return send(200, { state });
    } catch (error) {
      if (error.status) return send(error.status, { error: error.message });
      console.error('Auction API failure:', error.name || 'Error');
      send(503, { error: 'Live auction storage is unavailable. Please retry.' });
    }
  };
}
