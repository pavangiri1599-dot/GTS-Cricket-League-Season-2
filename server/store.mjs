import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import { auctionState } from './schema.mjs';

export function createStore(databaseUrl) {
  const db = drizzle({ client: neon(databaseUrl) });
  return {
    async read() {
      const [row] = await db.select().from(auctionState).where(eq(auctionState.id, 1));
      return row?.state || null;
    },
    async write(state, expectedVersion) {
      const version = expectedVersion + 1;
      const next = { ...state, v: version };
      const values = { id: 1, version, state: next };
      const rows = expectedVersion === 0
        ? await db.insert(auctionState).values(values).onConflictDoNothing().returning()
        : await db.update(auctionState).set(values).where(and(eq(auctionState.id, 1), eq(auctionState.version, expectedVersion))).returning();
      return rows[0]?.state || null;
    },
  };
}
