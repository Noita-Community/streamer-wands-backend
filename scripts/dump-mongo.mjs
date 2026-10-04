// Dump the `streamers` collection of the MongoDB database the site ran on before sqlite, as
// JSON. That file is the input for importing existing streamers into the sqlite database.
//
// Run from the project root on a host that is on the Mongo IP allowlist:
//   node scripts/dump-mongo.mjs [out-file]
//
// Reads the connection string from DATABASE in .env, in the project root.
// Output defaults to test/fixtures/mongo-streamers.json. It contains every streamer's data
// and is gitignored.
//
// This script, and its `mongodb` and `dotenv` dev dependencies, have no use once the import
// has been done.

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

const withSnapshot = rows.filter((r) => Array.isArray(r.wands) && r.wands.length > 0).length;
console.log(`db=${db.databaseName} streamers=${rows.length} with_wands=${withSnapshot} -> ${out}`);

await client.close();
