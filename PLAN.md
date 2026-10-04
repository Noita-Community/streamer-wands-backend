# Streamer Wands rewrite plan

Status: draft 4, 2026-10-04. Edit freely; this is the working document for the rewrite.

## The system in one sentence

The game dumps a snapshot of the player's state to the server every few seconds, and the server hands that snapshot to whoever is watching. Everything else (login, the download page, the viewer page) exists to support that.

## Goals

- Keep the mod and every installed copy of it working without changes in v1. Existing `token.lua` tickets must stay valid.
- Replace Mongo with `node:sqlite`. Replace Express, Passport, Pug, Vue 2, dotenv and friends with Node built-ins and plain DOM code.
- Drop unnecessary dependencies, not dependencies as such. See Dependency posture.
- Deploy as a Docker image with explicit, visible configuration.
- Make the code small enough that a new contributor can read all of it in an afternoon.

## Non-goals for v1

- Changing the mod's Lua or its wire format. The payload shape is fungible in v2; for v1 it stays identical for compatibility.
- Visual redesign of the viewer page. It should look the same as https://onlywands.com/streamer/DunkOrSlam.
- Converting base64 sprites in the data files to real images. Possible later phase.

## Reference points in the current code

`main` is what is deployed. Three files define the payload:

| File | Role |
|---|---|
| `mod/files/scripts/utils.lua` `serialize_data()` | Producer. What actually arrives on the wire. This is the schema. |
| `handlers/wandHandler.js` `validate()` | Remaps the wire shape into a Vue-friendly shape and fills defaults for older mod versions. The remapping goes away; the version-upgrade intent stays. |
| `public/main.js` | Consumer. Shows what each field is for and how it is decoded for display. |

Other files worth reading once: `wss.js` (socket routing), `controllers/wsController.js` (broadcast and persist), `routes/index.js` (bundle download), `lib/noitastats.js` (stats decrypt), `handlers/passportHandler.js` (login and ticket minting).

## Payload schema

The wire shape, as the Lua emits it, **is** the schema. The server stores it and serves it unchanged, and the viewer page reads it directly. The current server's positional-to-named remapping (`wands[i][0]` to `wands[i].stats`, `playerInfo.perks` to `names` and `amounts`, `csShifts` to `shifts`, and so on) existed to make Vue templates easier to write and goes away. Any decoding the page needs (splitting shift strings, parsing `start`, computing idle time) is the page's job.

### Top level

| Key | Type | Notes |
|---|---|---|
| `wands` | `[stats, always_cast, deck][]` | see below |
| `inventory` | `string[]` | `ACTION_ID_#charges`, `"0"` for an empty slot |
| `items` | `string[]` | item ids, `"0"` for an empty slot |
| `progress` | `[perks[], spells[], enemies[], pillars[]]` | all `string[]` of ids |
| `runInfo` | object | see below |
| `apothInfo` | object | absent without Apotheosis. See below. **Current bug:** the validator reads `data.apothinfo` (lowercase), so production never serves it and creature shifts never display. Serving the payload as is fixes this for free. |
| `playerInfo` | object | see below |
| `modFeatures` | object | see below |
| `modVersion` | string | from the injected `version.lua` |

### `wands[]`

Each wand is a three-element array: `[stats, always_cast, deck]`. `always_cast` and `deck` are `string[]` in the same `ACTION_ID_#charges` encoding as `inventory`, with `"0"` for empty deck slots. `stats`:

| Key | Type | Notes |
|---|---|---|
| `sprite` | string | a path like `data/items_gfx/wands/wand_0001.png`. The page reduces it to the basename without extension to look up the sprite. |
| `ui_name` | string | |
| `shuffle_deck_when_empty` | boolean | |
| `mana_max`, `mana_charge_speed`, `reload_time`, `actions_per_round`, `deck_capacity`, `spread_degrees`, `speed_multiplier`, `fire_rate_wait` | number | |

### `runInfo`

| Key | Type | Present when |
|---|---|---|
| `mods` | `string[]` | always |
| `beta` | boolean | always |
| `ngp` | number | `modFeatures.ngp` |
| `seed` | number | `modFeatures.seed` |
| `start` | string, comma-separated UTC date parts, may be empty | always |
| `playtime` | number, seconds | always |

The current server computes `idletime` from `start`, `playtime` and the clock at receive time. The page can compute this itself and keep it ticking, which is better than a value frozen at the last snapshot.

### `playerInfo`

| Key | Type | Present when | Notes |
|---|---|---|---|
| `health` | `[hp, max_hp]` as **strings** | always | strings on purpose, to carry `inf` and `nan`. Page multiplies by 25 and handles the special cases. |
| `gold` | number | always | |
| `orbs` | number | always | |
| `pos` | `[x, y]` | `modFeatures.pos` | |
| `perks` | `[names[], amounts[]]` | always | parallel arrays, most recent first |
| `shiftsTotal` | number | always | |
| `shiftsList` | `string[]` | `modFeatures.shifts` | one entry per shift, `"empty"` if unknown. Entries are `id%@%Display Name` joined by `<,>`. |
| `shiftsTimer` | number, `-1` when expired | `modFeatures.timer` | |

### `apothInfo`

| Key | Type | Present when | Notes |
|---|---|---|---|
| `csTotal` | number | always (when Apotheosis) | |
| `csTimer` | number | `modFeatures.apothCreatureTimer` | |
| `csShifts` | `string[]` | `modFeatures.apothCreatureShifts` | same encoding as `shiftsList` |

### `modFeatures`

Booleans `seed`, `pos`, `ngp`, `shifts`, `timer`, `apothCreatureTimer`, `apothCreatureShifts`. Lua emits `ModSettingGet` results; `nil` vanishes from the JSON, so a missing key means `false`. The page keys off these to decide what to show, so a feature being off and a key being absent are the same thing.

### Broadcast envelope

Viewers currently receive the snapshot wrapped with `type: "wands"`. The new page is written at the same time as the new server, so the envelope is ours to choose. Simplest: the websocket sends the same JSON the `/api/streamer/:name` endpoint returns.

### Validation stance

The streamer is authenticated, so the server does not defend against hostile payloads in depth. It does need to:

- Reject non-JSON and non-objects.
- Cap frame size. A few hundred KB is generous.
- Upgrade older payloads to the current wire shape, see below.

Everything else is the page's responsibility. The page must tolerate missing or malformed fields and render what it can; a bad wand should not blank the page.

The defaults and type coercions in the current validator exist to **migrate older mod payloads forward**, not to express intended values. Streamers run whatever mod version they last downloaded, so the server always sees a mix of payload versions. `schema.ts` is therefore a type definition for the current wire shape plus an upgrade step that brings older payloads to it (fill in what an older mod did not send, re-encode what it sent differently). Right now the only known differences between versions are absent keys, so the upgrade step is close to empty; it exists so that when v2 changes the wire format it is the one place that grows.

Fixtures are generated from this schema: vanilla minimal, vanilla all features on, Apotheosis all features on, plus edge cases (`inf` health, `"empty"` shifts, missing optional keys, empty `start`). Real captures are checked against them when available but are not blocking.

## Authentication

Requirement: only the Twitch user producing the data may submit updates for that user's page. Nothing else needs auth. Viewers are anonymous.

There are two separate mechanisms in the current code and the word "ticket" only refers to the second:

1. **Website login.** Twitch OAuth establishes who is talking to the site. Today that is a Passport session in Mongo.
2. **Websocket authentication.** At login the server signs a JWT `{ id, displayName }` and bakes it into the downloaded mod as `token.lua`. When the mod connects, the JWT in the URL path is what the server checks to decide whether to accept the socket and which streamer it belongs to. That is the whole "ticket" dance.

### v1: compatible

- Websocket authentication stays exactly as is: HS256 JWT with payload `{ id, displayName, iat }` signed with `JWT_SECRET`, no expiry, verified from the URL path on upgrade. Reimplement with `node:crypto`. Must verify tokens minted by the current server, since every installed mod carries one.
- `id` is Twitch's string id and stays a string. Internally everything keys on it: the socket a mod opens, the viewers subscribed to it, the database row. See Identity and names for how a viewer URL resolves to an id.
- Website login: Twitch OAuth with two `fetch` calls, then an HMAC-signed cookie holding `{ id }`. No server-side session store. Request no scopes; `/helix/users` with the user's token returns `id`, `login` and `display_name`, all of which are written to the row.
- Store the OAuth grant. Even with no scopes, Twitch issues an access token and a refresh token at login, and Twitch policy requires apps to validate user tokens hourly while in use. Keeping the grant is what lets us later detect that a user has disconnected the app from their account. The columns exist in v1 so the data is there; the sweeper that uses them is later work.
- The `tokens` collection only caches the last-minted JWT for `/auth/ticket`. The JWT is deterministic from id and name plus the signing time, so re-minting on demand serves the same purpose. Drop the collection. `JWT_REFRESH_SECRET` is unused in practice and goes away.

### Identity and names

A Twitch account has three identifiers and the server needs all of them:

| | Example | Properties |
|---|---|---|
| `id` | `"12345678"` | stable, opaque, the only key used internally |
| `login` | `"dunkorslam"` | unique, lowercase, can change when the user renames. Treat as an opaque string: do not validate its characters. The rules can change, and some Twitch staff accounts have logins that break the rules for ordinary users. |
| `display_name` | `"DunkOrSlam"` or `"配信者"` | either the login with the user's preferred casing, or a localised name in another script. Japanese users exist and matter. |

Rules:

- The URL a viewer visits is a name, never an id: `/streamer/<name>`. That is the public contract and stays.
- Resolution tries `login` first (compare lowercased), then `display_name` (compare case-insensitively), and yields an id. From there everything is by id. Unresolved names get the "no such streamer" page.
- Both names are refreshed from `/helix/users` at every website login and stored on the row. The mod's JWT carries only `displayName`, which may be stale; the row is authoritative and the token is used only to find the id.
- Migration: Mongo has only `name`, which is the display name at last login. Store it as `display_name` and leave `login` null until that user next logs in. No derivation: guessing a login from a display name means encoding Twitch's naming rules, and the case-insensitive display name lookup already makes every migrated user reachable at the URL they have today.
- Renames: a user who renames and logs in again gets the new names on the same row. Old URLs stop resolving, as they do today.

Tables:

```sql
streamers (
  id            TEXT PRIMARY KEY,
  login         TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  snapshot      TEXT,
  updated_at    INTEGER
);
CREATE INDEX streamers_display_name ON streamers (display_name COLLATE NOCASE);

twitch_grants (
  streamer_id        TEXT PRIMARY KEY REFERENCES streamers(id),
  access_token       TEXT NOT NULL,
  refresh_token      TEXT NOT NULL,
  expires_at         INTEGER NOT NULL,
  scopes             TEXT NOT NULL,      -- empty string today
  granted_at         INTEGER NOT NULL,
  last_validated_at  INTEGER,
  revoked_at         INTEGER
);
```

A streamer row without a grant row is a migrated user who has not logged in since. Tokens are secrets; the backup procedure and any log output must treat the grants table accordingly.

### Later: name resolution and grant validation

Not v1, recorded so the schema above does not have to change:

- **Name resolution via the API.** The login and display name stored at login are a snapshot. With an app access token (client credentials), `/helix/users?login=` and `?id=` can resolve names live. Uses: resolving a URL that does not match any row (a renamed streamer), and detecting conflicts such as one login appearing against two ids, in which case the API answer wins and the rows are corrected. Probably unnecessary in the long term, since users log in again whenever they download a new bundle.
- **In-memory LRU cache** in front of name resolution, so a link posted in chat that many viewers click at once costs one lookup. Small, bounded, short TTL.
- **Grant validation sweeper.** Twitch requires hourly validation of user tokens while in use. A periodic job calls `/oauth2/validate` for each stored grant, refreshes expired access tokens with the refresh token, records `last_validated_at`, and sets `revoked_at` when Twitch reports the grant is gone (user disconnected the app). What a revoked grant means for the streamer's page and websocket is a product decision for that phase.

### Later: revisit after the compatible release

Authentication design is deliberately out of scope until v1 is live. Notes to pick up then: the JWT could be replaced by something simpler now that the server owns both ends; display name should come from the database row rather than the token so renames work; any change costs each streamer a redownload and so needs a transition period where both forms are accepted.

## Dependency posture

The goal is to remove dependencies that do trivial work or duplicate Node built-ins, and to keep a library wherever the work is non-trivial and a hand-rolled version would be worse. Regex is not a parser. Writing zip structures by hand is not a reasonable use of anyone's time.

| Need | Decision | Reason |
|---|---|---|
| Websocket server | keep `ws` | Node has a client but no server |
| Zip read and inject | library: `fflate` (or keep `jszip`) | binary format with CRCs, central directory, streaming. `fflate` is small and dependency-free; `jszip` already works and is acceptable if streaming the response is easier with it. |
| XML parsing for the stats file | library: `fast-xml-parser` (or keep `htmlparser2`) | real parser, handles escaping and attribute edge cases the regex version in the TS branch does not. `fast-xml-parser` is dependency-free; `htmlparser2` pulls four transitive packages. |
| HTTP routing, static files, cookies, sessions | built-ins | the routing table is six routes; `node:http` plus a small matcher is enough |
| Multipart upload | built-in `Response.formData()` | one small file, one field |
| JWT HS256 | built-in `node:crypto` | sign and verify are a few lines; no header variants, no algorithms list to get wrong because we only ever accept HS256 |
| Twitch OAuth and Helix API | built-in `fetch`, thin hand-written client | the surface is four endpoints: authorize redirect, token exchange and refresh, `/oauth2/validate`, `/helix/users`. `twurple` was considered and rejected: our use is too thin to justify it. This is a place where roll-our-own is the simpler option. |
| Config | built-in | explicit, see Configuration |
| Database | built-in `node:sqlite` | |
| Templating | none | one page needs login state and a list; a template literal and an escape helper |
| Frontend framework | none | small snapshot, full re-render every few seconds is fine |
| Type checking | dev: `typescript` | `tsc --noEmit` only; Node strips types at runtime |
| Tests | built-in `node:test` | |

Expected runtime dependencies: `ws`, `fflate`, `fast-xml-parser`. If something else in this list turns out to be non-trivial in practice, add a library rather than fight it; update this table when that happens.

## Target architecture

```
mod/                      unchanged Lua mod
server/
  main.ts                 wire everything up, listen
  config.ts               explicit env loading, see Configuration
  db.ts                   node:sqlite open, migrate, upsert/find streamer
  schema.ts               wire shape types and old-payload upgrade
  jwt.ts                  HS256 sign/verify
  session.ts              HMAC-signed cookie get/set/clear
  http.ts                 tiny router over node:http, static files, error pages
  twitch.ts               thin Helix client: authorize URL, token exchange and refresh, validate, users lookup
  routes/
    index.ts              GET /
    auth.ts               login flow using twitch.ts, writes streamer row and grant
    release.ts            zip builder, multipart parse, stats decrypt
    streamer.ts           GET /streamer/:name, GET /api/streamer/:name
  ws.ts                   upgrade handling, streamer/viewer registry, fan-out
  bundle.ts               load mod zip, inject per-user files (fflate)
  stats.ts                salakieli decrypt and XML parse to stats.lua (fast-xml-parser)
web/
  index.html
  streamer.html
  nostreamer.html
  app.js                  viewer rendering, websocket client
  style.css
  data/*.json             spell/item/icon/pillar/wand sprite data
test/
  fixtures/               generated payloads, salakieli samples (move from mod_testing/)
  *.test.ts               node:test
Dockerfile
compose.yaml
PLAN.md
README.md
```

Key decisions:

- Store the snapshot as one JSON column, exactly as received after upgrade, on the `streamers` row defined under Identity and names. No per-field tables.
- Twitch user ids are strings end to end. Twitch supplies them as strings, the JWT carries a string, and the current Mongo `Number` type is an unnecessary narrowing. Never convert to `Number`. The migration script coerces existing numeric ids back to strings. Compare ids as strings everywhere (socket routing, session, lookups).
- The viewer page is static HTML. It fetches `/api/streamer/:name` for the initial state, then opens the websocket. The server never renders templates with data in them.
- The index page needs login state and the release list. Template literal plus an HTML escape helper. No template engine.
- Node 24 runs `.ts` directly. Avoid enums, namespaces, and parameter properties so type stripping works. `tsc --noEmit` in CI.
- Stats decrypt: AES-CTR via `crypto.subtle` as today, then a real XML parser. The three samples in `mod_testing/` with their expected `.lua` output are the test.
- Bundle: load the mod zip with a library, add the four per-user files, stream the result. No hand-written zip structures.
- Static files served by Node in all environments. A reverse proxy in front is optional.

## Configuration

No dotenv. `config.ts` does exactly this:

1. Reads a fixed list of named environment variables. For each, if `NAME_FILE` is set, reads the value from that path (Docker secrets convention).
2. Validates presence and type. Missing or malformed required values exit with a message naming every problem, not just the first.
3. Returns a frozen object. Secrets are wrapped so they do not print.
4. Logs the resolved non-secret configuration at startup.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no, default 3000 | listen port |
| `PUBLIC_URL` | yes | e.g. `https://onlywands.com`. OAuth callback and the `host.lua` websocket URL derive from it. |
| `TWITCH_CLIENT_ID` | yes | |
| `TWITCH_CLIENT_SECRET` | yes | |
| `JWT_SECRET` | yes | must equal the current production value in v1 |
| `SESSION_SECRET` | yes | |
| `DB_PATH` | no, default `/data/onlywands.sqlite` | mounted volume in Docker |
| `MOD_DIR` | no, default `./mod` | source tree for bundle generation |
| `TRUST_PROXY` | no, default false | honour `X-Forwarded-*`, set secure cookies |
| `LOG_LEVEL` | no, default `info` | |

Local development sets these from `compose.yaml` or a checked-in `dev.env.example` that is sourced explicitly. Nothing reads a file implicitly.

## Deployment

- Multi-stage `Dockerfile`: `node:24-slim`, copy `server/`, `web/`, `mod/`, `package.json`, `npm ci --omit=dev`, run as non-root, `node server/main.ts`.
- `compose.yaml` with the service, a named volume for `/data`, env or secrets.
- `GET /healthz` returns 200 once sqlite is open.
- sqlite backup is a file copy of the volume. Document it, including that the file contains OAuth tokens and must be stored accordingly.
- Remove `ecosystem*.config.js` and the `bundle` script once Phase 3 settles release handling.

## Phases

Each phase ends in something runnable. Phase 0 and Phase 1 are ordered; later phases can move.

### Phase 0: schema and fixtures

- [ ] Decode one real production ticket to confirm the payload and algorithm.
- [ ] Write `schema.ts` from the tables above: wire shape types plus the upgrade step for older payloads.
- [ ] Generate fixtures from the schema: vanilla minimal, vanilla all features, Apotheosis all features, edge cases.
- [ ] Move `mod_testing/` samples to `test/fixtures/` and write the stats decrypt test.
- [ ] Save a DOM dump and screenshot of a live streamer page for visual comparison.
- [ ] Dump the Mongo `streamers` collection to JSON.
- [ ] Opportunistically capture a few real websocket payloads and compare to fixtures. Not blocking.

### Phase 1: core server (critical path)

- [ ] `config.ts`, `db.ts` with schema and migrations, `jwt.ts`, `schema.ts`.
- [ ] `ws.ts`: upgrade routing (`/<jwt>` and `/client=<name>`), ticket verification, viewer name resolution to id, persistence, fan-out by id, ping/pong reaping every 30s.
- [ ] Tests: fake mod sends each fixture, fake viewer receives it unchanged, row is updated.
- [ ] Dockerfile and compose, so Phase 1 runs the same way production will.
- [ ] Point a dev `host.lua` at the new server and confirm the unchanged mod connects and updates.

Done when: a real mod instance talks to the new server with no Lua changes.

### Phase 2: viewer page

- [ ] `GET /api/streamer/:name` and the static `streamer.html`.
- [ ] Port rendering from `public/main.js`, one component at a time, reading the wire shape directly: wand stats, wand deck and always-cast, spell tooltips, inventory, items and item tooltips, progress (perks, spells, enemies, pillars), run info and shifts, Apotheosis creature shifts, player info and map.
- [ ] Websocket client with reconnect, and the auto-refresh toggle the current page has.
- [ ] Convert `public/*.js` data files (including `pillars.js`, `pillarsApoth.js`) to `web/data/*.json` with a one-off script. Keep the script.
- [ ] Compare against the Phase 0 screenshot after each component.

Done when: the page renders each fixture indistinguishably from the live site.

### Phase 3: login and bundle download

- [ ] Twitch OAuth with `fetch`.
- [ ] Signed cookie session.
- [ ] Index page.
- [ ] Multipart parse via `Response.formData()`, stats decrypt and parse, zip injection, `POST /release`. Injected files: `token.lua`, `version.lua`, `stats.lua`, `files/ws/host.lua`.
- [ ] Release source: decide between (a) keep prebuilt `releases/*.zip` and the version picker, or (b) zip the `mod/` tree in the image at the version in `package.json`. Recommended: (b). It removes the `bundle` script, the picker, and the release directory, and the image tag becomes the mod version.

Done when: a fresh login produces a zip that installs and connects.

### Phase 4: migration and cutover

- [ ] Script: Mongo dump JSON to sqlite rows, carrying `id` (as a string) and `name` as `display_name`, with `login` left null. Stored Mongo snapshots are in the old remapped shape; either map them back to wire shape or drop them. Recommended: drop them. They are stale the moment the streamer next plays, and the page shows an empty state until then.
- [ ] Run the new container alongside the old process on a second port.
- [ ] Switch the proxy. Keep the old process for 24 hours.
- [ ] Rotate the Twitch client secret and retire the Mongo cluster.

### Phase 5: cleanup

- [ ] Delete everything the new tree replaces: `app.js`, `index.js`, `wss.js`, `controllers/`, `handlers/`, `models/`, `routes/`, `views/`, `lib/`, `public/`, `mod_testing/`, `dataprep_scripts/`, pm2 configs, `bundle`, `env.template`.
- [ ] Rewrite README for the new setup.
- [ ] CI: `tsc --noEmit`, `node --test`, docker build.

### Phase 6: v2 candidates (after cutover, not scheduled)

- Authentication: revisit websocket authentication and login once v1 is live. See the Authentication section for the notes to pick up.
- Name resolution via the Helix API, an LRU cache in front of it, and the grant validation sweeper. See "Later: name resolution and grant validation".
- Payload v2: a cleaner wire format (named fields instead of positional arrays, structured shifts instead of delimited strings). Needs a mod release; the server upgrade step accepts both for a cycle using `modVersion` to switch.
- Extract base64 sprites to PNG files or a spritesheet.

## Open questions

1. Release source, option (a) or (b) in Phase 3.
2. Should viewer pages keep working for streamers who have never connected since the migration? Recommended yes; the migration carries names and ids anyway.
3. `runInfo.start` can be an empty string. Decide what the page shows for run time in that case.
4. Serving `apothInfo` fixes the creature-shift display that production has silently broken. Confirm that is wanted rather than kept for parity.
5. Migrated snapshots: drop or map back? See Phase 4.

## Risks

- A wrong JWT implementation breaks every installed mod at once. Mitigate with a real production ticket as a test fixture.
- The page now reads the wire shape directly, so a misread field blanks part of the page for everyone. Mitigate with the fixture set and rendering each fixture during Phase 2.
- Twitch OAuth scope `user_read` is legacy. Request no scopes.
- `node:sqlite` is marked experimental in the Node 24 docs although it needs no flag. Pin Node in the Dockerfile and `engines`.
