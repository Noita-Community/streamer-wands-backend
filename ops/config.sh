# Operational names shared by the scripts in this directory. Sourced, not executed.
#
# These are names and paths only. Application settings (the environment the server runs with)
# are defined in reload.sh. Secret values live in files under SECRETS_DIR and are never in git.
#
# Each value can be overridden for one invocation by setting it in the caller's environment,
# for example: SECRETS_DIR=./dev-secrets HOST_PORT=3001 ops/reload.sh

# Docker image built by rebuild.sh and run by reload.sh.
IMAGE="${IMAGE:-onlywands}"

# Name of the running container.
CONTAINER="${CONTAINER:-onlywands}"

# Named volume holding the sqlite database, mounted at /data in the container.
VOLUME="${VOLUME:-onlywands-data}"

# Host port the server is published on. The container always listens on 3000.
HOST_PORT="${HOST_PORT:-3000}"

# Host directory holding one file per secret, mounted read-only at /run/secrets:
#   twitch_client_secret   from the Twitch developer console
#   jwt_secret             must equal the previous server's JWT_SECRET so installed mods keep working
#   session_secret
SECRETS_DIR="${SECRETS_DIR:-/srv/onlywands/secrets}"
