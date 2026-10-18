// Dev utility: smoke-test the Relay graph layer against the configured FalkorDB.
// Usage: npx tsx scripts/smoke-graph.ts   (reads FALKORDB_URL from .env.local via --env-file)
import { createWorkspace, readWorkspace, graphHealth, closeGraphConnection } from '../src/lib/graph';
import type { Workspace } from '../src/lib/types';

function fixture(id: string): Workspace {
  return {
    id,
    revision: 1,
    scenario: 'S1',
    createdAt: new Date('2026-10-18T08:00:00Z').toISOString(),
    hubs: [{ id: 'hub-meridian', name: 'Meridian Hub', region: 'north', dockCapacity: 3 }],
    trailers: [{ id: 'tc-hazmat-3', name: 'Hazmat Class 3' }],
    windows: [
      { id: 'win-d1am', label: 'Day 1 AM', start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
      { id: 'win-d1pm', label: 'Day 1 PM', start: '2026-10-19T13:00:00Z', end: '2026-10-19T17:00:00Z' },
    ],
    drivers: [
      {
        id: 'drv-okafor',
        name: 'Okafor',
        homeHubId: 'hub-meridian',
        endorsements: [{ trailerClassId: 'tc-hazmat-3', validUntil: '2026-12-31T00:00:00Z' }],
        hosClock: { id: 'hos-okafor', driverId: 'drv-okafor', remainingMinutes: 47, onDutySince: '2026-10-19T04:30:00Z', restComplete: false },
      },
    ],
    legs: [
      {
        id: 'leg-l31',
        shipmentId: 'ship-9001',
        originHubId: 'hub-meridian',
        destHubId: 'hub-terminal',
        trailerClassId: 'tc-hazmat-3',
        etaMinutes: 192,
        windowId: 'win-d1am',
        assignedDriverId: 'drv-okafor',
        status: 'blocked',
      },
    ],
    deadlines: [],
    unknowns: [],
  };
}

async function main(): Promise<void> {
  const healthy = await graphHealth();
  if (!healthy) {
    console.error('SMOKE FAIL: graph health check returned false');
    process.exit(1);
  }
  console.log('health: OK');
  const ws = await createWorkspace('smoke01', fixture('smoke01'));
  console.log(`created: revision=${ws.revision} hubs=${ws.hubs.length} legs=${ws.legs.length} drivers=${ws.drivers.length}`);
  const back = await readWorkspace('smoke01');
  if (!back) {
    console.error('SMOKE FAIL: readWorkspace returned null');
    process.exit(1);
  }
  const leg = back.legs.find((l) => l.id === 'leg-l31');
  const okafor = back.drivers.find((d) => d.id === 'drv-okafor');
  const ok =
    back.hubs.length === 1 &&
    back.trailers.length === 1 &&
    back.windows.length === 2 &&
    back.drivers.length === 1 &&
    back.legs.length === 1 &&
    leg !== undefined &&
    leg.trailerClassId === 'tc-hazmat-3' &&
    leg.etaMinutes === 192 &&
    leg.assignedDriverId === 'drv-okafor' &&
    okafor !== undefined &&
    okafor.endorsements.length === 1 &&
    okafor.endorsements[0].validUntil === '2026-12-31T00:00:00Z' &&
    okafor.hosClock !== null &&
    okafor.hosClock.remainingMinutes === 47;
  console.log(ok ? 'SMOKE PASS: snapshot rebuild matches fixture through traversals' : 'SMOKE FAIL: snapshot mismatch');
  if (!ok) {
    console.log(JSON.stringify(back, null, 2));
  }
  await closeGraphConnection();
  process.exit(ok ? 0 : 1);
}

void main();
