#!/usr/bin/env bash
# Restart this deployment's container on the image it runs, so that it reads its secrets again.
# After building an image with ops/rebuild.sh, this is what starts using it.
#
#   ops/reload.sh <deployment>
#
#   --yes   do not ask before acting
#
# The deployment must be named, and must be the one this clone was set up as; there is no
# default.
#
# It starts <name>:latest: the image the container was last updated to (ops/update.sh), or the
# last one built here. This script will not replace a container that another clone started.

set -euo pipefail
source "$(dirname "$0")/config.sh"
cd "$REPO"

requested=""
for arg in "$@"; do
    case "$arg" in
        --yes) ASSUME_YES=1 ;;
        -*) die "unknown option: $arg" ;;
        *)
            [ -z "$requested" ] || die "unexpected argument: $arg"
            requested="$arg"
            ;;
    esac
done

require_named_deployment "$requested" ops/reload.sh
require_secrets
[ -d "$DATA_DIR" ] || die "missing directory: $DATA_DIR (it is part of the repository)"
docker image inspect "$IMAGE:latest" >/dev/null 2>&1 || die "there is no $IMAGE:latest yet. Run: ops/update.sh $DEPLOYMENT"
running_image >/dev/null

confirm "replace the container $CONTAINER with one from $IMAGE:latest (revision $(image_revision "$IMAGE:latest"))"

stop_container
start_container "$IMAGE:latest"
wait_healthy || die "$CONTAINER is not healthy"
echo "logs: docker logs -f $CONTAINER"
