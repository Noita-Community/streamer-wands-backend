#!/usr/bin/env bash
# Update this deployment's container to the image CI published, or roll it back.
#
#   ops/update.sh <deployment>              pull the deployment's IMAGE_TAG, normally `stable`
#   ops/update.sh <deployment> <tag>        pull a particular build, e.g. 20261025-c6ccd7e
#   ops/update.sh <deployment> --rollback   go back to the image that ran before the last update
#
#   --yes   do not ask before acting
#
# The deployment must be named, and must be the one this clone was set up as; there is no
# default. If the image is the one already running, nothing changes.
#
# The new container must pass its health check within a minute. If it does not, the container
# that was running before is started again, and the script fails.
#
# The image that runs is tagged <name>:latest, and with its git revision. The one it replaced is
# kept as <name>:previous, which --rollback swaps back in; rolling back twice undoes the rollback.

set -euo pipefail
source "$(dirname "$0")/config.sh"
cd "$REPO"

requested=""
tag=""
rollback=0
for arg in "$@"; do
    case "$arg" in
        --rollback) rollback=1 ;;
        --yes) ASSUME_YES=1 ;;
        -h | --help)
            sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*) die "unknown option: $arg" ;;
        *)
            if [ -z "$requested" ]; then
                requested="$arg"
            elif [ -z "$tag" ]; then
                tag="$arg"
            else
                die "unexpected argument: $arg"
            fi
            ;;
    esac
done

require_named_deployment "$requested" ops/update.sh
[ "$rollback" -eq 0 ] || [ -z "$tag" ] || die "--rollback takes no tag"
require_secrets
[ -d "$DATA_DIR" ] || die "missing directory: $DATA_DIR (it is part of the repository)"

current="$(running_image)"

if [ "$rollback" -eq 1 ]; then
    docker image inspect "$IMAGE:previous" >/dev/null 2>&1 || die "there is no $IMAGE:previous to roll back to"
    target_ref="$IMAGE:previous"
    confirm "replace the container $CONTAINER with one from $target_ref (revision $(image_revision "$target_ref" || true))"
else
    target_ref="$REGISTRY_IMAGE:${tag:-$IMAGE_TAG}"
    confirm "pull $target_ref and, if it is not what $CONTAINER runs now, replace the container with it"
    docker pull --quiet "$target_ref" >/dev/null
fi

target="$(docker image inspect --format '{{ .Id }}' "$target_ref")"
revision="$(image_revision "$target")"
if [ "$target" = "$current" ]; then
    echo "$CONTAINER already runs $target_ref (revision ${revision:-unknown}); nothing to do"
    exit 0
fi

stop_container
docker tag "$target" "$IMAGE:latest"
start_container "$IMAGE:latest"
if ! wait_healthy; then
    stop_container
    if [ -n "$current" ]; then
        echo "starting the container that ran before" >&2
        docker tag "$current" "$IMAGE:latest"
        start_container "$IMAGE:latest"
        wait_healthy || echo "the container that ran before is not healthy either" >&2
        die "update failed; $CONTAINER runs what it ran before"
    fi
    docker image rm "$IMAGE:latest" >/dev/null
    die "update failed; $CONTAINER is not running"
fi

[ -z "$current" ] || docker tag "$current" "$IMAGE:previous"
[ -z "$revision" ] || docker tag "$target" "$IMAGE:$revision"

echo "$CONTAINER now runs revision ${revision:-unknown} ($target_ref)"
[ -z "$current" ] || echo "the image it replaced is $IMAGE:previous (revision $(image_revision "$current" || true)); ops/update.sh $DEPLOYMENT --rollback to go back"
echo "logs: docker logs -f $CONTAINER"
