import { createAuctionApi } from '../server/auction-api.mjs';
import { createStore } from '../server/store.mjs';

let handler;
export default function auction(req, res) {
  handler ||= createAuctionApi({ store: process.env.DATABASE_URL ? createStore(process.env.DATABASE_URL) : null, password: process.env.AUCTION_ADMIN_PASSWORD });
  return handler(req, res);
}
