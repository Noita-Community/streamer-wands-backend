#!/usr/bin/env bash
# Build this deployment's image from the checkout. Does not touch the running container;
# run ops/reload.sh afterwards to start using the new image.
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

docker build --tag "$IMAGE:latest" --tag "$IMAGE:$revision" .

echo "built $IMAGE:latest ($IMAGE:$revision)"
