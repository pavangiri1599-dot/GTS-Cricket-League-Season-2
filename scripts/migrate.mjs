import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Set MIGRATION_DATABASE_URL (direct connection) before applying the schema.');
const sql = neon(url);
await sql.query(await readFile(new URL('../migrations/0001_live_auction.sql', import.meta.url), 'utf8'));
console.log('Live auction schema is ready. Existing auction records were retained.');
