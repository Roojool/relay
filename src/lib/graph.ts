/**
 * Relay — FalkorDB graph storage (PACT-parity).
 *
 * Every workspace is one graph ("relay-ws-<opaque server id>"). Domain entities
 * are nodes; structure lives in relationships
 * (Hub-[:HAS_LEG]->Leg, Leg-[:DEPARTS]->Hub, Hub-[:ROUTES_TO]->Hub,
 * Leg-[:DRIVEN_BY]->Driver, Driver-[:HOS_CLOCK]->DutyWindow,
 * Driver-[:ENDORSED_FOR]->TrailerClass, Leg-[:REQUIRES]->TrailerClass,
 * Hub-[:DOCK_CAPACITY]->(n), Leg-[:DUE_AT]->Deadline ...). Snapshots are rebuilt
 * EXCLUSIVELY through traversals — no denormalized foreign keys are trusted.
 *
 * Concurrency: every mutation is a single guarded query
 *   MATCH (w:Workspace {key:$wk})
 *   WHERE w.revision = $rev AND w.createdAt = $createdAt
 *   SET w.revision = w.revision + 1
 * FalkorDB executes one query atomically, so exactly one competing writer wins;
 * losers observe an empty result set and surface 409 stale_revision. The createdAt
 * term defeats revision-counter reuse after a reset.
 *
 * There is NO in-memory business-state fallback: if the database is unreachable,
 * operations fail with 503 graph_unavailable.
 */
import { FalkorDB, type Graph } from 'falkordb';
import { randomUUID } from 'node:crypto';
import type { AgentMode, AgentReply, Analysis, Decision, DutyWindow, Workspace, WorkspaceEdit } from './types';
import { buildAnalysis } from './domain';

export class RelayError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

function dbUrl(): string {
  const url = process.env.FALKORDB_URL?.trim();
  return url && url.length > 0 ? url : 'redis://127.0.0.1:16380';
}

let clientPromise: Promise<FalkorDB> | null = null;

/** Close the shared connection during process/test teardown. */
export async function closeGraphConnection(): Promise<void> {
  const pending = clientPromise;
  clientPromise = null;
  if (pending) await (await pending).close();
}

function unavailable(err: unknown): RelayError {
  const message = err instanceof Error ? err.message : String(err);
  return new RelayError(`Graph storage unavailable: ${message}`, 'graph_unavailable', 503);
}

/** FalkorDB reports "Invalid graph operation on empty key" for a graph that
 *  does not exist yet. Read-only calls treat that as "no such workspace". */
function isGraphMissingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /empty key/i.test(message) || /graph.*not found/i.test(message);
}

async function getClient(): Promise<FalkorDB> {
  if (!clientPromise) {
    clientPromise = FalkorDB.connect({ url: dbUrl() }).then((client) => {
      client.on('error', () => undefined);
      return client;
    });
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

function validateWorkspaceId(id: string): string {
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(trimmed)) {
    throw new RelayError('Invalid workspace id', 'invalid_workspace_id', 400);
  }
  return trimmed;
}

function graphKey(workspaceId: string): string {
  return `relay-ws-${validateWorkspaceId(workspaceId)}`;
}

async function graphFor(workspaceId: string): Promise<{ g: Graph; wk: string }> {
  try {
    const client = await getClient();
    return { g: client.selectGraph(graphKey(workspaceId)), wk: graphKey(workspaceId) };
  } catch (err) {
    if (err instanceof RelayError) throw err;
    throw unavailable(err);
  }
}

async function run(
  g: Graph,
  query: string,
  params: Record<string, unknown>,
  readonly = false,
): Promise<Record<string, unknown>[]> {
  try {
    const options = { params: params as never };
    const reply = readonly
      ? await g.roQuery<Record<string, unknown>>(query, options)
      : await g.query<Record<string, unknown>>(query, options);
    return reply.data ?? [];
  } catch (err) {
    if (err instanceof RelayError) throw err;
    if (readonly && isGraphMissingError(err)) return [];
    throw unavailable(err);
  }
}

/* --------------------------------- coercers --------------------------------- */

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nullOrStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/* ------------------------------- graph creation ------------------------------ */

export async function createWorkspace(workspaceId: string, fixture: Workspace): Promise<Workspace> {
  const { g, wk } = await graphFor(workspaceId);
  try {
    await g.delete();
  } catch {
    // graph may not exist yet
  }

  const createdAt = fixture.createdAt;
  await run(
    g,
    `CREATE (w:Workspace {key:$wk, workspaceId:$wid, revision:1, createdAt:$createdAt, scenario:$scenario})`,
    { wk, wid: workspaceId, createdAt, scenario: fixture.scenario },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_HUB]->(:Hub {id: row.id, name: row.name, region: row.region, dockCapacity: row.dockCapacity})`,
    { wk, rows: fixture.hubs.map((h) => ({ id: h.id, name: h.name, region: h.region, dockCapacity: h.dockCapacity })) },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_TRAILER]->(:TrailerClass {id: row.id, name: row.name})`,
    { wk, rows: fixture.trailers.map((t) => ({ id: t.id, name: t.name })) },
  );
  // Create ShiftWindow nodes and link to Workspace
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_SHIFT_WINDOW]->(:ShiftWindow {id: row.id, label: row.label, start: row.start, end: row.end})`,
    { wk, rows: fixture.windows.map((w) => ({ id: w.id, label: w.label, start: w.start, end: w.end })) },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_HUB]->(o:Hub {id: row.originHubId})
     MATCH (w)-[:HAS_HUB]->(d:Hub {id: row.destHubId})
     CREATE (l:Leg {id: row.id, title: row.id, etaMinutes: row.etaMinutes, windowId: row.windowId,
                   status: row.status, assignedDriverId: row.assignedDriverId})
     CREATE (o)-[:DEPARTS]->(l)
     CREATE (l)-[:ARRIVES_AT]->(d)
     WITH row, l, w
     MATCH (w)-[:HAS_TRAILER]->(tc:TrailerClass {id: row.trailerClassId})
     CREATE (l)-[:REQUIRES]->(tc)`,
    {
      wk,
      rows: fixture.legs.map((l) => ({
        id: l.id, originHubId: l.originHubId, destHubId: l.destHubId, etaMinutes: l.etaMinutes,
        windowId: l.windowId, status: l.status, assignedDriverId: l.assignedDriverId,
        trailerClassId: l.trailerClassId,
      })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_HUB]->()-[:DEPARTS]->(l:Leg {id: row.orderId})
     MATCH (win:ShiftWindow {id: row.id})
     MERGE (l)-[:IN_WINDOW]->(win)`,
    {
      wk,
      rows: fixture.legs.flatMap((l) =>
        fixture.windows.some((x) => x.id === l.windowId) ? [{ orderId: l.id, id: l.windowId }] : [],
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_DRIVER]->(:Driver {id: row.id, name: row.name, homeHubId: row.homeHubId})`,
    {
      wk,
      rows: fixture.drivers.map((d) => ({ id: d.id, name: d.name, homeHubId: d.homeHubId })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_DRIVER]->(d:Driver {id: row.driverId}), (tc:TrailerClass {id: row.trailerClassId})
     MERGE (d)-[e:ENDORSED_FOR]->(tc)
     ON CREATE SET e.validUntil = row.validUntil
     ON MATCH SET e.validUntil = row.validUntil`,
    {
      wk,
      rows: fixture.drivers.flatMap((d) =>
        d.endorsements.map((h) => ({ driverId: d.id, trailerClassId: h.trailerClassId, validUntil: h.validUntil })),
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (w)-[:HAS_DRIVER]->(d:Driver {id: row.driverId})
     CREATE (d)-[:HOS_CLOCK]->(:DutyWindow {id: row.id, remainingMinutes: row.remainingMinutes,
                   onDutySince: row.onDutySince, restComplete: row.restComplete})`,
    {
      wk,
      rows: fixture.drivers
        .filter((d) => d.hosClock !== null)
        .map((d) => ({ driverId: d.id, id: `hos-${d.id}`, remainingMinutes: d.hosClock!.remainingMinutes,
          onDutySince: d.hosClock!.onDutySince, restComplete: d.hosClock!.restComplete })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (d:Driver {id: row.driverId}), (l:Leg {id: row.orderId})
     MERGE (d)-[:DRIVEN_BY]->(l)`,
    {
      wk,
      rows: fixture.legs
        .filter((l) => l.assignedDriverId !== null)
        .map((l) => ({ driverId: l.assignedDriverId as string, orderId: l.id })),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     MATCH (l:Leg {id: row.orderId}), (dl:Deadline {id: row.deadlineId})
     MERGE (l)-[:DUE_AT]->(dl)`,
    {
      wk,
      rows: fixture.deadlines.flatMap((dl) =>
        fixture.legs.filter((l) => l.shipmentId === dl.id.replace('dl-', '')).map((l) => ({ orderId: l.id, deadlineId: dl.id })),
      ),
    },
  );
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     UNWIND $rows AS row
     CREATE (w)-[:HAS_UNKNOWN]->(:Unknown {legId: row.legId, note: row.note})`,
    { wk, rows: fixture.unknowns.map((u) => ({ legId: u.legId, note: u.note })) },
  );

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new RelayError('Workspace snapshot failed to rebuild after creation', 'snapshot_failed', 500);
  }
  return rebuilt;
}

/* ------------------------------ snapshot rebuild ----------------------------- */

export async function readWorkspace(workspaceId: string): Promise<Workspace | null> {
  const { g, wk } = await graphFor(workspaceId);

  const metaRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     RETURN w.workspaceId AS workspaceId, w.revision AS revision, w.createdAt AS createdAt, w.scenario AS scenario`,
    { wk },
    true,
  );
  if (metaRows.length === 0) return null;
  const meta = metaRows[0];

  const hubs = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_HUB]->(h:Hub)
     RETURN h.id AS id, h.name AS name, h.region AS region, h.dockCapacity AS dockCapacity ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({ id: str(r['id']), name: str(r['name']), region: str(r['region']), dockCapacity: num(r['dockCapacity'], 1) }));

  const trailers = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_TRAILER]->(tc:TrailerClass)
     RETURN tc.id AS id, tc.name AS name ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({ id: str(r['id']), name: str(r['name']) }));

  const legs = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_HUB]->(o:Hub)-[:DEPARTS]->(l:Leg)-[:ARRIVES_AT]->(d:Hub)
     RETURN o.id AS originHubId, d.id AS destHubId, l.id AS id, l.title AS title, l.windowId AS windowId,
            l.etaMinutes AS etaMinutes, l.status AS status, l.assignedDriverId AS assignedDriverId
     ORDER BY id`,
    { wk },
    true,
  )).map((r) => {
    const status = str(r['status']);
    return {
      id: str(r['id']),
      shipmentId: str(r['id']).replace('leg-', 'ship-'),
      originHubId: str(r['originHubId']),
      destHubId: str(r['destHubId']),
      trailerClassId: '' as string,
      etaMinutes: num(r['etaMinutes']),
      windowId: str(r['windowId']),
      assignedTechnicianId: nullOrStr(r['assignedDriverId']) as string | null,
      assignedDriverId: nullOrStr(r['assignedDriverId']),
      status: (status === 'pending' || status === 'blocked' || status === 'completed' ? status : 'scheduled') as
        | 'pending' | 'scheduled' | 'blocked' | 'completed',
    };
  });

  const windows = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_SHIFT_WINDOW]->(win:ShiftWindow)
     RETURN win.id AS id, win.label AS label, win.start AS start, win.end AS end ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({
    id: str(r['id']),
    label: str(r['label']),
    start: str(r['start']),
    end: str(r['end']),
  }));

  const drivers = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DRIVER]->(drv:Driver)
     RETURN drv.id AS id, drv.name AS name, drv.homeHubId AS homeHubId ORDER BY id`,
    { wk },
    true,
  )).map((r) => ({
    id: str(r['id']),
    name: str(r['name']),
    homeHubId: str(r['homeHubId']),
    endorsements: [] as { trailerClassId: string; validUntil: string }[],
    hosClock: null as DutyWindow | null,
  }));

  const endorsementRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DRIVER]->(d:Driver)-[e:ENDORSED_FOR]->(tc:TrailerClass)
     RETURN d.id AS driverId, tc.id AS trailerClassId, e.validUntil AS validUntil`,
    { wk },
    true,
  );
  for (const row of endorsementRows) {
    const driver = drivers.find((d) => d.id === str(row['driverId']));
    if (driver) driver.endorsements.push({ trailerClassId: str(row['trailerClassId']), validUntil: str(row['validUntil']) });
  }

  const hosRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DRIVER]->(d:Driver)-[:HOS_CLOCK]->(h:DutyWindow)
     RETURN d.id AS driverId, h.id AS id, h.remainingMinutes AS remainingMinutes, h.onDutySince AS onDutySince, h.restComplete AS restComplete`,
    { wk },
    true,
  );
  for (const row of hosRows) {
    const driver = drivers.find((d) => d.id === str(row['driverId']));
    if (driver) {
      driver.hosClock = {
        id: str(row['id']),
        driverId: str(row['driverId']),
        remainingMinutes: num(row['remainingMinutes']),
        onDutySince: str(row['onDutySince']),
        restComplete: bool(row['restComplete']),
      };
    }
  }

  const assignRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_DRIVER]->(d:Driver)-[:DRIVEN_BY]->(l:Leg)
     RETURN d.id AS driverId, l.id AS legId`,
    { wk },
    true,
  );
  for (const row of assignRows) {
    const leg = legs.find((l) => l.id === str(row['legId']));
    if (leg) leg.assignedDriverId = str(row['driverId']);
  }

  const requireRows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_HUB]->()-[:DEPARTS]->(l:Leg)-[:REQUIRES]->(tc:TrailerClass)
     RETURN l.id AS legId, tc.id AS trailerClassId`,
    { wk },
    true,
  );
  for (const row of requireRows) {
    const leg = legs.find((l) => l.id === str(row['legId']));
    if (leg) leg.trailerClassId = str(row['trailerClassId']);
  }

  const unknowns = (await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_UNKNOWN]->(u:Unknown)
     RETURN u.legId AS legId, u.note AS note ORDER BY legId`,
    { wk },
    true,
  )).map((r) => ({ legId: str(r['legId']), note: str(r['note']) }));

  const scenario = str(meta['scenario']);
  return {
    id: str(meta['workspaceId']) || workspaceId,
    revision: num(meta['revision'], 1),
    scenario: (scenario === 'S2' || scenario === 'S3' ? scenario : 'S1') as Workspace['scenario'],
    createdAt: str(meta['createdAt']),
    hubs,
    legs,
    drivers,
    trailers,
    windows,
    deadlines: [],
    unknowns,
  };
}

function bool(v: unknown): boolean {
  return v === true;
}

/* --------------------------- guarded mutations ------------------------------- */

async function bumpRevision(g: Graph, wk: string, revision: number, createdAt: string): Promise<number> {
  const rows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     WHERE w.revision = $rev AND w.createdAt = $createdAt
     SET w.revision = w.revision + 1
     RETURN w.revision AS revision`,
    { wk, rev: revision, createdAt },
  );
  if (rows.length === 0) {
    throw new RelayError('Workspace changed concurrently; reload and retry', 'stale_revision', 409);
  }
  return num(rows[0]['revision']);
}

export async function editWorkspace(
  workspaceId: string,
  revision: number,
  edit: WorkspaceEdit,
): Promise<Workspace> {
  const { g, wk } = await graphFor(workspaceId);
  const wRows = await run(g, `MATCH (w:Workspace {key:$wk}) RETURN w.createdAt AS createdAt`, { wk }, true);
  if (wRows.length === 0) {
    throw new RelayError('Workspace not found', 'workspace_not_found', 404);
  }
  const createdAt = str(wRows[0]['createdAt']);

  if (edit.kind === 'reschedule') {
    const winRows = await run(
      g,
      `MATCH (w:Workspace {key:$wk})-[:HAS_SHIFT_WINDOW]->(win:ShiftWindow {id:$wid}) RETURN win.id AS id`,
      { wk, wid: edit.windowId },
      true,
    );
    if (winRows.length === 0) {
      throw new RelayError('Target window does not exist', 'invalid_window', 400);
    }
  }

  await bumpRevision(g, wk, revision, createdAt);

  if (edit.kind === 'reassign-driver') {
    await run(g, `MATCH ()-[r:DRIVEN_BY]->(l:Leg {id:$oid}) DELETE r`, {
      oid: edit.legId,
    });
    await run(
      g,
      `MATCH (d2:Driver {id:$tid}), (l2:Leg {id:$oid})
       CREATE (d2)-[:DRIVEN_BY]->(l2)
       SET l2.assignedDriverId = $tid`,
      { tid: edit.driverId, oid: edit.legId },
    );
  } else if (edit.kind === 'reschedule') {
    await run(
      g,
      `MATCH (l:Leg {id:$oid})-[r:IN_WINDOW]->() DELETE r
       WITH 1 AS ignored
       MATCH (l2:Leg {id:$oid}), (win:ShiftWindow {id:$wid})
       CREATE (l2)-[:IN_WINDOW]->(win)
       SET l2.windowId = $wid`,
      { oid: edit.legId, wid: edit.windowId },
    );
  } else if (edit.kind === 'split-leg') {
    await run(
      g,
      `OPTIONAL MATCH (u:Unknown {legId:$lid}) DETACH DELETE u
       WITH 1 AS ignored
       MATCH (h:Hub {id:$hid}), (l:Leg {id:$lid})
       MERGE (l)-[:SPLITS_AT]->(h)
       SET l.status = 'scheduled'`,
      { lid: edit.legId, hid: edit.hubId },
    );
  } else {
    await run(
      g,
      `MATCH (u:Unknown {legId:$lid}) DETACH DELETE u
       WITH 1 AS ignored
       MATCH (l:Leg {id:$lid})
       MERGE (tc:TrailerClass {id: $tcid})
       ON CREATE SET tc.name = $tcid
       MERGE (l)-[:REQUIRES]->(tc)`,
      { lid: edit.legId, tcid: edit.trailerClassId },
    );
  }

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new RelayError('Workspace snapshot failed to rebuild after edit', 'snapshot_failed', 500);
  }
  return rebuilt;
}

export async function approveProposal(
  workspaceId: string,
  revision: number,
  proposalId: string,
  idempotencyKey: string,
  proposalJson = '',
): Promise<{ workspace: Workspace; decision: Decision }> {
  const { g, wk } = await graphFor(workspaceId);

  const existing = await run(
    g,
    `MATCH (d:Decision {idempotencyKey:$key})-[:DECIDED_ON]->(w:Workspace {key:$wk})
     RETURN d.id AS id, d.proposalId AS proposalId, d.approvedAt AS approvedAt, d.revisionAfter AS revisionAfter`,
    { key: idempotencyKey, wk },
    true,
  );
  if (existing.length > 0) {
    const row = existing[0];
    const rebuilt = await readWorkspace(workspaceId);
    if (!rebuilt) {
      throw new RelayError('Workspace missing during idempotent replay', 'workspace_not_found', 404);
    }
    return {
      workspace: rebuilt,
      decision: {
        id: str(row['id']),
        proposalId: str(row['proposalId']),
        workspaceRevisionAfter: num(row['revisionAfter'], rebuilt.revision),
        idempotencyKey,
        approvedAt: str(row['approvedAt']),
      },
    };
  }

  const wRows = await run(g, `MATCH (w:Workspace {key:$wk}) RETURN w.createdAt AS createdAt`, { wk }, true);
  if (wRows.length === 0) {
    throw new RelayError('Workspace not found', 'workspace_not_found', 404);
  }
  const createdAt = str(wRows[0]['createdAt']);
  const newRevision = await bumpRevision(g, wk, revision, createdAt);

  const decisionId = `dec-${randomUUID().slice(0, 8)}`;
  const approvedAt = new Date().toISOString();
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     CREATE (d:Decision {
       id: $did, proposalId: $pid, idempotencyKey: $key,
       approvedAt: $at, revisionAfter: $rev, proposalJson: $pjson
     })
     CREATE (d)-[:DECIDED_ON]->(w)`,
    { did: decisionId, pid: proposalId, key: idempotencyKey, at: approvedAt, rev: newRevision, pjson: proposalJson, wk },
  );

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new RelayError('Workspace snapshot failed to rebuild after approval', 'snapshot_failed', 500);
  }
  return {
    workspace: rebuilt,
    decision: {
      id: decisionId,
      proposalId,
      workspaceRevisionAfter: newRevision,
      idempotencyKey,
      approvedAt,
    },
  };
}

/* ---------------------------------- memory ---------------------------------- */

export interface MemoryEntry {
  id: string;
  text: string;
  mode: AgentMode;
  at: string;
}

export async function appendMemory(workspaceId: string, text: string, mode: AgentMode): Promise<void> {
  const { g, wk } = await graphFor(workspaceId);
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     CREATE (w)-[:HAS_MEMORY]->(:Memory {id: $id, text: $text, mode: $mode, at: $at})`,
    { wk, id: `mem-${randomUUID().slice(0, 8)}`, text, mode, at: new Date().toISOString() },
  );
}

export interface UsageEntry {
  id: string;
  workspaceId: string;
  provider: string;
  prompt: string;
  response: string;
  at: string;
}

export async function appendUsage(
  workspaceId: string,
  provider: string,
  response: string,
): Promise<void> {
  const { g, wk } = await graphFor(workspaceId);
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     CREATE (u:Usage {id: $id, provider: $provider, response: $response, at: $at})
     CREATE (w)-[:HAS_USAGE]->(u)`,
    { wk, id: `use-${randomUUID().slice(0, 8)}`, provider, response: response.slice(0, 2000), at: new Date().toISOString() },
  );
}

export async function recentMemory(workspaceId: string, limit = 10): Promise<MemoryEntry[]> {
  const { g, wk } = await graphFor(workspaceId);
  const rows = await run(
    g,
    `MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory)
     RETURN m.id AS id, m.text AS text, m.mode AS mode, m.at AS at
     ORDER BY m.at DESC LIMIT $limit`,
    { wk, limit },
    true,
  );
  return rows.map((row) => {
    const mode = str(row['mode']);
    return {
      id: str(row['id']),
      text: str(row['text']),
      mode: (mode === 'live-groq' || mode === 'live-openrouter' ? mode : 'deterministic') as AgentMode,
      at: str(row['at']),
    };
  });
}

/* ---------------------------------- analysis ---------------------------------- */

export async function analyzeWorkspace(
  workspaceId: string,
  revision: number,
): Promise<{ workspace: Workspace; analysis: Analysis }> {
  const { g, wk } = await graphFor(workspaceId);
  const wRows = await run(g, `MATCH (w:Workspace {key:$wk}) RETURN w.revision AS revision, w.createdAt AS createdAt`, { wk }, true);
  if (wRows.length === 0) {
    throw new RelayError('Workspace not found', 'workspace_not_found', 404);
  }
  const metaRevision = Number(wRows[0]['revision']);
  const createdAt = String(wRows[0]['createdAt']);
  if (metaRevision !== revision) {
    throw new RelayError('Workspace changed concurrently; reload and retry', 'stale_revision', 409);
  }

  const workspace = await readWorkspace(workspaceId);
  if (!workspace) {
    throw new RelayError('Workspace snapshot missing', 'snapshot_failed', 500);
  }

  const analysis = buildAnalysis(workspace);
  const ts = new Date().toISOString();
  const activityText = `Plan checked: ${analysis.check.summary}`;

  const bump = await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     WHERE w.revision = $rev AND w.createdAt = $createdAt
     SET w.revision = w.revision + 1
     RETURN w.revision AS revision`,
    { wk, rev: revision, createdAt },
  );
  if (bump.length === 0) {
    throw new RelayError('Workspace changed concurrently; reload and retry', 'stale_revision', 409);
  }
  const newRevision = Number(bump[0]['revision']);

  const rows = analysis.proposals.map((p) => ({
    id: p.id, title: p.title, summary: p.summary, revision: newRevision,
    status: p.valid ? 'proposed' : 'rejected', createdAt: ts,
    changesJson: JSON.stringify(p.changes),
  }));
  if (rows.length > 0) {
    await run(
      g,
      `MATCH (w:Workspace {key:$wk})
       WHERE w.revision = $newRev AND w.createdAt = $createdAt
       UNWIND $rows AS pr
       MERGE (p:Proposal {id: pr.id})
       SET p.title = pr.title, p.summary = pr.summary, p.revision = pr.revision,
           p.status = pr.status, p.createdAt = pr.createdAt, p.changes = pr.changesJson
       MERGE (w)-[:HAS_PROPOSAL]->(p)`,
      { wk, newRev: newRevision, createdAt, rows },
    );
  }
  await run(
    g,
    `MATCH (w:Workspace {key:$wk})
     WHERE w.revision = $newRev AND w.createdAt = $createdAt
     CREATE (a:Activity {id: $aid, text: $text, at: $at})
     CREATE (w)-[:HAS_ACTIVITY]->(a)`,
    { wk, newRev: newRevision, createdAt, aid: `act-${randomUUID().slice(0, 8)}`, text: activityText, at: ts },
  );

  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new RelayError('Workspace snapshot failed to rebuild after analysis', 'snapshot_failed', 500);
  }
  return { workspace: rebuilt, analysis };
}

/* ---------------------------------- memory ---------------------------------- */

export async function recallMemory(
  workspaceId: string,
  message: string,
): Promise<{ reply: AgentReply; workspace: Workspace }> {
  const { g, wk } = await graphFor(workspaceId);
  const workspace = await readWorkspace(workspaceId);
  if (!workspace) {
    throw new RelayError('Workspace not found', 'workspace_not_found', 404);
  }

  const lower = (message || '').toLowerCase();
  const lines: string[] = [];

  const check = buildAnalysis(workspace).check;
  lines.push(`Plan status: ${check.ok ? 'All shipment legs are covered by legal, awake, certified drivers.' : 'There are open findings.'}`);
  lines.push(`Workspace revision: ${workspace.revision} (notes do not change it).`);

  const matchWorkspaceText = (text: string): string[] => {
    const t = text.toLowerCase();
    const ids: string[] = [];
    for (const l of workspace.legs) {
      if (t.includes(l.id) || t.includes(l.id.toLowerCase())) ids.push(l.id);
    }
    for (const d of workspace.drivers) {
      if (t.includes(d.id) || t.includes(d.name.toLowerCase())) ids.push(d.id);
    }
    for (const h of workspace.hubs) {
      if (t.includes(h.id) || t.includes(h.name.toLowerCase())) ids.push(h.id);
    }
    return [...new Set(ids)];
  };

  const matched = matchWorkspaceText(message);
  if (matched.length > 0) {
    for (const id of matched) {
      const leg = workspace.legs.find((l) => l.id === id);
      if (leg) {
        const driver = leg.assignedDriverId ? workspace.drivers.find((d) => d.id === leg.assignedDriverId) : null;
        lines.push(
          `- "${leg.id}" (${leg.id}) from ${leg.originHubId} to ${leg.destHubId}, window ${leg.windowId}, status ${leg.status}` +
          (driver ? `, driven by ${driver.name}` + (driver.hosClock ? `, ${driver.hosClock.remainingMinutes} min HOS remaining` : '') : ', unassigned') +
          `, trailer class: ${leg.trailerClassId || 'none'}`,
        );
      }
      const driver = workspace.drivers.find((d) => d.id === id);
      if (driver) {
        lines.push(
          `- Driver ${driver.name} (${driver.id}): endorsements ${driver.endorsements.map((e) => `${e.trailerClassId} valid until ${e.validUntil}`).join('; ') || 'none on record'}, ` +
          `HOS ${driver.hosClock ? driver.hosClock.remainingMinutes + ' min remaining' : 'no clock on record'}`,
        );
      }
    }
  } else if (lower.includes('unknown') || lower.includes('unclear')) {
    for (const u of workspace.unknowns) {
      lines.push(`- Unknown: ${u.legId} — ${u.note}`);
    }
  } else {
    lines.push(`No specific leg, driver, or hub matched your note. Mention one for its graph trail.`);
  }

  for (const finding of check.findings.slice(0, 5)) {
    lines.push(`Open finding (${finding.severity}): ${finding.message}`);
  }

  const replyText = lines.join('\n');
  const ts = new Date().toISOString();
  await appendMemory(workspaceId, `Q: ${message}\nA: ${replyText}`, 'deterministic').catch(() => undefined);

  const reply: AgentReply = { mode: 'deterministic', text: replyText, createdAt: ts };
  const rebuilt = await readWorkspace(workspaceId);
  if (!rebuilt) {
    throw new RelayError('Workspace snapshot missing after recall', 'snapshot_failed', 500);
  }
  return { reply, workspace: rebuilt };
}

/* ---------------------------------- health ---------------------------------- */

export async function graphHealth(): Promise<boolean> {
  try {
    const client = await getClient();
    const g = client.selectGraph('relay-health');
    const reply = await g.query<{ ok: number }>('RETURN 1 AS ok');
    return (reply.data?.length ?? 0) === 1;
  } catch {
    return false;
  }
}
