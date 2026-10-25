#!/usr/bin/env bash
# Run the server straight from this checkout, without Docker, restarting when its sources
# change. For the local deployment only. `pnpm dev` runs this.
#
# The frontend and the mod release are not built here: run `pnpm build` first, or
# `pnpm build:watch` alongside, and `pnpm release` after changing the mod.

set -euo pipefail
source "$(dirname "$0")/config.sh"
cd "$REPO"

load_this_deployment
[ "$DEPLOYMENT" = local ] || die "this clone is the $DEPLOYMENT deployment; ops/local.sh is only for local"
require_secrets
[ -d "$DATA_DIR" ] || die "missing directory: $DATA_DIR (it is part of the repository)"
[ -d dist/web/pages ] || die "the frontend has not been built. Run: pnpm build"

server_env "$HOST_PORT" "$DATA_DIR/onlywands.sqlite" "$SECRETS_DIR"
echo "local server at $PUBLIC_URL"
exec env "${SERVER_ENV[@]}" node --watch server/main.ts
