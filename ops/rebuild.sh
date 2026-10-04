#!/usr/bin/env bash
# Build the image from the current checkout. Does not touch the running container;
# run ops/reload.sh afterwards to start using the new image.

set -euo pipefail
cd "$(dirname "$0")/.."
source ops/config.sh

revision="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

docker build --tag "$IMAGE:latest" --tag "$IMAGE:$revision" .

echo "built $IMAGE:latest ($IMAGE:$revision)"
