# Relay — Freight Handoff Relay Desk

Prove every shipment leg hands off to a legal, awake, certified driver — on a FalkorDB graph.

## Stack

Next.js 16 (React 19), FalkorDB 6.8.0, Zod 4.6.7, TypeScript strict. Deployed with Docker Compose; local dev targets the shared FalkorDB at `redis://127.0.0.1:16380`.

## Scripts

- `npm run dev` — Next.js dev server on `http://127.0.0.1:3000`
- `npm run build` — production build (standalone output)
- `npm run start` — production server
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — deterministic domain unit tests (no database)
- `npm run test:integration` — FalkorDB integration tests (requires `.env.local`)

## Environment

Copy `.env.local` (gitignored) with:

```
FALKORDB_URL=redis://127.0.0.1:16380
SESSION_SECRET=<at least 32 chars>
```

## Scenarios

- **S1 (hero):** Leg L-31 hazmat class 3, Okafor's HOS clock has 47 min left but the route needs 3h12m. Pair split at Hub Ravensgate works; triple split violates single-custody hazmat.
- **S2:** Dock capacity 2 vs 3 inbound relay legs in the same window — capacity conflict, repair = stagger 45 min.
- **S3:** Unknown trailer class on a legacy manifest — surfaced as unknown, blocked from auto-assignment.

All fixture data is fictional.
