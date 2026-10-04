# Streamer Wands. Two stages: one builds the frontend, the other runs the server.
#
# The server has no build step of its own; Node runs its TypeScript sources directly.
#
# Built by ops/rebuild.sh and run by ops/reload.sh, which is where the environment is defined.

FROM node:26-slim AS base
WORKDIR /app
# Keep in step with the pnpm version the lockfile was written by.
RUN npm install --global pnpm@12.9.1
COPY package.json pnpm-lock.yaml ./

# --- Build the frontend into dist/web -------------------------------------------------------
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY vite.config.ts ./
COPY web ./web
# The frontend imports the snapshot types from the server's schema.
COPY server ./server
RUN pnpm exec vite build

# --- Runtime --------------------------------------------------------------------------------
FROM base
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod

COPY server ./server
COPY mod ./mod
COPY --from=build /app/dist/web ./dist/web

# The sqlite database lives on a volume so it survives the container.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/main.ts"]
