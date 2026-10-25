# streamer-wands-backend

The Streamer Wands mod for Noita is a mod that lets viewers see what spells and wands you are using on a website, as a companion to streaming Noita gameplay.
To use it, you should log in with Twitch at https://onlywands.com and download a customized mod package from that site. This customization "binds" your copy
of the mod to your Twitch username, so you should not share the zip file with others. The token included in the zip file only identifies your Twitch ID and
display name, but does not grant any access to your Twitch account.

Streamer Wands requires installation as an "unsafe" mod since it establishes a websocket to a remote server to send updates when your wands or spell change.
See the [Noita Wiki](https://noita.wiki.gg/wiki/How_to_install_mods#Manual) for instructions on manually installing a mod.

# Mod status

No future feature development is planned by the maintainer, but pull requests are welcomed. Read on for development information.

# Development

This repository holds the website, its server, and the mod itself (in [mod](mod)).

- [docs/developing.md](docs/developing.md): how it fits together, and how to run it locally, including working on the mod
- [docs/operating.md](docs/operating.md): setting up a host, deploying, updating, backups
- [docs/future-work.md](docs/future-work.md): known gaps and ideas nobody has scheduled

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
