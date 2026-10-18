/**
 * Relay — deterministic domain unit tests (no database).
 *
 * Verifies checkPlan / proposeRepairs / buildAnalysis / stableId against the
 * S1/S2/S3 fixtures (see .commander/context/02_WAVE_1_FLAGSHIPS.md) and
 * hand-built edge cases. All data is fictional.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkPlan, proposeRepairs, buildAnalysis, stableId } from '../src/lib/domain';
import { createFixture } from '../src/lib/business-setup';
import type { Workspace, WorkspaceEdit } from '../src/lib/types';

function allCoveredWorkspace(id = 'cov-01'): Workspace {
  return {
    id, revision: 1, scenario: 'S1', createdAt: '2026-10-18T08:00:00Z',
    hubs: [{ id: 'h1', name: 'Hub One', region: 'north', dockCapacity: 3 }],
    legs: [{
      id: 'leg-1', shipmentId: 'ship-1', originHubId: 'h1', destHubId: 'h1',
      trailerClassId: 'tc-dry', etaMinutes: 60, windowId: 'w1',
      assignedDriverId: 'drv-1', status: 'scheduled',
    }],
    drivers: [{
      id: 'drv-1', name: 'Driver One', homeHubId: 'h1',
      endorsements: [{ trailerClassId: 'tc-dry', validUntil: '2027-01-01T00:00:00Z' }],
      hosClock: { id: 'hos-1', driverId: 'drv-1', remainingMinutes: 480, onDutySince: '2026-10-19T08:00:00Z', restComplete: true },
    }],
    trailers: [{ id: 'tc-dry', name: 'Dry Van' }],
    windows: [{ id: 'w1', label: 'Window 1', start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' }],
    deadlines: [],
    unknowns: [],
  };
}

describe('Relay deterministic domain', () => {
  describe('checkPlan', () => {
    it('S1 hero: flags Okafor\'s insufficient HOS for leg-l31, ok=false', () => {
      const ws = createFixture('chk-s1', 'S1');
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      const hosFinding = result.findings.find((f) => f.code === 'hos_insufficient' && f.evidencePath.includes('leg-l31'));
      assert.ok(hosFinding, 'expected hos_insufficient for leg-l31');
      assert.deepEqual(hosFinding.evidencePath, ['Meridian Hub', 'leg-l31', 'tc-hazmat-3', 'drv-okafor']);
    });

    it('S1: reassigning leg-l31 to Salas clears the hos_insufficient finding', () => {
      const ws = createFixture('chk-s1b', 'S1');
      const changes: WorkspaceEdit[] = [{ kind: 'reassign-driver', legId: 'leg-l31', driverId: 'drv-salas' }];
      const result = checkPlan(ws, changes);
      const l31Hos = result.findings.filter((f) => f.code === 'hos_insufficient' && f.evidencePath.includes('leg-l31'));
      assert.equal(l31Hos.length, 0, 'Salas has 480 min HOS, enough for the 192 min route');
    });

    it('S2: three legs at hub-rural-a with dock capacity 2 triggers dock_capacity', () => {
      const ws = createFixture('chk-s2', 'S2');
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      const dockFinding = result.findings.find((f) => f.code === 'dock_capacity');
      assert.ok(dockFinding, 'expected dock_capacity for hub-rural-a');
      assert.equal(result.findings.filter((f) => f.severity === 'critical').length > 0, true);
    });

    it('S3: unknown trailer class on leg-301 surfaces as warning; unassigned driver is critical', () => {
      const ws = createFixture('chk-s3', 'S3');
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      assert.ok(result.findings.find((f) => f.code === 'unknown_trailer_class' && f.evidencePath.includes('leg-301')));
      assert.ok(result.findings.find((f) => f.code === 'unassigned' && f.evidencePath.includes('leg-301')));
      assert.equal(result.findings.filter((f) => f.code === 'hos_insufficient').length, 0);
      assert.equal(ws.unknowns.length, 1);
    });

    it('unassigned leg -> unassigned critical finding', () => {
      const ws: Workspace = {
        ...allCoveredWorkspace('unass'),
        legs: [{ id: 'leg-1', shipmentId: 'ship-1', originHubId: 'h1', destHubId: 'h1', trailerClassId: 'tc-dry', etaMinutes: 60, windowId: 'w1', assignedDriverId: null, status: 'pending' }],
      };
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      assert.ok(result.findings.find((f) => f.code === 'unassigned' && f.evidencePath.includes('leg-1')));
    });

    it('bound: more than MAX_LEGS -> too_many_legs, ok=false', () => {
      const ws = allCoveredWorkspace('bound');
      ws.legs = Array.from({ length: 51 }, (_, i) => ({
        id: `leg-bulk-${i}`, shipmentId: `ship-bulk-${i}`, originHubId: 'h1', destHubId: 'h1',
        trailerClassId: 'tc-dry', etaMinutes: 60, windowId: 'w1',
        assignedDriverId: null, status: 'pending',
      }));
      const result = checkPlan(ws);
      assert.equal(result.ok, false);
      assert.ok(result.findings.find((f) => f.code === 'too_many_legs'));
    });
  });

  describe('proposeRepairs', () => {
    it('S1: emits a valid split-leg proposal for leg-l31 at Ravensgate', () => {
      const ws = createFixture('pr-s1', 'S1');
      const proposals = proposeRepairs(ws);
      assert.ok(proposals.length > 0);
      const split = proposals.find((p) => p.valid && p.changes.some((c) => c.kind === 'split-leg' && c.legId === 'leg-l31'));
      assert.ok(split, 'expected a valid split-leg proposal for leg-l31');
    });

    it('rejected candidate: driver with insufficient HOS -> valid=false with evidence', () => {
      const ws: Workspace = {
        ...allCoveredWorkspace('rej'),
        drivers: [
          { id: 'drv-1', name: 'Driver One', homeHubId: 'h1', endorsements: [{ trailerClassId: 'tc-dry', validUntil: '2026-01-01T00:00:00Z' }], hosClock: { id: 'hos-1', driverId: 'drv-1', remainingMinutes: 10, onDutySince: '2026-10-19T08:00:00Z', restComplete: false } },
          { id: 'drv-2', name: 'Driver Two', homeHubId: 'h1', endorsements: [], hosClock: { id: 'hos-2', driverId: 'drv-2', remainingMinutes: 480, onDutySince: '2026-10-19T08:00:00Z', restComplete: true } },
        ],
      };
      const proposals = proposeRepairs(ws);
      const rejected = proposals.find((p) => !p.valid);
      assert.ok(rejected, 'expected a rejected-candidate proposal');
      assert.equal(rejected.valid, false);
      assert.ok(rejected.invalidReason, 'invalidReason should carry rejection evidence');
    });

    it('returns [] when the plan is already covered', () => {
      const ws = allCoveredWorkspace();
      assert.equal(proposeRepairs(ws).length, 0);
    });
  });

  describe('buildAnalysis', () => {
    it('assembles check + proposals deterministically', () => {
      const ws = createFixture('ba-s1', 'S1');
      const analysis = buildAnalysis(ws);
      assert.equal(analysis.workspaceRevision, ws.revision);
      assert.equal(analysis.check.ok, false);
      assert.ok(Array.isArray(analysis.proposals));
      assert.deepEqual(buildAnalysis(ws), analysis);
    });
  });

  describe('stableId', () => {
    it('is deterministic and input-sensitive', () => {
      assert.equal(stableId('clarify', 'leg-301'), stableId('clarify', 'leg-301'));
      assert.notEqual(stableId('clarify', 'leg-301'), stableId('clarify', 'leg-302'));
      assert.notEqual(stableId('split', 'leg-l31'), stableId('reject', 'leg-l31'));
    });
  });
});
