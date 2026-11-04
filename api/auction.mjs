import { configured, hasValidSession, readJson, readState, sendJson, writeState } from './_shared.mjs';

export default async function handler(req, res) {
  if (!configured()) return sendJson(res, 503, { error: 'Live auction is not configured.' });
  try {
    if (req.method === 'GET') {
      const current = await readState();
      if (!current) { res.status(204).end(); return; }
      return sendJson(res, 200, current);
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
    if (!hasValidSession(req)) return sendJson(res, 401, { error: 'Operator authentication required.' });
    const { state } = await readJson(req);
    if (!state || !Array.isArray(state.teams) || !Array.isArray(state.players)) return sendJson(res, 400, { error: 'Invalid auction state.' });
    const current = await readState();
    const next = { version: (current?.version || 0) + 1, state, updatedAt: Date.now() };
    await writeState(next);
    return sendJson(res, 200, { version: next.version, updatedAt: next.updatedAt });
  } catch {
    return sendJson(res, 502, { error: 'Unable to reach shared auction storage.' });
  }
}
