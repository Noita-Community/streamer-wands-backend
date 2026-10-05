#!/usr/bin/env bash
# Replace the running container with one started from the current image.
#
# This is the one place the server's environment is defined. Every setting it reads is listed
# here explicitly; server/config.ts says what each one means. The values that differ between
# deployments come from ops/config.sh. Secret values are not in this file: the *_FILE variables
# point at files mounted from SECRETS_DIR.

set -euo pipefail
cd "$(dirname "$0")/.."
source ops/config.sh

if [ "$TWITCH_CLIENT_ID" = REPLACE_WITH_TWITCH_CLIENT_ID ]; then
    echo "set TWITCH_CLIENT_ID in ops/config.sh or the environment" >&2
    exit 1
fi

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    # SIGTERM lets the server close sockets and the database cleanly.
    docker stop "$CONTAINER" >/dev/null
    docker rm "$CONTAINER" >/dev/null
    echo "stopped previous $CONTAINER"
fi

docker run --detach \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --publish "127.0.0.1:$HOST_PORT:3000" \
    --volume "$VOLUME:/data" \
    --volume "$SECRETS_DIR:/run/secrets:ro" \
    --env PORT=3000 \
    --env PUBLIC_URL="$PUBLIC_URL" \
    --env LOG_LEVEL=info \
    --env DB_PATH=/data/onlywands.sqlite \
    --env RELEASES_DIR=./releases \
    --env WEB_DIR=./dist/web \
    --env TWITCH_CLIENT_ID="$TWITCH_CLIENT_ID" \
    --env TWITCH_CLIENT_SECRET_FILE=/run/secrets/twitch_client_secret \
    --env JWT_SECRET_FILE=/run/secrets/jwt_secret \
    --env SESSION_SECRET_FILE=/run/secrets/session_secret \
    "$IMAGE:latest" >/dev/null

echo "started $CONTAINER from $IMAGE:latest for $PUBLIC_URL, on 127.0.0.1:$HOST_PORT"
echo "logs: docker logs -f $CONTAINER"
