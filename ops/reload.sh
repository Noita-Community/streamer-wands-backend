#!/usr/bin/env bash
# Replace this deployment's running container with one started from its current image.
#
#   --yes   do not ask before acting
#
# The container runs as the user who runs this script, so that it can read that user's files
# in secrets/ and write the database in data/. It is labelled with the clone it was started
# from, and this script will not replace a container that another clone started.

set -euo pipefail
source "$(dirname "$0")/config.sh"
cd "$REPO"

for arg in "$@"; do
    case "$arg" in
        --yes) ASSUME_YES=1 ;;
        *) die "unknown argument: $arg" ;;
    esac
done

load_this_deployment
require_secrets
[ -d "$DATA_DIR" ] || die "missing directory: $DATA_DIR (it is part of the repository)"

running=0
if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    running=1
    owner="$(docker container inspect --format '{{ index .Config.Labels "onlywands.clone" }}' "$CONTAINER")"
    if [ "$owner" != "$REPO" ]; then
        echo "the container $CONTAINER was not started from this clone." >&2
        echo "  it belongs to: ${owner:-an unknown clone}" >&2
        echo "  this clone is: $REPO" >&2
        die "if it really should be replaced from here, remove it yourself first: docker rm -f $CONTAINER"
    fi
fi

confirm "replace the running container $CONTAINER with one from $IMAGE:latest"

if [ "$running" -eq 1 ]; then
    # SIGTERM lets the server close sockets and the database cleanly.
    docker stop "$CONTAINER" >/dev/null
    docker rm "$CONTAINER" >/dev/null
    echo "stopped previous $CONTAINER"
fi

server_env 3000 /data/onlywands.sqlite /run/secrets
env_flags=()
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
    "$IMAGE:latest" >/dev/null

echo "started $CONTAINER from $IMAGE:latest for $PUBLIC_URL, on 127.0.0.1:$HOST_PORT"
echo "logs: docker logs -f $CONTAINER"
