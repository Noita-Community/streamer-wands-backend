# Streamer Wands rewrite plan

Status: draft 4, 2026-10-04. Edit freely; this is the working document for the rewrite.

## The system in one sentence

The game dumps a snapshot of the player's state to the server every few seconds, and the server hands that snapshot to whoever is watching. Everything else (login, the download page, the viewer page) exists to support that.

## Goals

- Keep the mod and every installed copy of it working without changes in v1. Existing `token.lua` tokens must stay valid.
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
| `handlers/wandHandler.js` `validate()` | Converts wire shape to a stored shape and fills defaults for older mod versions. Its stored shape was designed around Vue templates; the conversion-on-write intent stays. |
| `public/main.js` | Consumer. Shows what each field is for and how it is decoded for display. |

Other files worth reading once: `wss.js` (socket routing), `controllers/wsController.js` (broadcast and persist), `routes/index.js` (bundle download), `lib/noitastats.js` (stats decrypt), `handlers/passportHandler.js` (login and ticket minting).

## Data model

Three layers, with one conversion between the first two and none between the last two:

1. **Wire shape.** Whatever a mod sends. Positional arrays and delimited strings are wire encoding, not meaning, and several generations of it are in the field at once.
2. **Canonical shape.** One structure defined by what the data *means*, stored in the database with a schema version, and served to the page exactly as stored. The server converts wire to canonical **on write**. Older stored rows are migrated to the current canonical version by numbered migrations, also server-side.
3. **Presentation.** The page formats canonical data for display (numbers to strings, seconds to clocks, ids to sprites) but never restructures it. The current server's third shape, built purely for Vue templates, is what we are not repeating.

### Wire shape (what the mod sends)

As `serialize_data()` in `mod/files/scripts/utils.lua` emits it today. Older mods differ; see "Conversion on write".

#### Top level

| Key | Type | Notes |
|---|---|---|
| `wands` | `[stats, always_cast, deck][]` | see below |
| `inventory` | `string[]` | `ACTION_ID_#charges`, `"0"` for an empty slot |
| `items` | `string[]` | item descriptor strings (see "What the dump showed"), `"0"` for an empty slot |
| `progress` | `[perks[], spells[], enemies[], pillars[]]` | all `string[]` of ids |
| `runInfo` | object | see below |
| `apothInfo` | object | absent without Apotheosis. See below. **Current bug:** the validator reads `data.apothinfo` (lowercase), so production never stores it and creature shifts never display. Reading the right key fixes it. |
| `playerInfo` | object | see below |
| `modFeatures` | object | see below |
| `modVersion` | string | from the injected `version.lua` |

#### `wands[]`

Each wand is a three-element array: `[stats, always_cast, deck]`. `always_cast` and `deck` are `string[]` in the same `ACTION_ID_#charges` encoding as `inventory`, with `"0"` for empty deck slots. `stats`:

| Key | Type | Notes |
|---|---|---|
| `sprite` | string | a path like `data/items_gfx/wands/wand_0001.png` |
| `ui_name` | string | |
| `shuffle_deck_when_empty` | boolean | |
| `mana_max`, `mana_charge_speed`, `reload_time`, `actions_per_round`, `deck_capacity`, `spread_degrees`, `speed_multiplier`, `fire_rate_wait` | number | |

#### `runInfo`

| Key | Type | Present when |
|---|---|---|
| `mods` | `string[]` | always |
| `beta` | boolean | always |
| `ngp` | number | `modFeatures.ngp` |
| `seed` | number | `modFeatures.seed` |
| `start` | string, comma-separated UTC date parts `year,month0,day,hour,minute,second`, may be empty | always |
| `playtime` | number, seconds | always |

#### `playerInfo`

| Key | Type | Present when | Notes |
|---|---|---|---|
| `health` | `[hp, max_hp]` as **strings** | always | strings on purpose, to carry `inf` and `nan`. Game units; display multiplies by 25. |
| `gold` | number | always | |
| `orbs` | number | always | |
| `pos` | `[x, y]` | `modFeatures.pos` | |
| `perks` | `[names[], amounts[]]` | always | parallel arrays, most recent first |
| `shiftsTotal` | number | always | |
| `shiftsList` | `string[]` | `modFeatures.shifts` | one entry per shift, `"empty"` if unknown. Entries are `id%@%Display Name` joined by `<,>`. |
| `shiftsTimer` | number, `-1` when expired | `modFeatures.timer` | |

#### `apothInfo`

| Key | Type | Present when | Notes |
|---|---|---|---|
| `csTotal` | number | always (when Apotheosis) | |
| `csTimer` | number | `modFeatures.apothCreatureTimer` | |
| `csShifts` | `string[]` | `modFeatures.apothCreatureShifts` | same encoding as `shiftsList` |

#### `modFeatures`

Booleans `seed`, `pos`, `ngp`, `shifts`, `timer`, `apothCreatureTimer`, `apothCreatureShifts`. Lua emits `ModSettingGet` results; `nil` vanishes from the JSON, so a missing key means `false`.

### Canonical shape (version 1)

Defined by meaning. Named fields, no positional arrays, no delimited strings. Rulings that shaped it:

- **Engine names, not presentation names.** Fields keep the identifiers the game uses (`fire_rate_wait`, `reload_time`, `deck_capacity`, `uses_remaining`) so that reasoning about the code never involves a mental remapping. Human labels are a presentation concern: one constant on the page maps field to label.
- **Sentinels from the engine stay; sentinels from the mod become `null`.** `uses_remaining: -1` is the game's own value for unlimited and is kept. The shift timer's `-1` is assigned by the mod's Lua and becomes `null`.
- **Slot arrays are fixed-length with `null` for empty, but no code or type assumes a particular length.** Sixteen spells and four items are what the vanilla game has today; a mod can change either. The wire gives us the gaps, so lengths come from the data.
- **No duplicated timestamp.** The row's `updated_at` is the single source and is never stored in the JSON. Three types express this: `InsertableSnapshot` is the write surface of the snapshot column, what `fromWire` produces and `writeSnapshot` accepts. `SelectableSnapshot` is the read surface, what a query yields once parsed. `Snapshot` is `SelectableSnapshot & { received_at }`, which `readSnapshot` returns after assigning the row's `updated_at` onto the object it just parsed. Everything outside the database layer works with `Snapshot`.
- **Items are parsed into structure on write, exactly the way the current page parses them, no more and no less.** The mod writes `sprite .. item_name .. ui_description .. "$" .. colour .. contents` with no delimiters between the first three (unchanged since items were added in PR #13). The page relies on name and description being translation keys that start with `$` and splits on that. The parser does the same. When the game supplies literal text instead (modded items, some descriptions), the descriptor does not split; the page shows nothing today, and the parser stores `unparsed` with the raw string, which displays the same way. No heuristic recovery. 7 of 669 distinct descriptors in the dump are in this state. **Future mod work:** give the item descriptor a real delimiter-based or JSON serialization and have `fromWire` prefer it; see Phase 6.

```ts
type InsertableSnapshot = {              // the version lives in the row's schema_version column, not here
    mod: {
        version: string | null            // null for mods that predate version.lua
        features: {                        // missing on the wire means false
            seed: boolean
            pos: boolean
            ngp: boolean
            shifts: boolean
            timer: boolean
            apothCreatureShifts: boolean
            apothCreatureTimer: boolean
        }
    }
    wands: Wand[]
    inventory: SpellSlot[]                 // fixed-length, null = empty slot
    items: ItemSlot[]                      // fixed-length, null = empty slot
    progress: {
        perks: string[]
        spells: string[]
        enemies: string[]
        pillars: string[]
    }
    run: {
        mods: string[]
        beta: boolean
        ngp: number | null                 // null when the feature is off
        seed: number | null                // null when the feature is off
        start_time: number | null          // unix ms; null when the mod did not record one
        playtime: number                   // seconds
    }
    player: {
        hp: string                         // game units, string so "inf"/"nan" survive
        max_hp: string
        money: number
        orbs: number
        pos: { x: number, y: number } | null
        perks: { id: string, count: number }[]      // most recent first
        fungal_shifts: {
            iteration: number
            seconds_since_last: number | null       // null when feature off or mod reported expired
            shifts: Shift[] | null                  // null when the feature is off
        }
    }
    apotheosis: {
        creature_shifts: {
            iteration: number
            seconds_since_last: number | null
            shifts: Shift[] | null
        }
    } | null                                        // null when Apotheosis is not installed
}

type Wand = {
    sprite_file: string                    // as the game reports it; the page derives the sprite key
    ui_name: string
    mana_max: number
    mana_charge_speed: number
    reload_time: number                    // frames
    actions_per_round: number
    deck_capacity: number
    shuffle_deck_when_empty: boolean
    spread_degrees: number
    speed_multiplier: number
    fire_rate_wait: number                 // frames
    always_cast: Spell[]
    deck: SpellSlot[]                      // fixed-length, null = empty slot
}

type Spell = { action_id: string, uses_remaining: number | null }   // -1 = unlimited, from the engine; null = mod did not report charges
type SpellSlot = Spell | null

type ItemSlot =
    | {
          kind: 'item'
          ui_sprite: string
          item_name: string                // translation key with its leading $, as the game stores it
          ui_description: string
          color: number | null             // ABGR packed, potions and stashes only
          contents: { material: string, ui_name: string, amount: number }[]
      }
    | { kind: 'unparsed', raw: string }  // did not split; shown as an empty slot, as today
    | null

type Shift = { from: Material, to: Material }[] | null       // one shift may convert several inputs; null = mod could not read it
type Material = { id: string, ui_name: string }
```

Field names in `Wand` and `Spell` are the engine's component fields. `player.hp`, `max_hp`, `money` are the engine's `DamageModelComponent` and `WalletComponent` fields. `fungal_shifts.iteration` is the engine's `fungal_shift_iteration`. Where a value has no engine name (`contents`, `seconds_since_last`) the name says what it means.

### Conversion on write

One function per concern in `schema.ts`:

- `fromWire(payload: unknown, now: number): Snapshot | null`. Recognises every wire generation **by shape**, never by a version field, because `modVersion` only exists in current-generation mods and older ones sent nothing that identifies them. Known older shapes, from the server history and the dump: a bare array of wands as the whole payload; no `items`; `progress` with three arrays instead of four; `health` as numbers rather than strings; no `orbs`, `start` or `playtime`; no `modFeatures`. Each rule in the function names the shape it recognises. Returns null only when the input is not recognisable as a snapshot at all.
- `migrate(stored: unknown, version: number): SelectableSnapshot`. Takes the parsed JSON from a row and that row's `schema_version`, checks the version, and applies the numbered migrations up to the current one. Version 1 has no migrations yet; this exists so the first schema change has somewhere to go.

The row's `schema_version` column is the only record of which canonical version its JSON is in; the JSON does not repeat it. Stored data is `unknown` until it has been through `migrate`: the database layer never casts a query result straight to a snapshot type. On read, a row below the current version is migrated and written back. On write, the incoming payload always lands at the current version. The page therefore only ever sees the current canonical shape.

The defaults and type coercions in the current validator exist to **migrate older mod payloads forward**, not to express intended values; `fromWire` carries that intent. Where the wire genuinely has no information, the canonical shape says so with `null` rather than inventing a value.

### Broadcast envelope

Viewers receive the canonical snapshot. The websocket sends the same JSON the viewer page is served with; no `type` wrapper.

### Validation stance

The streamer is authenticated, so the server does not defend against hostile payloads in depth. It does need to:

- Reject non-JSON and anything `fromWire` does not recognise.
- Cap frame size. A few hundred KB is generous.
- Guarantee that what it stores and serves conforms to the canonical type, so the page can rely on it.

The page must still render partial data gracefully (an unknown spell id, a sprite that does not exist), but it never has to guess at structure.

Fixtures: wire-shape inputs for each generation (current vanilla minimal, current all features, current Apotheosis, middle generation, oldest bare array) paired with their expected canonical output, plus edge cases (`inf` health, `"empty"` shifts, empty `start`). Real captures are checked against them when available but are not blocking.

### What the dump showed

917 streamer rows, 2026-10-04. Ids are already strings. No case-insensitive display name collisions. 12 display names are Japanese.

Every stored snapshot is in a **server-converted shape**, not a raw client payload. Even the oldest server mapped wands to `{stats, always_cast, deck}` before storing. So the dump is not a corpus of wire payloads; it is a corpus of old stored shapes across several server generations, and Mongoose left stale fields behind when later schemas stopped writing them. It is the input to the one-off Mongo import, which maps each of these shapes to canonical version 1. Shapes present:

| Rows | Generation | Marks |
|---|---|---|
| 216 | oldest | only `wands`, `inventory`, sometimes `items`; many empty |
| 313 | middle | adds `progress` as `[{perks, spells, enemies}]`, `version` as a string array, `info` as `[{names, amounts, shifts, shiftInfo, health, gold, x, y}]` |
| 388 | current | `modVersion`, `modFeatures`, `runInfo`, `playerInfo`, `apothInfo`, `progress` as an object (older ones lack `pillars`); about a third also carry stale `info` and `version` from the middle generation |

Confirmations and corrections to the schema tables:

- `apothInfo.shifts` is empty in all 388 current-generation rows. The lowercase-key bug is confirmed.
- `runInfo.beta` is stored as the string `"true"` because the Mongo schema typed it `String`. The wire value is a boolean.
- `playerInfo.health` is numeric in rows written by older servers and string in current ones. The wire value today is a pair of strings.
- `runInfo.start` is stored as an ISO date, the wire value is comma-separated parts, and `idletime` is server-computed. The migration must reverse both.
- `items` entries are long descriptor strings: sprite path, name key, description key, then `$color@Material (id)#count` repeated for containers. The page parses them; the server treats them as opaque strings.

## Authentication

Requirement: only the Twitch user producing the data may submit updates for that user's page. Nothing else needs auth. Viewers are anonymous.

There are two separate mechanisms in the current code. The old code calls the second one a "ticket"; the rewrite calls it the mod token, and keeps "ticket" free for a short-lived connection nonce should v2 want one:

1. **Website login.** Twitch OAuth establishes who is talking to the site. Today that is a Passport session in Mongo.
2. **Websocket authentication.** At login the server signs a JWT `{ id, displayName }` and bakes it into the downloaded mod as `token.lua`. When the mod connects, the JWT in the URL path is what the server checks to decide whether to accept the socket and which streamer it belongs to. That is the whole of it.

### v1: compatible

- Websocket authentication stays exactly as is: HS256 JWT with payload `{ id, displayName, iat }` signed with `JWT_SECRET`, no expiry, verified from the URL path on upgrade. Keep `jsonwebtoken`, pin HS256, and validate the decoded payload's contents. Must verify tokens minted by the current server, since every installed mod carries one. Tests use synthetic tokens signed with a test secret; nothing about a production token is special, and the real check is logging in to the replacement app once it is up.
- `id` is Twitch's string id and stays a string. Internally everything keys on it: the socket a mod opens, the viewers subscribed to it, the database row. See Identity and names for how a viewer URL resolves to an id.
- Website login: Twitch OAuth with two `fetch` calls, then an HMAC-signed cookie holding `{ id }`. No server-side session store. Request no scopes; `/helix/users` with the user's token returns `id`, `login` and `display_name`, all of which are written to the row.
- The session cookie has a fixed name (`session`) and is set with `HttpOnly`, `SameSite=Lax`, and `Secure` whenever `PUBLIC_URL` is https. A second cookie, `login_state`, lives for the ten minutes of one trip to Twitch and back, so a login can only be completed by the browser that started it. The old app took the cookie name from a `SESSION_KEY` env var that the README described as a secret, so production has a random cookie name, and it passed `secure` where express-session ignores it, so the cookie was never marked Secure. Existing sessions do not carry over; users log in once after cutover.
- Store the OAuth grant. Even with no scopes, Twitch issues an access token and a refresh token at login, and Twitch policy requires apps to validate user tokens hourly while in use. Keeping the grant is what lets us later detect that a user has disconnected the app from their account. The columns exist in v1 so the data is there; the sweeper that uses them is later work.
- The `tokens` collection only caches the last-minted JWT for `/auth/ticket`. The JWT is deterministic from id and name plus the signing time, so re-minting on demand serves the same purpose. Drop the collection, and the `/auth/ticket` endpoint with it: every download carries a freshly signed token. `JWT_REFRESH_SECRET` is unused in practice and goes away.

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
CREATE TABLE streamers (
  id              TEXT PRIMARY KEY,
  login           TEXT UNIQUE,
  display_name    TEXT NOT NULL,
  snapshot        TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),  -- canonical JSON
  schema_version  INTEGER CHECK ((snapshot IS NULL) = (schema_version IS NULL)),
  updated_at      INTEGER                   -- unix ms of the last snapshot write
) STRICT;
CREATE INDEX streamers_display_name ON streamers (display_name COLLATE NOCASE);

CREATE TABLE twitch_grants (
  streamer_id        TEXT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
  access_token       TEXT NOT NULL,
  refresh_token      TEXT NOT NULL,
  expires_at         INTEGER NOT NULL,      -- unix ms
  scopes             TEXT NOT NULL,         -- space-separated; empty string today
  granted_at         INTEGER NOT NULL,      -- unix ms
  last_validated_at  INTEGER,               -- unix ms
  revoked_at         INTEGER                -- unix ms
) STRICT;
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
| Zip read and inject | library: `jszip` | binary format with CRCs and a central directory. JSZip copies a loaded zip's entries into its output still compressed when asked for the same compression, so a download only compresses the few files added to it. `fflate` cannot do that. The old route called JSZip without naming a compression, which inflated every entry: its downloads were 2.5 MB for a 1 MB release. |
| Ordering mod versions | library: `semver` | the precedence rules for pre-release versions are subtle enough not to hand-write |
| XML parsing for the stats file | library: `fast-xml-parser` (or keep `htmlparser2`) | real parser, handles escaping and attribute edge cases the regex version in the TS branch does not. `fast-xml-parser` is dependency-free; `htmlparser2` pulls four transitive packages. |
| HTTP routing, static files, cookies, sessions | built-ins | the routing table is six routes; `node:http` plus a small matcher is enough |
| Multipart upload | built-in `Response.formData()` | one small file, one field. Node's type definitions mark this method deprecated for servers, because it buffers the whole body; the route caps the body at 4 MB before parsing. Replace with a library if uploads ever grow. |
| JWT HS256 | keep `jsonwebtoken` | a security boundary involving crypto. Pin `algorithms: ['HS256']` on verify and validate the payload contents ourselves. |
| Package manager | `pnpm`, default settings | implicit installs before `pnpm exec` and `pnpm run` are accepted. The development container and the host see the project at different paths, which makes pnpm reinstall when switching between them; that is tolerated rather than configured around. |
| Twitch OAuth and Helix API | built-in `fetch`, thin hand-written client | the surface is four endpoints: authorize redirect, token exchange and refresh, `/oauth2/validate`, `/helix/users`. `twurple` was considered and rejected: our use is too thin to justify it. This is a place where roll-our-own is the simpler option. |
| Config | built-in | explicit, see Configuration |
| Database | built-in `node:sqlite` | |
| Templating | none | the server writes each page's data into its HTML as a JSON block and the page renders itself; see Key decisions |
| Frontend rendering | dev: `preact`, bundled | escaping, DOM updates, and keeping focus and hover across the snapshots that arrive every few seconds are a rendering library's job, not ours. Preact was chosen over smaller libraries because TSX keeps each view readable and focused on the data it shows, function components are straightforward, and it is very widely used. It is used narrowly: function components and the basic hooks, no state library, no router. The Vite preset is not needed; Vite compiles TSX itself. |
| Frontend language and build | dev: `vite` | the frontend is TypeScript, which needs a build. Vite bundles it, builds in the JSON game data, and puts content hashes in filenames, which is the cache busting. |
| Tooltip positioning | dev: `@floating-ui/dom`, bundled | the maintained successor to Popper, which the old page loaded from a CDN. CSS anchor positioning would need no library, but it only reached Firefox and Safari within the last year; revisit when it is older. |
| Type checking | dev: `typescript` | `tsc --noEmit` only; Node strips types for the server at runtime and Vite does for the frontend |
| Tests | dev: `vitest` | comes with Vite, handles TypeScript without configuration, and runs both the server tests and the browser-driven page tests |

Runtime dependencies: `ws`, `jszip`, `semver`, `fast-xml-parser`, `jsonwebtoken`. Everything used only to build or test is a dev dependency, including `preact` and `@floating-ui/dom`, which end up inside the built page. `mongodb` and `dotenv` stay as dev dependencies until Phase 5 so the dump script keeps working. If something else in this list turns out to be non-trivial in practice, add a library rather than fight it; update this table when that happens.

## Target architecture

```
mod/                      unchanged Lua mod
releases/                 one zip per mod version on offer, committed; see Deployment
scripts/
  pack-mod.ts             pack mod/ into releases/ (`pnpm release`)
server/
  main.ts                 wire everything up, listen
  app.ts                  the HTTP routes: pages, login, download, health check
  config.ts               explicit env loading, see Configuration
  db.ts                   node:sqlite open, DDL, streamers, grants, snapshots
  schema.ts               canonical types, fromWire(), migrate()
  token.ts                the mod token: HS256 JWT sign/verify
  session.ts              the site's cookies: signed session, login state
  twitch.ts               thin client: authorize URL, code exchange, user lookup
  pages.ts                send an HTML page with its data written in
  page-data.ts            the types of that data, shared with the frontend
  static.ts               serve /static/ when nginx does not
  releases.ts             load the release zips, build a streamer's download (jszip)
  ws.ts                   upgrade handling, streamer/viewer registry, fan-out
  stats.ts                salakieli decrypt and XML parse to stats.lua (fast-xml-parser)
web/
  pages/                  index.html, streamer.html, nostreamer.html: the HTML entry points
  src/                    Preact components (TSX) for the pages; imports types from server/
  data/*.json             spell/item/icon/pillar/wand sprite data, imported and built in
  style.css
  public/static/          fonts and images, copied to the build as they are
dist/web/                 Vite build output; gitignored
  pages/                  the HTML, which the server sends
  static/                 everything the pages load, which nginx serves
test/
  fixtures/               generated payloads, salakieli samples (move from mod_testing/)
  harness.ts              a whole server for tests, with Twitch faked
  *.test.ts               vitest
ops/
  deployments/            production.sh, dev.sh, local.sh: what each deployment is
  config.sh               shared by the scripts below; defines the server's environment
  setup.sh                make a clone a deployment, check or generate its secrets
  rebuild.sh              build the image
  reload.sh               replace the running container
  local.sh                run the server without Docker (`pnpm dev`)
  nginx.conf.example      nginx in front: everything proxied, /static/ cached
secrets/                  this deployment's secret files; contents gitignored
data/                     this deployment's sqlite database; contents gitignored
Dockerfile
PLAN.md
README.md
```

Key decisions:

- Store the canonical snapshot as one JSON column on the `streamers` row defined under Identity and names. No per-field tables.
- Be as strict about data content as sqlite allows. Every table is `STRICT`, so column types are enforced. Connection setup runs `PRAGMA foreign_keys = ON`, which is off by default. JSON columns carry `CHECK (json_valid(col))`. Every timestamp column is `INTEGER` unix milliseconds, stated in a comment on the column and in the name (`*_at`); the data-acceptance and migration code never passes a Date or string to sqlite. Operational pragmas (journaling, sync, timeouts) stay at their defaults.
- `run` and `player` in the canonical snapshot are `null` when the mod generation that sent the payload did not include those sections at all, rather than filled with invented zeros.
- Twitch user ids are strings end to end. Twitch supplies them as strings, the JWT carries a string, and the current Mongo `Number` type is an unnecessary narrowing. Never convert to `Number`. The migration script coerces existing numeric ids back to strings. Compare ids as strings everywhere (socket routing, session, lookups).
- Each page is an HTML shell plus a bundled script, and the server writes the data the page starts from into the HTML as it serves it: a `<script type="application/json">` block, which the browser does not run and the page parses. There is no request for initial state that could fail, and no JSON API. The one rule is that every `<` in the JSON is written as `<`, because the HTML parser ends a script element at the first `</script` regardless of JSON strings, and snapshots carry text from mods. Server-side rendering was considered and rejected: the browser would still need the same data block to take over the page, and the server would gain a build step and have to run the components.
- The viewer page's data includes the websocket address to follow, built from `PUBLIC_URL`. The page never derives an address from `window.location`. One configured origin therefore decides the Twitch redirect, the address in downloaded mods and the address viewers connect to.
- The game data (spells, icons, items, pillars, wand sprites) are JSON files imported by the frontend and built into the bundle. They are constants, not something fetched at runtime.
- The index page needs login state and the release list, and gets them the same way.
- The server has no build step: Node 26 runs its `.ts` directly. Avoid enums, namespaces, and parameter properties so type stripping works. The frontend is the only thing that is built. `tsc --noEmit` covers both in CI.
- Stats decrypt: AES-CTR via `crypto.subtle` as today, then a real XML parser. The three samples in `mod_testing/` with their expected `.lua` output are the test.
- Downloads: every zip in `releases/` is a mod version on offer, newest first by semantic version. A download is that zip with four files added: `token.lua`, `version.lua` (from the zip's filename, so a zip never misreports its version), `stats.lua` and `files/ws/host.lua`. The release's own entries are copied through still compressed. No hand-written zip structures.
- Static files are everything under `/static/`, kept apart from the HTML, which gives nginx one location to cache. The server always serves them. Built files have content hashes in their names and are served as immutable for a year; fonts and images are cacheable for an hour. This replaces the old tree's modification-time query strings.
- Code style: Prettier with the repo's existing rules plus semicolons. Applied to the rewrite's own files only; the old app and the mod are left as they are.

## Secrets

A secret is wrapped in a `Secret` as soon as it is read. The value is held in a module-level WeakMap keyed by the wrapper's identity, so the wrapper has no fields: nothing shows when it is logged, serialized, or expanded in a debugger, which matters when developing on stream. Functions take and pass the `Secret` itself. `unwrap()` is called only at the point of use, directly in the argument to the library call that needs the raw value; an unwrapped secret is never held in a variable or passed through a function.

## Logging

Every log entry is an object with a `message` field, written as one line of JSON with `time` and `level` added. There is no string form. Error values in an entry are expanded to name, message, stack, and cause, so a failure records where it happened.

What gets logged is chosen for after-the-fact visibility into operations, not inherited from the old server, whose logging was arbitrary:

| Level | Events |
|---|---|
| `info` | Process lifecycle: resolved configuration, database opened and at which DDL version, listening, shutting down. Table changes applied. A stored snapshot migrated to a newer schema version. A mod session: connected, its first snapshot with the mod version it reports, and disconnected with how long it was connected and how many snapshots and unusable payloads it sent. A streamer logging in, and downloading the mod (which version, with or without stats). |
| `warn` | Things that should not happen and that someone may need to act on: a mod refused because its token did not verify, a login that failed at Twitch, the first unusable payload on a connection, a socket that timed out without closing, a socket error (including an oversized frame), a snapshot that could not be stored. |
| `error` | Unhandled failures in a request or upgrade, with the stack. |
| `debug` | High-volume events only useful when tracing: each viewer connecting and disconnecting, each snapshot stored, viewers refused for an unknown streamer name. |

A mod session's lifecycle is at `info` because "was the mod connected, on which version, and did it send anything" is the first question when a streamer's page looks stale.

## Configuration

No dotenv. `config.ts` does exactly this:

1. Takes the environment object as an argument. It never reads `process.env` itself; the entry point passes `process.env` and tests pass a plain object.
2. Reads a fixed list of named variables from it. For each, if `NAME_FILE` is set, reads the value from that path (Docker secrets convention).
3. Validates presence and type. Missing or malformed required values exit with a message naming every problem, not just the first.
4. Returns a frozen object with secrets wrapped.

The entry point logs the resolved configuration at startup; secrets serialize as `[secret]`.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no, default 3000 | listen port |
| `PUBLIC_URL` | yes | e.g. `https://onlywands.com`. The OAuth callback, the `host.lua` websocket URL and the address viewer pages connect to derive from it; cookies are Secure when it is https. |
| `TWITCH_CLIENT_ID` | yes | |
| `TWITCH_CLIENT_SECRET` | yes | |
| `JWT_SECRET` | yes | must equal the current production value in v1 |
| `SESSION_SECRET` | yes | |
| `DB_PATH` | no, default `/data/onlywands.sqlite` | the clone's `data/` directory, mounted in Docker |
| `RELEASES_DIR` | no, default `./releases` | the mod release zips |
| `WEB_DIR` | no, default `./dist/web` | the built frontend |
| `LOG_LEVEL` | no, default `info` | |

The environment is defined in exactly one place, `server_env` in `ops/config.sh`, which the container and the local server both get theirs from. The Twitch client id and the three secrets are supplied as `*_FILE` paths into the clone's `secrets/` directory. Nothing reads a file implicitly.

## Deployment

- `Dockerfile`, two stages on `node:26-slim`. The build stage installs all dependencies, runs `vite build`, and packs `mod/` into `releases/`. The runtime stage installs production dependencies only, copies `server/`, `releases/`, and the built `dist/web/`, and runs `node server/main.ts` as non-root. The mod's sources are not in the running image.
- Mod releases. `pnpm release` packs `mod/` into `releases/streamer_wands--<modVersion>.zip`, and the zip is committed, so a change to the mod shows up in its pull request as a changed zip. Packing is repeatable: the same files give the same bytes. The image build packs again, so a deployment always carries the mod as it is in the checkout. Earlier versions stay in `releases/` for as long as they should be downloadable, as the escape hatch for a broken release, and are pruned by hand; about three is the intent. Changing what is on offer means rebuilding the image.
- nginx runs in front on the host and proxies everything, websockets included. `ops/nginx.conf.example` is the starting point. Nothing is served from the host's disk, so a deployment is only ever the container and switching containers is atomic. nginx caches responses under `/static/` (`proxy_cache`) for as long as the server's `Cache-Control` allows, so static files are served by nginx after the first request for each. Serving them from disk was tried and dropped: the built files only exist inside the image, and getting them onto the host meant either copying them out or a second build there, with pages and files able to disagree in between.
- Three deployments: production, dev (beside production on the same host), and local (a developer's machine, plain http on localhost, which is the one place Twitch allows an http redirect). Each is a file in `ops/deployments/`, in git, holding its name, public URL and port. The Docker image and container are named after it.
- A clone is one deployment. `ops/setup.sh <deployment>` records which in an untracked `.deployment` file, once; after that no script takes a deployment argument, and none has a default, so a clone that was never set up cannot act on anything. A clone cannot be re-pointed without deleting that file by hand.
- Everything a deployment writes stays inside its clone: `secrets/` (the Twitch client id and secret, `jwt_secret`, `session_secret`, one value per file) and `data/` (the sqlite database). Both directories are in git with their contents ignored, and the scripts never create them, so a missing one stops the script. No path to write secrets to is ever stated, so there is no wrong place to write them. There is no Docker volume: the container runs as the operator's user with the two directories mounted, which also means the database can be inspected from the host. The Twitch client id is kept with the secrets, though it is not one, so that each deployment and each developer uses their own Twitch application without editing a committed file.
- No docker compose. Shell scripts in `ops/` cover the basic tasks and share `ops/config.sh`. Each says which deployment, site, container and clone it is about to act on and asks before going ahead; `--yes` skips the question.
  - `ops/setup.sh` records the deployment and checks that the secret files exist. With `--generate-secrets` it generates `session_secret` and `jwt_secret` if they are absent. It never overwrites a file and never generates the Twitch values, which come from Twitch. A generated `jwt_secret` is only right for a new deployment: at cutover that file must hold the old server's `JWT_SECRET`.
  - `ops/rebuild.sh` builds the image from the checkout, tagged `latest` and with the git revision.
  - `ops/reload.sh` replaces the running container. It labels the container with the clone that started it and refuses to replace one that another clone started. The container's port is published on 127.0.0.1 only.
  - `ops/local.sh`, which `pnpm dev` runs, starts the server from the checkout without Docker, for the local deployment only.
- Bringing up production or dev, on a host with Docker and nginx:
  1. Clone the repository into its own directory.
  2. In the Twitch developer console, register `<PUBLIC_URL>/auth/twitch/callback` as a redirect URL of the deployment's own Twitch application.
  3. `ops/setup.sh <production|dev> --generate-secrets`, then put the Twitch application's client id and secret in `secrets/twitch_client_id` and `secrets/twitch_client_secret`, and run `ops/setup.sh` again to check. For a deployment that replaces a server in use, put that server's `JWT_SECRET` in `secrets/jwt_secret`.
  4. `ops/rebuild.sh`.
  5. `ops/reload.sh`.
  6. Configure nginx from `ops/nginx.conf.example`.
  
  Updating is steps 4 and 5 again after a `git pull`.
- Running locally: `ops/setup.sh local --generate-secrets` with a Twitch application of your own that has `http://localhost:3000/auth/twitch/callback` registered, then `pnpm install`, `pnpm build`, `pnpm dev`.
- Abuse limits live in nginx, not the server: per-address caps on open connections and request rate, in the example config. They matter because a viewer's websocket is anonymous and is sent the whole snapshot on connecting, so opening them in a loop is a cheap way to slow the site for every streamer. The numbers in the example are untested starting points.
- `GET /healthz` returns 200 once sqlite is open.
- sqlite backup is a copy of the file in `data/`. Document it, including that the file contains OAuth tokens and must be stored accordingly.
- Remove `ecosystem*.config.js` and the `bundle` script in Phase 5; `scripts/pack-mod.ts` replaces `bundle`.

## Phases

Each phase ends in something runnable. Phase 0 and Phase 1 are ordered; later phases can move.

### Phase 0: schema and fixtures

- [x] Dump the Mongo `streamers` collection to JSON (`scripts/dump-mongo.mjs`, run on an allowlisted host; output is gitignored because it is user data). See "What the dump showed".
- [x] Settle the canonical shape.
- [x] Write `schema.ts`: canonical types, `fromWire` recognising every wire generation, `migrate` with an empty migration list.
- [x] Fixtures: wire input and expected canonical output per generation, plus edge cases.
- [x] Move `mod_testing/` samples to `test/fixtures/` and write the stats decrypt test.
- [x] Rendered DOM dumps of the production pages (`scripts/dump-reference.mjs`, output in `reference/`, gitignored and regenerable until cutover). Covers the streamer page with default toggles and with every toggle on, the no-such-streamer page, and the logged-out index. No screenshots; the DOM is the reference.
- [x] Logged-in index page dump, in `reference/index-logged-in.html`. The picker offers one version only (1.2.10), which supports release option (b) in Phase 3.
- [ ] Opportunistically capture a few real websocket payloads and compare to fixtures. Not blocking.

### Phase 1: core server (critical path)

- [x] `config.ts`, `log.ts`, `db.ts` with the strict tables and DDL versioning, `token.ts`, `schema.ts`.
- [x] `ws.ts`: upgrade routing (`/<jwt>` and `/client=<name>`), token verification, viewer name resolution to id, persistence, fan-out by id, ping/pong reaping every 30s. A viewer is sent the current snapshot as soon as it connects.
- [x] `app.ts` and `main.ts`: HTTP server with `/healthz`, websocket upgrade attached, clean shutdown on SIGTERM.
- [x] Tests: fake mod sends each wire fixture, fake viewer receives the expected canonical snapshot, row is updated at the current schema version.
- [ ] Dockerfile and `ops/` scripts, so Phase 1 runs the same way production will. Written, and exercised against a stub `docker` command: setup, the refusals, the confirmation, the other-clone guard, and the `docker run` line they produce. `ops/local.sh` has run for real. **The Dockerfile has never been built and the ops scripts have never run against real Docker**, since the development container has none. Build and run once before relying on them.
- [ ] Point a dev `host.lua` at the new server and confirm the unchanged mod connects and updates.

Done when: a real mod instance talks to the new server with no Lua changes.

### Phase 2: viewer page

- [x] Vite build for the frontend: Preact and TypeScript under `web/src/`, HTML entry points, hashed output in `dist/web/`. The game data builds into its own file, so a code change does not make browsers download it again.
- [x] Server: `/streamer/:name` answers the viewer page for a known streamer and the not-found page with a 404 status otherwise.
- [x] Convert `public/*.js` data files to `web/data/*.json` with `scripts/convert-data.mjs`, imported by the frontend and built in.
- [x] Port rendering from `public/main.js`, reading the canonical shape and doing formatting only: wands, spells and tooltips, inventory, items, player and perks, shifts, mods, feature status, map, pillars, progress tables with search.
- [x] The shifts calculation is tested against a copy of the old function, on hand-picked cases and 2,000 generated sequences per kind.
- [x] Tooltips positioned with `@floating-ui/dom`, bundled.
- [x] Websocket client with reconnect, and the auto-refresh toggle.
- [x] Tests of the page's logic. Layout and styling are deliberately not tested; appearance is checked by eye.
  - `test/web/`: the functions that decide what the page says, called directly. Health wording, spell stat formatting, wand stats and simulator links, item contents, perk resolution, map location, and the search matcher.
  - `test/page.integration.test.ts`: the built page in a real browser against a real server, for what only exists when everything runs together. Following the mod over the websocket, pausing auto refresh, choosing the Apotheosis data set from the first snapshot, the outdated-mod warning, the no-data and not-found states, and search and progress counts. Needs Playwright's Chromium.
  - `pnpm test` runs everything except files named `*.integration.test.ts`. `pnpm test:integration` runs only those.
- [ ] Check the page's appearance against the live site by eye. Not done; nothing yet shows the new page looks like the old one.

Bugs in the old page, fixed in the new one:

- Durations took hours modulo 60 instead of 24, so a run of a day and an hour read "1days 25hr", and a unit of exactly one was left out, so 60 seconds read as nothing. Durations are now in whole days, hours, minutes and seconds.
- A search on a damage stat scaled the typed number the wrong way: `@damage>50` multiplied 50 by 25 where it should divide. Searches on times were already right.
- `@type=` with no type name after it highlighted every spell. It now waits for a name.

To verify, and possibly a bug. Behaviour is unchanged from the old page until then:

- The map preview's parallel world label, "In East 2", takes its number from the player's parallel world and its direction word from which of the map site's tile sets is being shown. For every map but Apotheosis those agree. For Apotheosis the code counts parallel worlds as 100 chunks wide and tile sets as 70. In the band from 35 to 50 chunks east or west of centre, the player is counted as in the main world while the east or west tile set is shown, and the label reads "East" or "West" with no number. Whether that is wrong depends on two things not yet checked: that Apotheosis worlds are 100 chunks wide, and that the map site's Apotheosis tile sets are 70. Note that the game repeats without limit in both directions, while the map site has only main, east and west tiles; reusing east and west tiles for worlds further out is correct and is not part of this question.

Kept as the old page has it, on purpose:

- Health the engine reports as `inf` or `nan` is shown as "Engine inf" and "Engine nan".

Known differences from the old page, each deliberate:

- Hovering a shift result highlights the row that caused it. The old code indexed cells as if the table were laid out by row, though it is laid out by column, so it likely highlighted the wrong cells. Unconfirmed against the live site.
- The two switches the old stylesheet hid ("Show Beta Content", "Show All Progress") are not rendered.
- A search that is not a valid pattern, or names no stat, leaves the table as it is. The old page threw.

Left for later, from a review of this code:

- Serve compressed assets. The data file is 2.3 MB and gzips to under 1 MB. A reverse proxy would do this; the server itself does not.
- About half the sprite bytes in `web/data` are duplicates: every spell sprite is in both the spell data and the icon list, and the Apotheosis files repeat most of the base set.
- The mod reports an Apotheosis creature shift as a perk whose id has the creature's id appended. The page splits that; it belongs in `fromWire`, with the creature as its own field.

Done when: the page renders each fixture indistinguishably from the live site.

### Phase 3: login and bundle download

- [x] Twitch OAuth with `fetch`: `/auth/login`, `/auth/twitch/callback`, `/auth/logout`. The previous site's `/auth/login/beta` still works. The account and the grant are stored at each login.
- [x] Signed cookie session, and the login-state cookie.
- [x] Index page, a Preact page like the viewer page. Its wording follows the old page except for one sentence: the old page said Twitch credentials are not stored, and the new server stores the grant, so it says instead that logging in asks Twitch for no permissions.
- [x] Page data written into the HTML in place of the `/api/streamer/:name` request, for all pages.
- [x] `POST /release`: multipart parse via `Response.formData()`, stats decrypt and parse, zip injection. The stats file is optional.
- [x] Release source: committed zips in `releases/` with the version picker kept, as the escape hatch for a broken mod release. See Deployment.
- [x] Static files under `/static/`, apart from the pages, with cache headers for nginx to cache them by.
- [x] Tests: the login flow, page data, downloads and static files over HTTP against a faked Twitch (`test/site.test.ts`), release loading (`test/releases.test.ts`), and the front page in a browser, through to a download.
- [ ] Build the image and run the ops scripts on a real host. **Still never done**; see Phase 1.
- [ ] A fresh login on a deployed copy produces a zip that installs and connects.

Done when: a fresh login produces a zip that installs and connects.

### Phase 4: migration and cutover

- [ ] Script: Mongo dump JSON to sqlite rows, carrying `id` (as a string) and `name` as `display_name`, with `login` left null. For snapshots, map each old stored shape (see "What the dump showed") directly to canonical version 1 and keep it if the result conforms. Pages for streamers who never reconnect then keep showing their last state, as they do today. Rows with no usable snapshot get `NULL`. This mapping lives in the import script, not in `schema.ts`; it runs once.
- [ ] Run the new container alongside the old process on a second port.
- [ ] Switch the proxy. Keep the old process for 24 hours.
- [ ] Rotate the Twitch client secret and retire the Mongo cluster.

### Phase 5: cleanup

- [ ] Delete everything the new tree replaces: `app.js`, `index.js`, `wss.js`, `controllers/`, `handlers/`, `models/`, `routes/`, `views/`, `lib/`, `public/`, `mod_testing/`, `dataprep_scripts/`, pm2 configs, `bundle`, `env.template`.
- [ ] Rewrite README for the new setup.
- [ ] CI: `pnpm typecheck`, `pnpm test`, `pnpm build`, docker build.

### Phase 6: v2 candidates (after cutover, not scheduled)

- Authentication: revisit websocket authentication and login once v1 is live. See the Authentication section for the notes to pick up. Known limits to address together: the mod token never expires and cannot be revoked, so one shown on stream is compromised for good; a session cookie cannot be revoked before its 30 days are up, and a session can download a fresh token, so it is worth as much; logout is a GET, so a link can log someone out. Static serving, cookies and sessions are hand-written on Node's own primitives. That was weighed against Hono and Fastify and kept, because the files served are only the site's own build, cookie values are only ones the server generated, and no library offers sessions; revisit if the site ever serves anything user-supplied.
- Name resolution via the Helix API, an LRU cache in front of it, and the grant validation sweeper. See "Later: name resolution and grant validation".
- Payload v2: a cleaner wire format (named fields instead of positional arrays, structured shifts instead of delimited strings, and above all a real serialization for item descriptors, which today concatenate sprite, name and description with no delimiter and only parse because vanilla names are `$keys`). Needs a mod release; `fromWire` recognises both shapes for a cycle. Until then, "update your mod" is the answer to a descriptor that does not parse.
- Extract base64 sprites to PNG files or a spritesheet.

## Open questions

1. Settled: releases are committed zips with a version picker.
2. Should viewer pages keep working for streamers who have never connected since the migration? Recommended yes; the migration carries names and ids anyway.
3. `runInfo.start` can be an empty string. Decide what the page shows for run time in that case.
4. Serving `apothInfo` fixes the creature-shift display that production has silently broken. Confirm that is wanted rather than kept for parity.
5. Migrated snapshots: the plan says map back. Confirm, or choose to drop them and start every page empty.

## Risks

- A wrong JWT implementation breaks every installed mod at once. Mitigate by logging in to the replacement with a mod installed from the old site before cutover.
- A wrong `fromWire` rule stores wrong data for everyone on that mod generation. Mitigate with the per-generation fixture pairs and by rendering each expected canonical fixture during Phase 2.
- Twitch OAuth scope `user_read` is legacy. Request no scopes.
- `node:sqlite` is a release candidate, not yet stable (it left "experimental" in Node 25.7 and no longer prints a warning on load). Node 26 is pinned in the Dockerfile and in `engines`; revisit the pin when the module is declared stable.
