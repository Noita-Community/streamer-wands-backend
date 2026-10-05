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

# Load the deployment named $1: sets NAME, PUBLIC_URL, HOST_PORT and LOG_LEVEL from its file, and
# the Docker names that follow from NAME.
load_deployment() {
    DEPLOYMENT="$1"
    local file="$REPO/ops/deployments/$DEPLOYMENT.sh"
    [ -f "$file" ] || die "no such deployment: $DEPLOYMENT (there are: $(deployment_names | xargs))"
    LOG_LEVEL=info
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
