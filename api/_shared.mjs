import { createHmac, timingSafeEqual } from 'node:crypto';

const STATE_KEY = 'gts-cricket-league:auction:v1';
const COOKIE_NAME = 'gts_auction_operator';

export function configured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN && process.env.AUCTION_ADMIN_PASSWORD && process.env.AUCTION_AUTH_SECRET);
}

function signature(value) {
  return createHmac('sha256', process.env.AUCTION_AUTH_SECRET).update(value).digest('base64url');
}

export function makeSession() {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const value = String(expires);
  return `${value}.${signature(value)}`;
}

export function hasValidSession(req) {
  const cookie = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!cookie) return false;
  const [expires, received] = cookie.split('.');
  if (!expires || !received || Number(expires) < Date.now()) return false;
  const expected = signature(expires);
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function sessionCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`;
}

export async function readState() {
  const response = await fetch(`${process.env.KV_REST_API_URL}/get/${STATE_KEY}`, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  if (!response.ok) throw new Error('KV read failed');
  const { result } = await response.json();
  return result ? JSON.parse(result) : null;
}

export async function writeState(value) {
  const response = await fetch(`${process.env.KV_REST_API_URL}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify([['SET', STATE_KEY, JSON.stringify(value)]])
  });
  if (!response.ok) throw new Error('KV write failed');
}

export function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const parts = [];
  for await (const part of req) parts.push(part);
  return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
}
