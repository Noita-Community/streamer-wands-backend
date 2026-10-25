# Operating Streamer Wands

How to run the site. For how it works inside, see [developing.md](developing.md).

## How a deployment is laid out

- A clone of this repository is one deployment: `production`, `dev` or `local`. What each one is (name, public URL, port) is a file in `ops/deployments/`.
- `ops/setup.sh <deployment>` records which one a clone is, in an untracked `.deployment` file. After that no script takes a deployment argument. To re-point a clone, delete `.deployment` by hand.
- Everything a deployment writes stays inside its clone:
    - `secrets/`: one value per file: `twitch_client_id`, `twitch_client_secret`, `jwt_secret`, `session_secret`.
    - `data/`: the sqlite database, `onlywands.sqlite`.
- The server's image is built and published by CI, as `ghcr.io/noita-community/streamer-wands-backend`. Hosts pull it; they build nothing. A deployment runs the tag `stable` unless its file sets `IMAGE_TAG`. The package is public, so pulling needs no login. GitHub makes a new package private: after CI first publishes, set it to public under the package's settings.
- The server runs in a Docker container named after the deployment, with `data/` and `secrets/` mounted. Its port is published on 127.0.0.1 only; nginx on the host proxies everything to it, websockets included.
- Every script says what it is about to act on and asks first. `--yes` skips the question.

## Set up a host

On a host with Docker and nginx, for `production` or `dev`:

1. Clone the repository into its own directory.
2. In the Twitch developer console, register `<PUBLIC_URL>/auth/twitch/callback` as a redirect URL of this deployment's own Twitch application.
3. `ops/setup.sh <production|dev> --generate-secrets`. Put the Twitch application's client id and secret in `secrets/twitch_client_id` and `secrets/twitch_client_secret`, then run `ops/setup.sh` again to check.
    - If this deployment replaces a server people already use, put that server's JWT secret in `secrets/jwt_secret` instead of the generated one. See [Replace a running server](#replace-a-running-server).
4. `ops/update.sh <production|dev>`
5. Configure nginx from `ops/nginx.conf.example`. Its TLS lines are certbot's; its header says how to start without a certificate. Each deployment on a host gets its own copy of the file; its header says what to change.

The connection and request limits in the nginx example are untested starting points. They are the only abuse limits there are: the server itself limits nothing.

## Update

Merge to `main` and wait for CI to publish (Actions > build). Then, in the deployment's clone:

```
git pull
ops/update.sh <production|dev>
```

The deployment must be named, and must be the one the clone was set up as; there is no default. `git pull` keeps the ops scripts and deployment files current; the code itself comes in the image.

`update.sh` pulls `stable` and, if it is not what the container already runs, replaces the container (SIGTERM, so the server closes cleanly) and waits for its health check. If the new container is not healthy within a minute, the one that ran before is started again and the script fails. Viewers and mods reconnect on their own.

Update dev first, look at it, then production. Both run `stable`, so production gets exactly the image dev was checked on, as long as CI has not published again in between: `update.sh` prints the revision it runs.

CI also republishes `stable` weekly with fresh base images. Nothing deploys it automatically; update when it suits.

`ops/update.sh <deployment> <tag>` runs a particular published build instead, by its tag from the package page on GitHub (`<date>-<commit>`). A later run without a tag goes back to `stable`.

To run code CI has not published, `ops/rebuild.sh` builds the image from the checkout, and `ops/reload.sh <deployment>` starts it.

## Roll back

```
ops/update.sh <production|dev> --rollback
```

This swaps back to the image that ran before the last update, checked the same way. Running it again undoes the rollback. To go further back, name a published build: `ops/update.sh <deployment> 20261025-c6ccd7e`.

The container's image is tagged `<name>:latest`, and the one before it `<name>:previous`; `<name>` is the deployment's `NAME`, e.g. `onlywands`. `docker images <name>` lists the revisions on this host.

An older build will not open a database that a newer build has changed the tables of, and cannot read snapshots stored at a newer schema version. To roll back across a change like that, restore a backup taken before the update. Take one before deploying such a change.

## Release a new mod version

1. Change `mod/`, and bump `modVersion` in `package.json`.
2. `pnpm release`, which packs `mod/` into `releases/streamer_wands--<modVersion>.zip`.
3. Commit the zip with the change, then [update](#update). The zip is in the image, so it reaches the site only through CI.

Every zip in `releases/` is offered for download, newest first. Earlier versions stay as the escape hatch for a broken release; about three is the intent. Delete a zip and redeploy to stop offering it.

## Logs and health

- `docker logs -f <name>`. One JSON object per line, with `time`, `level` and `message`.
- The level is `LOG_LEVEL` in the deployment's file: `info` unless it says otherwise.
- When a streamer's page looks stale, look for that streamer's mod session at `info`: when it connected, which mod version it reported, and when it disconnected, with how many snapshots it sent. Rejected tokens and unusable payloads are at `warn`.
- `GET /healthz` returns 200 once the database is open. The container's Docker health check uses it.

## Back up

The database is the one file `data/onlywands.sqlite`. It holds every streamer's Twitch OAuth tokens, so store backups as you would the secrets.

- While the server is running: `sqlite3 data/onlywands.sqlite ".backup <backup-file>"`
- With the container stopped, a plain copy of the file works too.

## Rotate a secret

Replace the file in `secrets/`, then `ops/reload.sh <production|dev>`, which restarts the container on the image it runs.

| File                   | What rotating it does                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `twitch_client_secret` | Nothing users notice. Generate a new one in the Twitch developer console first.                                                                |
| `twitch_client_id`     | Switches the site to a different Twitch application, which needs the redirect URL registered.                                                  |
| `session_secret`       | Logs everyone out of the website.                                                                                                              |
| `jwt_secret`           | **Every installed mod stops connecting**, until each streamer downloads the mod again. Do not rotate it; see [future-work.md](future-work.md). |

## Replace a running server

For moving to a new host, or replacing a server built from other code:

1. Set up the new clone as in [Set up a host](#set-up-a-host), with the old server's `jwt_secret`. Moving between hosts, also copy `session_secret` so logins carry over.
2. Run it beside the old server, on another port or host name.
3. Check that a mod downloaded from the old server connects to the new one. Point the installed mod's `files/ws/host.lua` at the new server to try it.
4. Moving between hosts, stop the old container and copy `data/onlywands.sqlite` across.
5. Switch nginx to the new server. Keep the old one for a day in case you need to switch back.

## Run locally

See [developing.md](developing.md#run-it-locally).
