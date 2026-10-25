# Developing Streamer Wands

What a new contributor needs to find their way around. Each file starts with a comment saying what it is for, and types are in the code, not here. For running the site, see [operating.md](operating.md).

## The system

The game dumps a snapshot of the player's state to the server every few seconds, and the server hands that snapshot to whoever is watching. Everything else (login, the download page, the viewer page) exists to support that.

- A streamer logs in with Twitch on the front page and downloads a copy of the mod. The download carries a token saying which streamer it belongs to.
- The mod opens a websocket to `/<token>` and sends its whole state as JSON whenever it changes.
- The server converts each snapshot to one canonical shape, stores it, and sends it to every viewer of that streamer.
- A viewer's page at `/streamer/<name>` opens a websocket to `/client=<name>`. It gets the current snapshot at once, then every new one.

## Where things are

| Directory | |
|---|---|
| `server/` | The whole server. Node runs the TypeScript directly; there is no build step. Start at `main.ts` and `app.ts`. |
| `web/` | The pages: Preact components in `src/`, HTML entry points in `pages/`, game data in `data/`. Built by Vite into `dist/web/`. |
| `mod/` | The Lua mod, unchanged from what streamers have installed. |
| `releases/` | One zip per mod version on offer, committed. Made by `pnpm release` (`scripts/pack-mod.ts`). |
| `test/` | Vitest. `test/web/` tests the page's logic directly; `*.integration.test.ts` drive a real browser. |
| `ops/` | The deployment scripts, the nginx example, and what each deployment is. |

## Run it locally

You need Node 26, pnpm, and a Twitch application of your own with `http://localhost:3000/auth/twitch/callback` registered as a redirect URL.

```
ops/setup.sh local --generate-secrets    # then put the Twitch client id and secret in secrets/
pnpm install
pnpm build                               # or pnpm build:watch alongside
pnpm dev
```

`pnpm dev` restarts the server when its sources change. The frontend is not rebuilt by it.

To work on the mod: change `mod/`, run `pnpm release`, restart `pnpm dev`, and download the mod from your local site. The download's `files/ws/host.lua` points at the site it came from, so the mod connects to your local server. Do not commit a real token in `mod/token.lua`.

## Checks

- `pnpm typecheck`: the server, the pages and the page tests.
- `pnpm test`: everything except the browser tests.
- `pnpm test:integration`: the built pages in a real browser against a real server. Run `pnpm build` first. They need Playwright's Chromium: `pnpm exec playwright install chromium`.
- `pnpm format`: Prettier. `mod/` keeps its own line endings.

Tests cover what decides behaviour. Layout and styling are not tested; check them by eye.

## The data model

Three layers, with one conversion between the first two and none between the last two.

1. **Wire shape**: whatever a mod sends. Positional arrays and delimited strings are encoding, not meaning, and several generations are in the field at once. The producer is `serialize_data()` in `mod/files/scripts/utils.lua`; that is the wire schema.
2. **Canonical shape**: one structure defined by what the data means (`server/schema.ts`). The server converts to it on write, stores it, and serves it to the page exactly as stored.
3. **Presentation**: the page formats canonical data (numbers to strings, seconds to clocks, ids to sprites) but never restructures it.

The rules that shaped the canonical shape:

- **Engine names, not display names.** Fields keep the game's identifiers (`fire_rate_wait`, `deck_capacity`, `uses_remaining`), so nothing needs mentally remapping. Display labels are the page's business.
- **Sentinels from the engine stay; sentinels from the mod become `null`.** `uses_remaining: -1` is the game's own value for unlimited and is kept. The shift timer's `-1` comes from the mod's Lua and becomes `null`. Where the wire has no information, the canonical shape says `null` rather than inventing a value.
- **Slot arrays keep their gaps as `null`, but nothing assumes a length.** Mods can change how many spells or items there are.
- **Wire generations are recognised by shape, never by a version field.** Older mods sent nothing that identifies them. Each rule in `fromWire` names the shape it recognises.
- **Items are parsed exactly as far as the old page did.** A descriptor that does not split is stored as `unparsed`, with no heuristic recovery. See [future-work.md](future-work.md#mod-payload-v2).

Each row's `schema_version` column records which canonical version its JSON is in. When the canonical shape changes, bump `SCHEMA_VERSION` and add a migration in `schema.ts`. Rows are migrated as they are read; new snapshots are always written at the current version. Table changes go in the `DDL` list in `db.ts`, recorded in `PRAGMA user_version`.

The server does not defend against hostile payloads in depth, since the streamer is authenticated. It rejects what it cannot recognise, caps frame size, and guarantees that what it stores conforms to the canonical type, so the page never has to guess at structure. The page still has to cope with unknown spell ids and missing sprites.

## Identity and login

There are two mechanisms, and they are separate:

- **Website login**: Twitch OAuth, no scopes requested, then a signed cookie. No session store. See `twitch.ts` and `session.ts`.
- **The mod token**: a JWT signed at download and written into the zip as `token.lua`. The mod presents it as the websocket path. Its format must not change while installed mods carry it. See `token.ts`.

A Twitch account has three names, all stored on the `streamers` row:

- `id` is stable and opaque. It is the only key used internally, and it is a string everywhere. Never convert it to a number.
- `login` is unique and lowercase, and changes when the user renames. Treat it as opaque: do not validate its characters.
- `display_name` is either the login with the user's casing, or a localised name in another script. Japanese streamers use the site.

A viewer URL is always a name, never an id. It resolves by `login` first, then by `display_name` case-insensitively, and from then on everything is by id. Both names are refreshed from Twitch at each login. A streamer who has only connected a mod and never logged in has no `login`, and is found by the display name in their token.

## Decisions worth knowing

- **Page data is written into the HTML.** Each page is a shell plus a bundled script. The server writes the page's starting data into a `<script type="application/json">` block, so there is no request for initial state that could fail, and no JSON API. Every `<` in that JSON is escaped, since snapshots carry text from mods. Server-side rendering was rejected: the browser would still need the same data, and the server would gain a build step.
- **One origin, `PUBLIC_URL`,** decides the Twitch redirect, the address written into downloaded mods, and the address viewers connect to. The page never derives an address from `window.location`.
- **The server's TypeScript must survive type stripping.** No enums, namespaces or parameter properties; `erasableSyntaxOnly` enforces this.
- **sqlite is as strict as it can be made:** `STRICT` tables, foreign keys on, JSON columns checked with `json_valid`, and every timestamp an `INTEGER` of unix milliseconds named `*_at`. Each snapshot is one JSON column on the streamer's row.
- **Nothing is served from the host's disk.** nginx caches `/static/` from the server's own `Cache-Control` headers. Serving from disk was tried and dropped: the built files exist only inside the image, and pages and files could disagree between deploys.
- **Configuration is explicit.** `config.ts` is given the environment, reads a fixed list of variables (with `NAME_FILE` for secrets), and reports every problem at once. The environment is defined only in `server_env` in `ops/config.sh`.

## Conventions

- **Secrets.** A secret is wrapped in a `Secret` as soon as it is read, and the wrapper shows nothing when logged, serialised or inspected, which matters when developing on stream. Pass the `Secret` itself. Call `unwrap()` only inside the argument to the library call that needs the value; never hold an unwrapped secret in a variable.
- **Logging.** Every entry is an object with a `message`, written as one JSON line. Errors are expanded with their stack. Levels are chosen for answering questions after the fact:
  - `info`: lifecycle, and mod sessions and logins.
  - `warn`: things someone may need to act on.
  - `error`: unhandled failures.
  - `debug`: per-viewer and per-snapshot noise.
- **Dependencies.** Remove ones that do trivial work or duplicate Node built-ins. Keep a library wherever a hand-rolled version would be worse: a regex is not a parser, and nobody should write zip structures by hand. The runtime dependencies are `ws`, `jszip`, `semver`, `fast-xml-parser` and `jsonwebtoken`. Everything used only to build or test is a dev dependency, including `preact` and `@floating-ui/dom`, which are bundled into the page. If something turns out to be harder than it looked, add a library rather than fight it.
- **Preact is used narrowly:** function components and the basic hooks, with no state library and no router.
