# Relay — Submission Pack

## Project
- **Name:** Relay — Freight Handoff Relay Desk
- **Slug:** relay
- **Wave:** 1 (flagship)
- **Repository:** Roojool/relay
- **Hugging Face Space:** roojool/relay (Docker)
- **Vercel:** relay (production deployment)

## Domain
Every shipment leg hands off to a legal, awake, certified driver — proved on a FalkorDB graph. Hazmat single-custody, hours-of-service clocks, dock capacity, and alternate-driver endorsement are modeled as graph nodes and edges; coverage is discovered by real traversals, never denormalized foreign keys.

## Hero scenario (S1, fictional)
Leg L-31 (hazmat class 3, due 06:00) is driven by Driver Okafor with 47 minutes remaining on his HOS clock — the route needs 3h12m. Alternate driver Salas is hazmat-endorsed but docked into a rest obligation. A hub rotation pair works: Okafor drives 40 minutes to Hub Ravensgate, meets post-rest Salas, and Salas takes custody for the final 2h32m. A triple split across 3 drivers violates the single-custody hazmat rule. Valid repair: split L-31 at Ravensgate into two relay legs. Rejected candidate: Driver Petrov (endorsed, but single-custody violation via 3-way split; HOS borderline). Approval fact "emergency-hos-exemption-okafor" re-enables single-driver completion.

## API surface
`GET /api/workspace`, `POST /api/analyze`, `PATCH /api/workspace`, `POST /api/approve`, `POST /api/reset`, `POST /api/memory`, `GET /api/health` — FalkorDB-backed, cookie-bound anonymous workspaces, optimistic concurrency on `revision`, 503 `graph_unavailable` when FalkorDB is unreachable (no in-memory fallback).

## Phases
- 01 Contract & Scaffold — complete (`.phase_01_CONTRACT_AND_SCAFFOLD.done`)
- 02 FalkorDB Graph & Cypher — complete (`.phase_02_FALKORDB_GRAPH_AND_CYPHER.done`)
- 03 Deterministic Domain & Agents — complete (`.phase_03_DETERMINISTIC_DOMAIN_AND_AGENTS.done`)
- 04 Editorial UI & Components — complete (`.phase_04_EDITORIAL_UI_AND_COMPONENTS.done`)
- 05 Tests & Adversarial QA — complete (`.phase_05_TESTS_AND_ADVERSARIAL_QA.done`)
- 06 Docker Deploy Video & Submission Pack — complete (`.phase_06_DOCKER_DEPLOY_VIDEO_AND_SUBMISSION_PACK.done`)

## Data
All fixture/scenario data is fictional. No secrets, screenshots, or account details are committed.
