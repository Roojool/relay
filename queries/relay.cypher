// Relay — canonical Cypher pack (reference queries used by src/lib/graph.ts).
// Graph key per workspace: relay-ws-<opaque-server-id>

// ---------- Schema (created per workspace graph) ----------
// (w:Workspace {key, revision, createdAt, scenario})
// (w)-[:HAS_HUB]->(h:Hub {id, name, region, dockCapacity})
// (w)-[:HAS_TRAILER]->(tc:TrailerClass {id, name})
// (h)-[:DEPARTS]->(l:Leg {id, title, etaMinutes, windowId, status, assignedDriverId})
// (l)-[:ARRIVES_AT]->(h:Hub)
// (l)-[:REQUIRES]->(tc)
// (l)-[:IN_WINDOW]->(win:ShiftWindow {id, label, start, end})
// (w)-[:HAS_DRIVER]->(d:Driver {id, name, homeHubId})
// (d)-[:ENDORSED_FOR {validUntil}]->(tc)
// (d)-[:HOS_CLOCK]->(hw:DutyWindow {id, remainingMinutes, onDutySince, restComplete})
// (d)-[:DRIVEN_BY]->(l)
// (w)-[:HAS_UNKNOWN]->(u:Unknown {legId, note})
// (d:Decision {id, proposalId, idempotencyKey, approvedAt, revisionAfter, proposalJson})-[:DECIDED_ON]->(w)
// (w)-[:HAS_MEMORY]->(m:Memory {id, text, mode, at})

// ---------- Guarded mutation (optimistic concurrency; one atomic writer wins) ----------
// MATCH (w:Workspace {key:$wk})
// WHERE w.revision = $rev AND w.createdAt = $createdAt
// SET w.revision = w.revision + 1
// RETURN w.revision AS revision
// Empty result => HTTP 409 stale_revision

// ---------- Hero conflict (S1): HOS insufficient for Okafor on hazmat leg L-31 ----------
// Hub -> Leg -> requires TrailerClass -> Driver endorsement validity + HOS clock
MATCH (w:Workspace {key:$wk})
MATCH (w)-[:HAS_HUB]->(h:Hub)-[:DEPARTS]->(l:Leg)
MATCH (l)-[:REQUIRES]->(tc:TrailerClass)
MATCH (d:Driver)-[:DRIVEN_BY]->(l)
MATCH (d)-[e:ENDORSED_FOR]->(tc)
MATCH (d)-[:HOS_CLOCK]->(hw:DutyWindow)
WHERE e.validUntil < (SELECT start FROM ... ) OR hw.remainingMinutes < l.etaMinutes
RETURN h.name AS hub, l.id AS leg, l.etaMinutes AS etaMinutes, tc.name AS trailerClass,
       d.name AS driver, e.validUntil AS validUntil, hw.remainingMinutes AS remainingMinutes,
       [h.id, l.id, tc.id, d.id] AS evidencePath

// ---------- Alternate drivers who legally hold a valid endorsement and sufficient HOS ----------
MATCH (w:Workspace {key:$wk})
MATCH (l:Leg {id:$legId})-[:REQUIRES]->(tc:TrailerClass)<-[e:ENDORSED_FOR]-(d:Driver)
MATCH (d)-[:HOS_CLOCK]->(hw:DutyWindow)
MATCH (l)-[:IN_WINDOW]->(win:ShiftWindow)
WHERE e.validUntil >= win.start AND hw.remainingMinutes >= l.etaMinutes AND d.id <> $excludeDriverId
RETURN d.id, d.name, e.validUntil, hw.remainingMinutes

// ---------- Dock capacity conflicts (too many legs in overlapping windows at a hub) ----------
MATCH (w:Workspace {key:$wk})
MATCH (h:Hub)<-[:DEPARTS]-(l1:Leg)
MATCH (h)<-[:DEPARTS]-(l2:Leg)
WHERE id(l1) < id(l2)
MATCH (l1)-[:IN_WINDOW]->(win1:ShiftWindow)
MATCH (l2)-[:IN_WINDOW]->(win2:ShiftWindow)
WHERE win1.start < win2.end AND win2.start < win1.end
WITH h, count(DISTINCT l1) AS legCount
WHERE legCount > h.dockCapacity
RETURN h.id, h.name, h.dockCapacity, legCount

// ---------- Snapshot rebuild (graph-native; no denormalized foreign keys trusted) ----------
MATCH (w:Workspace {key:$wk}) RETURN w
MATCH (w:Workspace {key:$wk})-[:HAS_HUB]->(h) RETURN h ORDER BY h.id
MATCH (w:Workspace {key:$wk})-[:HAS_TRAILER]->(tc) RETURN tc ORDER BY tc.id
MATCH (w:Workspace {key:$wk})-[:HAS_HUB]->()-[:DEPARTS]->(l:Leg) RETURN l ORDER BY l.id
MATCH (w:Workspace {key:$wk})-[:HAS_SHIFT_WINDOW]->(win) RETURN DISTINCT win ORDER BY win.id
MATCH (w:Workspace {key:$wk})-[*1..3]->(d:Driver) RETURN DISTINCT d ORDER BY d.id
MATCH (w:Workspace {key:$wk})-[:HAS_UNKNOWN]->(u) RETURN u ORDER BY u.legId
MATCH (d:Driver)-[e:ENDORSED_FOR]->(tc:TrailerClass)
WHERE EXISTS { MATCH (w:Workspace {key:$wk})-[*1..3]->(d) }
RETURN d.id AS driverId, tc.id AS trailerClassId, e.validUntil AS validUntil

// ---------- Driver assignments (edge, not property, is the source of truth) ----------
MATCH (d:Driver)-[r:DRIVEN_BY]->(l:Leg)
WHERE EXISTS { MATCH (w:Workspace {key:$wk})-[*1..3]->(d) }
RETURN d.id AS driverId, l.id AS legId

// ---------- Idempotent decision receipt ----------
MATCH (d:Decision {idempotencyKey:$key})-[:DECIDED_ON]->(w:Workspace)
RETURN d.id, d.proposalId, d.approvedAt, d.revisionAfter, w.key

// ---------- Memory log (bounded recency) ----------
MATCH (w:Workspace {key:$wk})-[:HAS_MEMORY]->(m:Memory)
RETURN m.id, m.text, m.mode, m.at ORDER BY m.at DESC LIMIT $limit
