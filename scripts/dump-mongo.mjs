// One-off: dump the Mongo `streamers` collection to JSON for the sqlite migration.
//
// Run from the project root on a host that is on the Mongo IP allowlist:
//   node scripts/dump-mongo.mjs [out-file]
//
// Reads DATABASE from .env (same file the old app uses, via dotenv).
// Output defaults to test/fixtures/mongo-streamers.json, relative to the project root.
//
// Uses the `mongodb` driver already present in node_modules from the old app.
// Written for the migration only; delete with the rest of the Mongo code in Phase 5.

import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';

const uri = process.env.DATABASE;
if (!uri) {
  console.error('DATABASE is not set; expected it in .env in the project root');
  process.exit(1);
}

const out = resolve(process.argv[2] ?? 'test/fixtures/mongo-streamers.json');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
await client.connect();

const db = client.db();
const streamers = await db.collection('streamers').find({}).toArray();

// Normalise for the migration: id as string, drop Mongo bookkeeping.
const rows = streamers.map(({ _id, __v, ...doc }) => ({
  ...doc,
  id: String(doc.id),
}));

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(rows, null, 2) + '\n');

const withSnapshot = rows.filter(r => Array.isArray(r.wands) && r.wands.length > 0).length;
console.log(`db=${db.databaseName} streamers=${rows.length} with_wands=${withSnapshot} -> ${out}`);

await client.close();
