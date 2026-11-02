import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = process.cwd();
export function serve(port = 4173, { apiHandler } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.startsWith('/api/') && apiHandler) { await apiHandler(req, res); return; }
      const file = resolve(root, '.' + (['/', '/watch', '/auth'].includes(pathname) ? '/index.html' : pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' })[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/serve.mjs')) {
  let apiHandler;
  if (process.env.DATABASE_URL && process.env.AUCTION_ADMIN_PASSWORD) {
    const { createStore } = await import('../server/store.mjs');
    const { createAuctionApi } = await import('../server/auction-api.mjs');
    apiHandler = createAuctionApi({ store: createStore(process.env.DATABASE_URL), password: process.env.AUCTION_ADMIN_PASSWORD, local: true });
  }
  const server = await serve(4173, { apiHandler });
  console.log(`Local: http://127.0.0.1:${server.address().port}`);
}
