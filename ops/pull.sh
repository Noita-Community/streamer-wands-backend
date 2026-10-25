#!/usr/bin/env bash
# Fetch this deployment's image from the registry CI publishes to. Does not touch the running
# container; run ops/reload.sh afterwards to start using the new image.
#
#   ops/pull.sh          the deployment's IMAGE_TAG, normally `stable`
#   ops/pull.sh <tag>    a particular build instead, e.g. 20261025-c6ccd7e to roll back
#
#   --yes   do not ask before acting
#
# The pulled image becomes <name>:latest, which is what ops/reload.sh runs, and is also tagged
# with its git revision. The image that was <name>:latest before is kept as <name>:previous.

set -euo pipefail
source "$(dirname "$0")/config.sh"
cd "$REPO"

tag=""
for arg in "$@"; do
    case "$arg" in
        --yes) ASSUME_YES=1 ;;
        -h | --help)
            sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*) die "unknown option: $arg" ;;
        *) tag="$arg" ;;
    esac
done

load_this_deployment
source_ref="$REGISTRY_IMAGE:${tag:-$IMAGE_TAG}"
confirm "pull $source_ref and make it $IMAGE:latest, keeping the current one as $IMAGE:previous"

docker pull --quiet "$source_ref" >/dev/null
pulled="$(docker image inspect --format '{{ .Id }}' "$source_ref")"
current="$(docker image inspect --format '{{ .Id }}' "$IMAGE:latest" 2>/dev/null || true)"
revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$source_ref")"
revision="${revision:0:7}"

if [ "$pulled" = "$current" ]; then
    echo "$IMAGE:latest is already $source_ref (revision ${revision:-unknown}); nothing to do"
    exit 0
fi

if [ -n "$current" ]; then
    docker tag "$current" "$IMAGE:previous"
    echo "kept the previous $IMAGE:latest as $IMAGE:previous"
fi
docker tag "$source_ref" "$IMAGE:latest"
[ -n "$revision" ] && docker tag "$source_ref" "$IMAGE:$revision"

echo "pulled $source_ref as $IMAGE:latest (revision ${revision:-unknown})"
echo "next: ops/reload.sh"
