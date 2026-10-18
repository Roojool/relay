/**
 * Relay — FalkorDB integration tests (phase 05).
 *
 * Runs against the shared FalkorDB at redis://127.0.0.1:16380 (FALKORDB_URL
 * from .env.local). Every test uses a unique workspace id so tests never
 * collide; createWorkspace deletes its graph first, so re-runs are safe.
 *
 * Requires `npm run test:integration` (tsx --env-file-if-exists=.env.local).
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createWorkspace, readWorkspace, editWorkspace, approveProposal, analyzeWorkspace,
  recallMemory, graphHealth, closeGraphConnection, RelayError,
} from '../src/lib/graph';
import { createFixture } from '../src/lib/business-setup';
import type { Workspace } from '../src/lib/types';

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function freshS1(id: string): Workspace {
  return createFixture(id, 'S1');
}

describe('Relay FalkorDB integration', () => {
  describe('graphHealth', () => {
    it('reports the shared FalkorDB reachable', async () => {
      assert.equal(await graphHealth(), true);
    });
  });

  describe('createWorkspace / readWorkspace', () => {
    it('S1 snapshot rebuild matches the fixture through real traversals', async () => {
      const id = uniqueId('ws-s1');
      const ws = await createWorkspace(id, freshS1(id));
      assert.equal(ws.revision, 1);
      assert.equal(ws.hubs.length, 3);
      assert.equal(ws.trailers.length, 2);
      assert.equal(ws.windows.length, 3);
      assert.equal(ws.drivers.length, 3);
      assert.equal(ws.legs.length, 2);
      assert.equal(ws.unknowns.length, 0);

      const leg = ws.legs.find((l) => l.id === 'leg-l31');
      assert.ok(leg, 'leg-l31 present');
      assert.equal(leg.originHubId, 'hub-meridian');
      assert.equal(leg.destHubId, 'hub-terminal');
      assert.equal(leg.etaMinutes, 192);
      assert.equal(leg.trailerClassId, 'tc-hazmat-3');
      assert.equal(leg.assignedDriverId, 'drv-okafor');

      const okafor = ws.drivers.find((d) => d.id === 'drv-okafor');
      assert.ok(okafor);
      const holds = okafor.endorsements.find((e) => e.trailerClassId === 'tc-hazmat-3');
      assert.ok(holds);
      assert.equal(holds.validUntil, '2026-12-31T00:00:00Z');
      assert.equal(okafor.hosClock?.remainingMinutes, 47);

      const salas = ws.drivers.find((d) => d.id === 'drv-salas');
      assert.ok(salas);
      const salasEndorsements = salas.endorsements.map((e) => e.trailerClassId).sort();
      assert.deepEqual(salasEndorsements, ['tc-hazmat-3']);

      // readWorkspace re-reads through traversals and must agree.
      const again = await readWorkspace(id);
      assert.ok(again);
      assert.equal(again.legs.find((l) => l.id === 'leg-l31')?.assignedDriverId, 'drv-okafor');
    });

    it('readWorkspace returns null for an unknown workspace', async () => {
      const missing = await readWorkspace(uniqueId('nope'));
      assert.equal(missing, null);
    });
  });

  describe('editWorkspace (guarded mutations)', () => {
    it('reschedule bumps revision and moves the leg window', async () => {
      const id = uniqueId('ws-resched');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const updated = await editWorkspace(id, before.revision, {
        kind: 'reschedule', legId: 'leg-l31', windowId: 'win-d1pm',
      });
      assert.equal(updated.revision, before.revision + 1);
      assert.equal(updated.legs.find((l) => l.id === 'leg-l31')?.windowId, 'win-d1pm');
    });

    it('reassign-driver updates the driven-by edge', async () => {
      const id = uniqueId('ws-reassign');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const updated = await editWorkspace(id, before.revision, {
        kind: 'reassign-driver', legId: 'leg-l31', driverId: 'drv-salas',
      });
      assert.equal(updated.revision, before.revision + 1);
      assert.equal(updated.legs.find((l) => l.id === 'leg-l31')?.assignedDriverId, 'drv-salas');
    });

    it('split-leg records the split hub and bumps revision', async () => {
      const id = uniqueId('ws-split');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const updated = await editWorkspace(id, before.revision, {
        kind: 'split-leg', legId: 'leg-l31', hubId: 'hub-ravensgate', note: 'Pair split at Ravensgate',
      });
      assert.equal(updated.revision, before.revision + 1);
      const leg = updated.legs.find((l) => l.id === 'leg-l31');
      assert.ok(leg);
      assert.equal(leg.status, 'scheduled');
    });

    it('clarify-unknown removes the Unknown and records a trailer class (S3)', async () => {
      const id = uniqueId('ws-clarify');
      const ws = createFixture(id, 'S3');
      await createWorkspace(id, ws);
      const before = await readWorkspace(id);
      assert.ok(before);
      assert.ok(before.unknowns.find((u) => u.legId === 'leg-301'));
      const updated = await editWorkspace(id, before.revision, {
        kind: 'clarify-unknown', legId: 'leg-301', trailerClassId: 'tc-dry-van', note: 'Clarified per legacy manifest lookup.',
      });
      assert.equal(updated.revision, before.revision + 1);
      assert.equal(updated.unknowns.find((u) => u.legId === 'leg-301'), undefined);
      const leg = updated.legs.find((l) => l.id === 'leg-301');
      assert.ok(leg);
      assert.equal(leg.trailerClassId, 'tc-dry-van');
    });

    it('stale revision -> 409 stale_revision', async () => {
      const id = uniqueId('ws-stale');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      let threw = false;
      try {
        await editWorkspace(id, 9999, {
          kind: 'reschedule', legId: 'leg-l31', windowId: 'win-d1pm',
        });
      } catch (e) {
        threw = true;
        const err = e as RelayError;
        assert.equal(err.code, 'stale_revision');
        assert.equal(err.status, 409);
      }
      assert.equal(threw, true, 'expected a stale_revision error');
    });
  });

  describe('approveProposal (idempotent repair approval)', () => {
    it('replaying with the same idempotency key returns the same decision and bumps revision once', async () => {
      const id = uniqueId('ws-approve');
      await createWorkspace(id, freshS1(id));
      const { workspace: ws1, analysis } = await analyzeWorkspace(id, 1);
      const proposal = analysis.proposals.find((p) => p.valid);
      assert.ok(proposal, 'expected at least one valid proposal');

      const key = `idem-${uniqueId('key')}`;
      const proposalJson = JSON.stringify({ proposalId: proposal.id });
      const d1 = await approveProposal(id, ws1.revision, proposal.id, key, proposalJson);
      const d2 = await approveProposal(id, ws1.revision, proposal.id, key, proposalJson);

      assert.equal(d2.decision.id, d1.decision.id, 'idempotent replay returns same decision id');
      assert.equal(d2.decision.proposalId, proposal.id);
      assert.equal(d2.decision.workspaceRevisionAfter, d1.decision.workspaceRevisionAfter, 'revision bumped exactly once');
      assert.equal(d2.decision.idempotencyKey, key);
    });
  });

  describe('analyzeWorkspace', () => {
    it('bumps revision and returns check + proposals', async () => {
      const id = uniqueId('ws-analyze');
      await createWorkspace(id, freshS1(id));
      const before = await readWorkspace(id);
      assert.ok(before);
      const { workspace, analysis } = await analyzeWorkspace(id, before.revision);
      assert.equal(workspace.revision, before.revision + 1);
      assert.equal(analysis.check.ok, false);
      assert.ok(Array.isArray(analysis.proposals));
    });
  });

  describe('recallMemory', () => {
    it('returns a deterministic reply mentioning the referenced leg', async () => {
      const id = uniqueId('ws-memory');
      await createWorkspace(id, freshS1(id));
      const { reply } = await recallMemory(id, 'Tell me about leg-l31');
      assert.equal(reply.mode, 'deterministic');
      assert.ok(reply.text.includes('leg-l31'), 'reply should reference the leg');
      assert.ok(reply.text.includes('Okafor'), 'reply should reference the assigned driver');
    });
  });

  describe('503 graph_unavailable', () => {
    it('operations fail with graph_unavailable when FalkorDB is unreachable', async () => {
      const origUrl = process.env.FALKORDB_URL;
      await closeGraphConnection();
      process.env.FALKORDB_URL = 'redis://127.0.0.1:1'; // certainly dead port
      try {
        assert.equal(await graphHealth(), false);
        let threw = false;
        try {
          await createWorkspace(uniqueId('dead'), freshS1(uniqueId('dead')));
        } catch (e) {
          threw = true;
          const err = e as RelayError;
          assert.equal(err.code, 'graph_unavailable');
          assert.equal(err.status, 503);
        }
        assert.equal(threw, true, 'expected graph_unavailable on createWorkspace');
      } finally {
        process.env.FALKORDB_URL = origUrl;
        await closeGraphConnection();
      }
    });
  });
});
