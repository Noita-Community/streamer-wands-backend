#!/usr/bin/env bash
# Make this clone a deployment, and check its secrets are in place.
#
#   ops/setup.sh <production|dev|local>   the first time, to say which deployment this clone is
#   ops/setup.sh                          afterwards, to check the secrets again
#
#   --generate-secrets   generate random values for the secrets that are ours to choose
#   --yes                do not ask before acting
#
# Safe to run again; it never changes the contents of anything that already exists, though it
# does make the secret files private to you if they are not. A clone stays the deployment it
# was first set up as. To change that, delete the file .deployment yourself.
#
# The secrets are files in secrets/, one value per file:
#   twitch_client_id       from the Twitch developer console. Not secret, but it belongs with
#   twitch_client_secret   the secret from the same page.
#   jwt_secret             signs the token in every mod downloaded from this deployment
#   session_secret         signs the website's login cookie
#
# --generate-secrets creates jwt_secret and session_secret when they do not exist yet. A fresh
# jwt_secret is only right for a deployment nobody has downloaded a mod from. For one that
# replaces a server already in use, put that server's JWT_SECRET in the file instead, or every
# installed mod stops being able to connect.

set -euo pipefail
source "$(dirname "$0")/config.sh"
cd "$REPO"

requested=""
generate=0
for arg in "$@"; do
    case "$arg" in
        --generate-secrets) generate=1 ;;
        --yes) ASSUME_YES=1 ;;
        -h | --help)
            sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*) die "unknown option: $arg" ;;
        *) requested="$arg" ;;
    esac
done

if [ -f "$MARKER" ]; then
    current="$(cat "$MARKER")"
    if [ -n "$requested" ] && [ "$requested" != "$current" ]; then
        die "this clone is already set up as $current. To change it, delete $MARKER first."
    fi
    load_deployment "$current"
else
    [ -n "$requested" ] || die "say which deployment this clone is: ops/setup.sh <$(deployment_names | xargs | tr ' ' '|')>"
    load_deployment "$requested"
fi

[ -d "$SECRETS_DIR" ] || die "missing directory: $SECRETS_DIR (it is part of the repository)"
[ -d "$DATA_DIR" ] || die "missing directory: $DATA_DIR (it is part of the repository)"

if [ "$generate" -eq 1 ]; then
    confirm "set this clone up as $DEPLOYMENT, and generate any missing jwt_secret and session_secret"
else
    confirm "set this clone up as $DEPLOYMENT"
fi

if [ ! -f "$MARKER" ]; then
    echo "$DEPLOYMENT" >"$MARKER"
    echo "recorded this clone as $DEPLOYMENT"
fi

# Only the operator may look inside either directory.
chmod 700 "$SECRETS_DIR" "$DATA_DIR"

if [ "$generate" -eq 1 ]; then
    for name in jwt_secret session_secret; do
        file="$SECRETS_DIR/$name"
        if [ -e "$file" ]; then
            echo "kept existing $file"
            continue
        fi
        # Create the file with restrictive permissions before anything is written to it.
        (umask 077 && head -c 48 /dev/urandom | base64 | tr -d '\n' >"$file")
        echo "generated $file"
        if [ "$name" = jwt_secret ]; then
            echo "  note: when replacing a server already in use, overwrite this file with that" >&2
            echo "  server's JWT_SECRET, or every installed mod stops being able to connect." >&2
        fi
    done
fi

missing=0
for name in "${SECRET_FILES[@]}"; do
    if [ ! -s "$SECRETS_DIR/$name" ]; then
        echo "missing or empty: $SECRETS_DIR/$name" >&2
        missing=1
    else
        # A file made by hand may be readable by others. Its contents are left alone.
        chmod 600 "$SECRETS_DIR/$name"
    fi
done
if [ "$missing" -ne 0 ]; then
    echo "create the files above, one value per file, readable only by you (chmod 600)." >&2
    echo "twitch_client_id and twitch_client_secret come from the Twitch developer console;" >&2
    echo "the others can be generated with: ops/setup.sh --generate-secrets" >&2
    exit 1
fi

if [ "$DEPLOYMENT" = local ]; then
    echo "setup complete; next: pnpm install, pnpm build, pnpm dev"
else
    echo "setup complete; next: ops/rebuild.sh, then ops/reload.sh"
fi
