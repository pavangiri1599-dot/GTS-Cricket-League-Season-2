import { pgTable, integer, jsonb } from 'drizzle-orm/pg-core';

export const auctionState = pgTable('gts_auction_state', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
  state: jsonb('state').notNull(),
});
