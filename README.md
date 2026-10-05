# streamer-wands-backend

The Streamer Wands mod for Noita is a mod that lets viewers see what spells and wands you are using on a website, as a companion to streaming Noita gameplay.
To use it, you should log in with Twitch at https://onlywands.com and download a customized mod package from that site. This customization "binds" your copy
of the mod to your Twitch username, so you should not share the zip file with others. The token included in the zip file only identifies your Twitch ID and
display name, but does not grant any access to your Twitch account.

Streamer Wands requires installation as an "unsafe" mod since it establishes a websocket to a remote server to send updates when your wands or spell change.
See the [Noita Wiki](https://noita.wiki.gg/wiki/How_to_install_mods#Manual) for instructions on manually installing a mod.

# Mod status

No future feature development is planned by the maintainer, but pull requests are welcomed. Read on for development information.

# Developing the website

You'll need Node.js, a MongoDB server, and a Twitch app (for login) to run the app locally.

- Copy [env.template](env.template) to `.env` in the project root: `cp env.template .env`
- Fill out the environment variables
    - `DOMAIN` should be the domain you'll access the site at, so `localhost` is suitable for local development
    - `NODE_ENV` should be `production` or `development`
    - `DATABASE` is a MongoDB connection string, such as `mongodb+srv://user:password@host/?retryWrites=true&w=majority`
    - `PORT` is the port the application listens on for browser requests and websocket requests from the mod
    - `CLIENT_ID` and `CLIENT_SECRET` are parameters from the Twitch app (Create one at https://dev.twitch.tv/console/apps/)
    - `CALLBACK_URL` should be `http(s)://DOMAIN/auth/twitch/callback`, and must be registered in the Twitch app
    - `SESSION_SECRET` and `SESSION_KEY` should be randomly generated, equivalent to a password
    - `JWT_SECRET` should be randomly generated, equivalent to a password
- Run `index.js` (optional: run under something like `nodemon` to restart when contents change)
- When changing the mod itself, run `DEV=true ./bundle` in the project root to create a development release for download from the web ui

# Developing the mod

The mod files themselves are kept in this repository in the [mod](mod) folder. Start with a customized zip (your user token is stored in [mod/token.lua](mod/token.lua))
and make any appropriate changes, then copy/commit the files back to Git. Do not include `token.lua` in your commits.

Should you need to test changes to the websocket code, you'll need to set up the full website as above, and also (temporarily) change the host in [mod/files/ws/host.lua](mod/files/ws/host.lua)
to point to your development server. Do not include this change in your commits.

# Contributors

- [Soler91](https://github.com/soler91) - initial development, thanks <3
- [myndzi](https://github.com/Noita-Community) - current maintainer
- [DunkOrSlam](https://twitch.tv/dunkorslam) - website hosting
- [teh60](https://github.com/teh60) - continuing development
    - [Conga Lyne](https://github.com/Conga0) - provided Apotheosis data, thanks <3
    - [ipeterov](https://github.com/ipeterov/noita-progress) - remade hsaria's original NoitaProgressTable, teh60 looked at their scraper python scripts for the basis of his data.wak python scraping
    - [lightbourn.net](https://lightbourn.net/games/Noita/editor.html) - teh60 also looked at their implementation of JS salakieli decoding

# License

Streamer Wands is released under the [MIT license](https://www.tldrlegal.com/license/mit-license)
