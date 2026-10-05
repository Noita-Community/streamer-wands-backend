# A developer's own machine, with no nginx and no HTTPS. Sourced by ops/config.sh.
#
# Normally run without Docker, by ops/local.sh (`pnpm dev`). ops/rebuild.sh and ops/reload.sh
# work too, for trying the image.

# Names the Docker image and container.
NAME=onlywands-local

# Twitch accepts a plain http redirect URL only for localhost. Register
# http://localhost:3000/auth/twitch/callback on your own Twitch application and put its id and
# secret in secrets/.
PUBLIC_URL=http://localhost:3000

# The port in PUBLIC_URL.
HOST_PORT=3000

LOG_LEVEL=debug
