# Relay — freight handoff relay desk
# Next.js 16 (React 19) standalone production image backed by FalkorDB.
#
# Build:  docker build -t roojool/relay .
# Run:    docker run -p 3000:3000 --env-file .env.local roojool/relay
#
# FalkorDB: local dev uses the shared FalkorDB at redis://127.0.0.1:16380.
# In Docker Compose, FALKORDB_URL=redis://falkordb:6379 (see compose.yaml).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
# Override at runtime: the shared FalkorDB is reachable at 127.0.0.1:16380 on this host.
ENV FALKORDB_URL=redis://127.0.0.1:16380
ENV SESSION_SECRET=relay-demo-secret-do-not-use-in-production
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(h=>process.exit(h.ok===true?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
