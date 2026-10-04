#!/usr/bin/env bash
# One-time setup on a host: create the data volume and check the secrets are in place.
# Safe to run again; it never changes or overwrites anything that already exists.
#
#   ops/setup.sh                      create the volume, report missing secret files
#   ops/setup.sh --generate-secrets   also create the secrets directory and generate random
#                                     values for the secrets that are ours to choose
#
# Generated: session_secret, jwt_secret. Only when the file does not exist yet.
# Never generated: twitch_client_secret. That value comes from the Twitch developer console.
#
# A generated jwt_secret is only right for a new or development deployment. When replacing the
# previous server, copy its JWT_SECRET into the jwt_secret file instead, or every installed mod
# stops being able to connect.

set -euo pipefail
cd "$(dirname "$0")/.."
source ops/config.sh

generate=0
for arg in "$@"; do
    case "$arg" in
        --generate-secrets) generate=1 ;;
        -h | --help)
            sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "unknown argument: $arg" >&2
            exit 2
            ;;
    esac
done

if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
    echo "volume $VOLUME already exists"
else
    docker volume create "$VOLUME" >/dev/null
    echo "created volume $VOLUME"
fi

if [ "$generate" -eq 1 ]; then
    if [ ! -d "$SECRETS_DIR" ]; then
        mkdir -p "$SECRETS_DIR"
        chmod 700 "$SECRETS_DIR"
        echo "created $SECRETS_DIR"
    fi
    for name in session_secret jwt_secret; do
        file="$SECRETS_DIR/$name"
        if [ -e "$file" ]; then
            echo "kept existing $file"
            continue
        fi
        # Create the file with restrictive permissions before anything is written to it.
        (umask 077 && head -c 48 /dev/urandom | base64 | tr -d '\n' >"$file")
        echo "generated $file"
        if [ "$name" = jwt_secret ]; then
            echo "  note: a new jwt_secret invalidates every previously issued mod token." >&2
            echo "  when replacing an existing server, overwrite this file with its JWT_SECRET." >&2
        fi
    done
fi

missing=0
for name in twitch_client_secret jwt_secret session_secret; do
    if [ ! -s "$SECRETS_DIR/$name" ]; then
        echo "missing or empty secret file: $SECRETS_DIR/$name" >&2
        missing=1
    fi
done
if [ "$missing" -ne 0 ]; then
    echo "create the files above (one value per file, mode 600)." >&2
    echo "twitch_client_secret comes from the Twitch developer console; the others can be" >&2
    echo "generated with: ops/setup.sh --generate-secrets" >&2
    exit 1
fi

echo "setup complete; next: ops/rebuild.sh, then ops/reload.sh"
