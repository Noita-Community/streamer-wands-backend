# Future work

Things worth doing that nobody has scheduled. Remove an item once it is done or decided against.

## Operations

- **Rotate the Twitch client secret, and retire the Mongo cluster**, once the old server is gone.
- **Serve compressed assets.** The game data file is 2.3 MB and gzips to under 1 MB. nginx can do this (`gzip on` for `/static/`); the server does not.

## Authentication

Login and the mod token were kept compatible with the old server on purpose. Known limits, best addressed together:

- The mod token never expires and cannot be revoked. One shown on stream is compromised for good.
- A session cookie cannot be revoked before its 30 days are up, and a session can download a fresh mod token, so a session is worth as much as a token.
- Logout is a GET, so a link can log someone out.
- The token carries the display name from when it was signed. A streamer who renamed since is found by their old name until they log in again. The name should come from the database row.
- The JWT could be replaced by something simpler, now that the server owns both ends.

Any change to the token costs every streamer a re-download, so it needs a transition period in which both forms are accepted.

Static files, cookies and sessions are hand-written on Node's own primitives. Hono and Fastify were weighed and not used: the site serves only its own build, cookie values are only ones the server generated, and no library offers sessions. Revisit if the site ever serves anything user-supplied.

## Twitch names and grants

The `twitch_grants` table is filled at every login and not used yet. Its columns were chosen for this work:

- **Grant validation.** Twitch requires apps to validate user tokens hourly while in use. A periodic job would call `/oauth2/validate` for each grant, refresh expired access tokens, record `last_validated_at`, and set `revoked_at` when the user has disconnected the app. What a revoked grant means for the streamer's page is a product decision.
- **Name resolution via the Helix API.** With an app access token, `/helix/users?login=` and `?id=` resolve names live. That would let a renamed streamer's new name resolve, and settle one login appearing against two ids. Put a small, short-lived LRU cache in front, so a link posted in chat that many viewers click costs one lookup. Possibly never needed, since streamers log in again whenever they download a new mod.

## Mod payload v2

The wire format needs a mod release to change, and `fromWire` would recognise both shapes for a cycle. Candidates:

- Named fields instead of positional arrays, and structured shifts instead of delimited strings.
- Above all, a real serialization for item descriptors. Today they concatenate sprite, name and description with no delimiter, and parse only because vanilla names are `$` translation keys. Until then, "update your mod" is the answer to a descriptor that does not parse.
- Report an Apotheosis creature shift as its own field. Today it arrives as a perk whose id has the creature's id appended, and the page splits it. Even before a mod change, the split belongs in `fromWire`.

## Game data

- `web/data/*.json` is the source of the game data now. The tools that originally scraped it from the game's files are not in this repository. Regenerating it after a game or Apotheosis update needs a pipeline.
- About half the sprite bytes in `web/data` are duplicates. Every spell sprite is in both the spell data and the icon list, and the Apotheosis files repeat most of the base set.
- Extract the base64 sprites into PNG files or a spritesheet.

## Viewer page

- **The map's parallel-world label for Apotheosis may be wrong.** `web/src/Map.tsx` counts Apotheosis parallel worlds as 100 chunks wide, and map tile sets as 70. Between 35 and 50 chunks east or west of centre, the player is counted as in the main world while the east or west tiles are shown, and the label reads "East" or "West" with no number. Check whether Apotheosis worlds really are 100 chunks wide, and whether the map site's Apotheosis tile sets really are 70. Reusing the east and west tiles for worlds further out is correct, and not part of this question.
- Capture a few real websocket payloads from current mods and compare them with `test/fixtures/`.

## Revisit when circumstances change

- **`node:sqlite`** is a release candidate. Node 26 is pinned in the Dockerfile and in `engines`; revisit the pin when the module is declared stable.
- **CSS anchor positioning** would replace `@floating-ui/dom` for tooltips. It reached Firefox and Safari only recently; revisit when it is older.
- **Uploads.** `POST /release` parses its multipart body with `Response.formData()`, which buffers the whole body; the route caps it at 4 MB. Use a streaming parser if uploads ever grow.
