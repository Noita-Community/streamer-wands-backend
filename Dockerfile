# Streamer Wands server. Node runs the TypeScript sources directly; there is no build step.
#
# NOTE: written without Docker available to test it. Build and run once before relying on it.
#
# Built by ops/rebuild.sh and run by ops/reload.sh, which is where the environment is defined.

FROM node:26-slim

ENV NODE_ENV=production
WORKDIR /app

# Keep in step with the pnpm version the lockfile was written by.
RUN npm install --global pnpm@12.9.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY server ./server
COPY mod ./mod

# The sqlite database lives on a volume so it survives the container.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/main.ts"]
