import { configured, makeSession, sendJson, sessionCookie, readJson } from './_shared.mjs';

export default async function handler(req, res) {
  if (!configured()) return sendJson(res, 503, { error: 'Live auction is not configured.' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { password } = await readJson(req);
    if (password !== process.env.AUCTION_ADMIN_PASSWORD) return sendJson(res, 401, { error: 'Incorrect password.' });
    res.setHeader('Set-Cookie', sessionCookie(makeSession()));
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 400, { error: 'Invalid request.' });
  }
}
