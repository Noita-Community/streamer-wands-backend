# Streamer Wands. Two stages: one builds the frontend and packs the mod, the other runs the server.
#
# The server has no build step of its own; Node runs its TypeScript sources directly.
#
# Built by ops/rebuild.sh and run by ops/reload.sh, which is where the environment is defined.

FROM node:26-slim AS base
WORKDIR /app
# Keep in step with the pnpm version the lockfile was written by.
RUN npm install --global pnpm@12.9.1
COPY package.json pnpm-lock.yaml ./

# --- Build: the frontend into dist/web, the current mod into releases/ ----------------------
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY vite.config.ts ./
COPY web ./web
# The frontend imports types from the server, and the pack script imports from it too.
COPY server ./server
RUN pnpm exec vite build

COPY scripts/pack-mod.ts ./scripts/
COPY mod ./mod
# The committed releases. Packing adds the current version from mod/, replacing a committed zip
# of the same version, so the image always carries the mod as it is in this checkout.
COPY releases ./releases
RUN node scripts/pack-mod.ts

# --- Runtime --------------------------------------------------------------------------------
FROM base
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod

COPY server ./server
COPY --from=build /app/releases ./releases
COPY --from=build /app/dist/web ./dist/web

# The sqlite database lives on a volume so it survives the container.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/main.ts"]
