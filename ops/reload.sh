#!/usr/bin/env bash
# Replace the running container with one started from the current image.
#
# This is the one place the server's environment is defined. Every setting it reads is listed
# here explicitly; server/config.ts says what each one means. Secret values are not in this
# file: the *_FILE variables point at files mounted from SECRETS_DIR.

set -euo pipefail
cd "$(dirname "$0")/.."
source ops/config.sh

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    # SIGTERM lets the server close sockets and the database cleanly.
    docker stop "$CONTAINER" >/dev/null
    docker rm "$CONTAINER" >/dev/null
    echo "stopped previous $CONTAINER"
fi

docker run --detach \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --publish "$HOST_PORT:3000" \
    --volume "$VOLUME:/data" \
    --volume "$SECRETS_DIR:/run/secrets:ro" \
    --env PORT=3000 \
    --env PUBLIC_URL=https://onlywands.com \
    --env TRUST_PROXY=true \
    --env LOG_LEVEL=info \
    --env DB_PATH=/data/onlywands.sqlite \
    --env MOD_DIR=./mod \
    --env TWITCH_CLIENT_ID=REPLACE_WITH_TWITCH_CLIENT_ID \
    --env TWITCH_CLIENT_SECRET_FILE=/run/secrets/twitch_client_secret \
    --env JWT_SECRET_FILE=/run/secrets/jwt_secret \
    --env SESSION_SECRET_FILE=/run/secrets/session_secret \
    "$IMAGE:latest" >/dev/null

echo "started $CONTAINER from $IMAGE:latest on port $HOST_PORT"
echo "logs: docker logs -f $CONTAINER"
