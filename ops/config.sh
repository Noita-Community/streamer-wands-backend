# Shared by the scripts in this directory. Sourced, not executed.
#
# A clone of this repository is one deployment: production, dev or local. Which one is recorded
# in the file .deployment at the top of the clone, written once by `ops/setup.sh <deployment>`
# and not in git. Every other script reads it. There is no default, so a clone that has not been
# set up cannot act on anything.
#
# What each deployment is lives in ops/deployments/<name>.sh, in git. Everything a deployment
# writes stays inside its clone:
#   secrets/   one file per secret, private to the operator; see ops/setup.sh
#   data/      the sqlite database
# Both directories are in git, empty, with their contents ignored. The scripts never create
# them: if one is missing, something is wrong with the clone.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$REPO/.deployment"
SECRETS_DIR="$REPO/secrets"
DATA_DIR="$REPO/data"

# Where CI publishes the server's image (.github/workflows/build.yml). ops/update.sh fetches it from
# here; a deployment's file may set IMAGE_TAG to run something other than `stable`.
REGISTRY_IMAGE=ghcr.io/noita-community/streamer-wands-backend

# The files that must be in secrets/ before the server can start.
SECRET_FILES=(twitch_client_id twitch_client_secret jwt_secret session_secret)

die() {
    echo "$*" >&2
    exit 1
}

# The deployments there are, from the files in ops/deployments/.
deployment_names() {
    local file
    for file in "$REPO"/ops/deployments/*.sh; do
        basename "$file" .sh
    done
}

# Load the deployment named $1: sets NAME, PUBLIC_URL, HOST_PORT, LOG_LEVEL and IMAGE_TAG from its
# file, and the Docker names that follow from NAME. IMAGE is the local name of the image the
# container runs, whether pulled (ops/update.sh) or built here (ops/rebuild.sh).
load_deployment() {
    DEPLOYMENT="$1"
    local file="$REPO/ops/deployments/$DEPLOYMENT.sh"
    [ -f "$file" ] || die "no such deployment: $DEPLOYMENT (there are: $(deployment_names | xargs))"
    LOG_LEVEL=info
    IMAGE_TAG=stable
    # shellcheck source=/dev/null
    source "$file"
    IMAGE="$NAME"
    CONTAINER="$NAME"
}

# Load the deployment this clone was set up as.
load_this_deployment() {
    [ -f "$MARKER" ] || die "this clone has not been set up. Run: ops/setup.sh <$(deployment_names | xargs | tr ' ' '|')>"
    load_deployment "$(cat "$MARKER")"
}

# Load the deployment this clone was set up as, and stop unless $1 names it. For the scripts that
# replace a running container: the deployment must be named every time, with no default.
#   $1  the deployment named on the command line
#   $2  the command, for the message when it is missing
require_named_deployment() {
    [ -n "$1" ] || die "say which deployment: $2 <$(deployment_names | xargs | tr ' ' '|')>"
    load_this_deployment
    [ "$1" = "$DEPLOYMENT" ] || die "this clone is the $DEPLOYMENT deployment, not $1. Run this from the $1 clone."
}

# Say what is about to be acted on and ask to go ahead. $1 is what the script will do.
# Pass --yes to a script to skip the question.
confirm() {
    echo "deployment: $DEPLOYMENT"
    echo "  site:       $PUBLIC_URL"
    echo "  container:  $CONTAINER, listening on 127.0.0.1:$HOST_PORT"
    echo "  clone:      $REPO"
    echo "about to: $1"
    if [ "${ASSUME_YES:-0}" -eq 1 ]; then
        return
    fi
    local answer
    read -r -p "go ahead? [y/N] " answer
    case "$answer" in
        y | Y | yes) ;;
        *) die "stopped; nothing was done" ;;
    esac
}

# Stop unless every secret file is present and not empty.
require_secrets() {
    [ -d "$SECRETS_DIR" ] || die "missing directory: $SECRETS_DIR (it is part of the repository)"
    local name missing=0
    for name in "${SECRET_FILES[@]}"; do
        if [ ! -s "$SECRETS_DIR/$name" ]; then
            echo "missing or empty: $SECRETS_DIR/$name" >&2
            missing=1
        fi
    done
    [ "$missing" -eq 0 ] || die "run ops/setup.sh to see what each file should hold"
}

# The server's whole environment, as SERVER_ENV, an array of NAME=value. This is the one place
# it is defined; server/config.ts says what each setting means.
#   $1  port the server listens on
#   $2  path of the sqlite database, as the server sees it
#   $3  directory holding the secret files, as the server sees it
server_env() {
    SERVER_ENV=(
        "PORT=$1"
        "PUBLIC_URL=$PUBLIC_URL"
        "LOG_LEVEL=$LOG_LEVEL"
        "DB_PATH=$2"
        "RELEASES_DIR=./releases"
        "WEB_DIR=./dist/web"
        "TWITCH_CLIENT_ID_FILE=$3/twitch_client_id"
        "TWITCH_CLIENT_SECRET_FILE=$3/twitch_client_secret"
        "JWT_SECRET_FILE=$3/jwt_secret"
        "SESSION_SECRET_FILE=$3/session_secret"
    )
}

# The ID of the image the deployment's container was started from, or nothing when there is no
# container. Stops if the container exists but was started from another clone: every script
# that replaces it calls this first, so a clone never touches another clone's container.
running_image() {
    docker container inspect "$CONTAINER" >/dev/null 2>&1 || return 0
    local owner
    owner="$(docker container inspect --format '{{ index .Config.Labels "onlywands.clone" }}' "$CONTAINER")"
    if [ "$owner" != "$REPO" ]; then
        echo "the container $CONTAINER was not started from this clone." >&2
        echo "  it belongs to: ${owner:-an unknown clone}" >&2
        echo "  this clone is: $REPO" >&2
        die "if it really should be replaced from here, remove it yourself first: docker rm -f $CONTAINER"
    fi
    docker container inspect --format '{{ .Image }}' "$CONTAINER"
}

# Stop and remove the deployment's container, if there is one. SIGTERM lets the server close
# sockets and the database cleanly.
stop_container() {
    docker container inspect "$CONTAINER" >/dev/null 2>&1 || return 0
    docker stop "$CONTAINER" >/dev/null
    docker rm "$CONTAINER" >/dev/null
    echo "stopped $CONTAINER"
}

# Start the deployment's container from the image $1 (a name or an ID).
#
# The container runs as the user who runs the script, so that it can read that user's files in
# secrets/ and write the database in data/. It is labelled with the clone it was started from.
start_container() {
    server_env 3000 /data/onlywands.sqlite /run/secrets
    local setting env_flags=()
    for setting in "${SERVER_ENV[@]}"; do
        env_flags+=(--env "$setting")
    done
    docker run --detach \
        --name "$CONTAINER" \
        --label "onlywands.clone=$REPO" \
        --restart unless-stopped \
        --user "$(id -u):$(id -g)" \
        --publish "127.0.0.1:$HOST_PORT:3000" \
        --volume "$DATA_DIR:/data" \
        --volume "$SECRETS_DIR:/run/secrets:ro" \
        "${env_flags[@]}" \
        "$1" >/dev/null
    echo "started $CONTAINER for $PUBLIC_URL, on 127.0.0.1:$HOST_PORT"
}

# Wait for the container's health check (GET /healthz) to pass. Fails if it reports unhealthy,
# the container stops, or a minute goes by.
wait_healthy() {
    local status _
    for _ in $(seq 60); do
        status="$(docker container inspect --format '{{ .State.Health.Status }}' "$CONTAINER" 2>/dev/null || echo gone)"
        case "$status" in
            healthy) return 0 ;;
            unhealthy | gone) break ;;
        esac
        [ "$(docker container inspect --format '{{ .State.Running }}' "$CONTAINER")" = true ] || break
        sleep 1
    done
    echo "$CONTAINER did not become healthy (last status: $status). Its last log lines:" >&2
    docker logs --tail 20 "$CONTAINER" >&2 2>&1 || true
    return 1
}

# The short git revision an image was built from, from its label, or nothing.
image_revision() {
    local revision
    revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$1" 2>/dev/null || true)"
    echo "${revision:0:7}"
}
