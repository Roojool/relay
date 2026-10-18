# Relay worker contract

Relay proves every shipment leg hands off to a legal, awake, certified driver — prove it on the graph. Read `src/lib/types.ts` as the single source of truth; report any needed change to the orchestrator instead of editing it silently. All fixture data is fictional. No secrets or account details in this repository.

## App API (route handlers under `src/app/api/`)
- `GET /api/workspace` => `{workspace: Workspace}` — load or create the cookie-bound anonymous workspace; never accept a workspace id from the client payload
- `POST /api/analyze` `{revision: number, live?: boolean}` => `{workspace: Workspace, analysis: Analysis}`
- `PATCH /api/workspace` `{revision: number, edit: WorkspaceEdit}` => `{workspace: Workspace}` — optimistic concurrency on `revision`; stale => HTTP 409 `{error: "stale_revision", code: "409"}`
- `POST /api/approve` `{revision: number, proposalId: string, idempotencyKey: string}` => `{workspace: Workspace, decision: Decision}` — idempotent by `idempotencyKey`
- `POST /api/reset` `{}` => `{workspace: Workspace}` — fresh fixture workspace for the selected scenario
- `POST /api/memory` `{message: string, live?: boolean}` => `{reply: AgentReply, workspace: Workspace}` — deterministic replay; reply mode is always truthful (`deterministic`)
- `GET /api/health` => status + public capability booleans (never secrets)
- Errors are `{error: string, code: string}` with HTTP 400/409/429/503. **FalkorDB unreachable => HTTP 503 `{error: "graph_unavailable"}`** — never substitute in-memory business state.

## Backend module exports
- `src/lib/business-setup.ts`: `createFixture(id: string, scenario: ScenarioId): Workspace` + the three scenarios S1/S2/S3 from `.commander/context/02_WAVE_1_FLAGSHIPS.md`
- `src/lib/domain.ts` (100% deterministic, pure): `checkPlan(workspace, changes?, commitmentIds?): CheckResult`, `proposeRepairs(workspace): Proposal[]` (never mutates input; same input => same output, always)
- `src/lib/graph.ts`: `readWorkspace`, `createWorkspace`, `analyzeWorkspace`, `editWorkspace`, `approveProposal`, `recallMemory`, `graphHealth` — FalkorDB client 6.8.0, per-workspace graph key `relay-ws-<opaque-server-id>`, optimistic Cypher guard `WHERE w.revision = $expectedRevision`, dependencies discovered via real traversals, proposals/decisions/memory persisted, snapshot recovery proven
- `src/lib/agents.ts`: deterministic analysis + memory; truthful unavailable state when no provider key

## Hero dataset (S1)
Final leg L-31 (hazmat class 3, due 06:00) is driven by Driver Okafor with 47 minutes remaining HOS clock — the route needs 3h12m. Alternate driver Salas is hazmat-endorsed but docked into a rest obligation. A hub rotation pair works (Okafor drives 40 min to Ravensgate, meets post-rest Salas, Salas takes custody for the final 2h32m). A triple split across 3 drivers violates the single-custody hazmat rule. Valid repair: split L-31 at Hub Ravensgate into two relay legs. Rejected candidate: Driver Petrov (endorsed, but hazmat single-custody violation via 3-way split; HOS borderline). Approval fact "emergency-hos-exemption-okafor" re-enables single-driver completion. Unknown trailer class on a legacy manifest surfaces truthfully as unknown — never guessed.

## Interface worker ownership
`src/app/**`, `src/components/**` only. Warm Studio Editorial Dark theme cloned from PACT (read-only reference `pact/src/app/globals.css`, `dashboard.css`, `setup.css`). All 12 components: BusinessSetup, DashboardView, OverviewView, HeroBottleneckCard, ConflictEvidenceView, RepairComparisonView, SavedReceiptsView, StudioMemoryView, SourceDrawer, EditModals, Header, SkeletonLoader + `/blog`. Every control functional; truthful status badges; honest unavailable states.

## Boundaries
Only modify assigned files. Never modify `pact/`. Strict TypeScript must compile (`tsc --noEmit`). Deterministic core must not depend on network, clock time, or random. Commit messages: `relay: phase <NN> <name>`; before any commit run `git grep -E "hf_|gsk_|sk-or-v1-"` and require empty output.
