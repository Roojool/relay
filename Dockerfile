# Relay — freight handoff relay desk
# Next.js 16 (React 19) standalone production image backed by FalkorDB.
#
# Build:  docker build -t roojool/relay .
# Run:    docker run -p 3000:3000 --env-file .env.local roojool/relay
#
# FalkorDB: local dev uses the shared FalkorDB at redis://127.0.0.1:16380.
# In Docker Compose, FALKORDB_URL=redis://falkordb:6379 (see compose.yaml).

FROM node:22-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Override at runtime: the shared FalkorDB is reachable at 127.0.0.1:16380 on this host.
ENV FALKORDB_URL=redis://127.0.0.1:16380
ENV SESSION_SECRET=relay-demo-secret-do-not-use-in-production

# Next.js standalone output + static assets + production node_modules (falkordb, zod, etc.)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',(r)=>{process.exit(r.statusCode===200?0:1);}).on('error',()=>process.exit(1));"

CMD ["node", "server.js"]
