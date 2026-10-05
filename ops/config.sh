# What differs between one deployment and another. Sourced, not executed.
#
# The rest of the server's environment is defined in reload.sh. Secret values live in files
# under SECRETS_DIR and are never in git.
#
# Each value can be overridden for one invocation by setting it in the caller's environment.
# A second deployment on the same host, such as a development site, overrides all of them:
#
#   PUBLIC_URL=https://dev.onlywands.com TWITCH_CLIENT_ID=... \
#   IMAGE=onlywands-dev CONTAINER=onlywands-dev VOLUME=onlywands-dev-data HOST_PORT=3001 \
#   SECRETS_DIR=/srv/onlywands-dev/secrets ops/reload.sh

# Origin the site is reached at, with no trailing slash. The Twitch login callback, the address
# written into downloaded mods and the address viewers' pages connect to all come from this, so
# a mod downloaded from a deployment talks to that deployment.
PUBLIC_URL="${PUBLIC_URL:-https://onlywands.com}"

# Client id of the Twitch application used for login. Its secret goes in SECRETS_DIR. The
# application must have $PUBLIC_URL/auth/twitch/callback registered as a redirect URL.
TWITCH_CLIENT_ID="${TWITCH_CLIENT_ID:-REPLACE_WITH_TWITCH_CLIENT_ID}"

# Docker image built by rebuild.sh and run by reload.sh.
IMAGE="${IMAGE:-onlywands}"

# Name of the running container.
CONTAINER="${CONTAINER:-onlywands}"

# Named volume holding the sqlite database, mounted at /data in the container.
VOLUME="${VOLUME:-onlywands-data}"

# Host port the server is published on, for nginx to proxy to. Bound to 127.0.0.1 only. The
# container always listens on 3000.
HOST_PORT="${HOST_PORT:-3000}"

# Host directory holding one file per secret, mounted read-only at /run/secrets:
#   twitch_client_secret   from the Twitch developer console
#   jwt_secret             signs the token in every downloaded mod; changing it locks them all out
#   session_secret
SECRETS_DIR="${SECRETS_DIR:-/srv/onlywands/secrets}"
