#!/usr/bin/env bash
# Build this deployment's image from the checkout. Does not touch the running container;
# run ops/reload.sh <deployment> afterwards to start using the new image.
#
# Production and dev normally run the image CI published (ops/update.sh). Building here is for the
# local deployment, and for running code CI has not published. Either way the image becomes
# <name>:latest, and the one it replaces is kept as <name>:previous.
#
#   --yes   do not ask before acting

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
revision="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
confirm "build the image $IMAGE:latest from this checkout (revision $revision)"

current="$(docker image inspect --format '{{ .Id }}' "$IMAGE:latest" 2>/dev/null || true)"
docker build \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD 2>/dev/null || echo unknown)" \
    --tag "$IMAGE:$revision" .
if [ -n "$current" ] && [ "$current" != "$(docker image inspect --format '{{ .Id }}' "$IMAGE:$revision")" ]; then
    docker tag "$current" "$IMAGE:previous"
    echo "kept the previous $IMAGE:latest as $IMAGE:previous"
fi
docker tag "$IMAGE:$revision" "$IMAGE:latest"

echo "built $IMAGE:latest ($IMAGE:$revision)"
