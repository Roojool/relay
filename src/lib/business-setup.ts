/**
 * Relay — synthetic fixtures for the three scenarios described in
 * .commander/context/02_WAVE_1_FLAGSHIPS.md (relay flagship).
 *
 * All data is fictional. Each scenario isolates one hero conflict:
 *  - S1: hero pair-split — L-31 hazmat, Okafor HOS short, Salas alternates
 *    at Ravensgate; Petrov rejected; HOS exemption approval fact unlocks D1.
 *  - S2: dock capacity 2 vs 3 inbound relay legs — capacity conflict,
 *    repair = stagger 45 min.
 *  - S3: unknown trailer class on legacy manifest — truthful "unknown"
 *    surface, block until clarified (never guessed).
 */
import type { ScenarioId, Workspace } from './types';

const now = () => new Date('2026-10-18T08:00:00Z').toISOString();

function baseWorkspace(id: string, scenario: ScenarioId): Workspace {
  return {
    id,
    revision: 1,
    scenario,
    createdAt: now(),
    hubs: [],
    legs: [],
    drivers: [],
    trailers: [],
    windows: [],
    deadlines: [],
    unknowns: [],
  };
}

/** S1 — hero: L-31 hazmat class 3, Okafor HOS 47 min vs 3h12m route. */
export function scenarioS1(id: string): Workspace {
  const ws = baseWorkspace(id, 'S1');
  ws.hubs = [
    { id: 'hub-meridian', name: 'Meridian Hub', region: 'north', dockCapacity: 3 },
    { id: 'hub-ravensgate', name: 'Ravensgate Hub', region: 'rural', dockCapacity: 2 },
    { id: 'hub-terminal', name: 'Terminal Hub', region: 'south', dockCapacity: 3 },
  ];
  ws.trailers = [
    { id: 'tc-hazmat-3', name: 'Hazmat Class 3' },
    { id: 'tc-dry-van', name: 'Dry Van' },
  ];
  // D1-AM, D1-PM, D2-AM shift windows
  ws.windows = [
    { id: 'win-d1am', label: 'Day 1 AM', start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
    { id: 'win-d1pm', label: 'Day 1 PM', start: '2026-10-19T13:00:00Z', end: '2026-10-19T17:00:00Z' },
    { id: 'win-d2am', label: 'Day 2 AM', start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' },
  ];
  ws.deadlines = [
    { id: 'dl-l31', dueAt: '2026-10-20T06:00:00Z', label: 'L-31 due 06:00' },
  ];
  ws.drivers = [
    {
      id: 'drv-okafor',
      name: 'Okafor',
      homeHubId: 'hub-meridian',
      endorsements: [{ trailerClassId: 'tc-hazmat-3', validUntil: '2026-12-31T00:00:00Z' }],
      hosClock: { id: 'hos-okafor', driverId: 'drv-okafor', remainingMinutes: 47, onDutySince: '2026-10-19T04:30:00Z', restComplete: false },
    },
    {
      id: 'drv-salas',
      name: 'Salas',
      homeHubId: 'hub-ravensgate',
      endorsements: [{ trailerClassId: 'tc-hazmat-3', validUntil: '2026-12-31T00:00:00Z' }],
      hosClock: { id: 'hos-salas', driverId: 'drv-salas', remainingMinutes: 480, onDutySince: '2026-10-19T08:00:00Z', restComplete: true },
    },
    {
      id: 'drv-petrov',
      name: 'Petrov',
      homeHubId: 'hub-meridian',
      endorsements: [{ trailerClassId: 'tc-hazmat-3', validUntil: '2026-12-31T00:00:00Z' }],
      hosClock: { id: 'hos-petrov', driverId: 'drv-petrov', remainingMinutes: 178, onDutySince: '2026-10-19T06:00:00Z', restComplete: false },
    },
  ];
  // L-31: hazmat class 3, due 06:00, eta 192 min (3h12m), assigned to Okafor, window D1-AM.
  // Okafor has 47 min HOS remaining — route needs 192 min. HOS insufficient.
  ws.legs = [
    {
      id: 'leg-l31', shipmentId: 'ship-9001', originHubId: 'hub-meridian', destHubId: 'hub-terminal',
      trailerClassId: 'tc-hazmat-3', etaMinutes: 192, windowId: 'win-d1am',
      assignedDriverId: 'drv-okafor', status: 'blocked',
    },
    {
      id: 'leg-l32', shipmentId: 'ship-9002', originHubId: 'hub-meridian', destHubId: 'hub-ravensgate',
      trailerClassId: 'tc-dry-van', etaMinutes: 60, windowId: 'win-d1am',
      assignedDriverId: null, status: 'pending',
    },
  ];
  ws.unknowns = [];
  return ws;
}

/** S2 — dock capacity 2 vs 3 inbound relay legs same window. */
export function scenarioS2(id: string): Workspace {
  const ws = baseWorkspace(id, 'S2');
  ws.hubs = [
    { id: 'hub-rural-a', name: 'Riverside Rural Hub', region: 'rural', dockCapacity: 2 },
    { id: 'hub-rural-b', name: 'Hollow Creek Rural Hub', region: 'rural', dockCapacity: 2 },
  ];
  ws.trailers = [
    { id: 'tc-dry-van', name: 'Dry Van' },
  ];
  ws.windows = [
    { id: 'win-d1am', label: 'Day 1 AM', start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
    { id: 'win-d2am', label: 'Day 2 AM', start: '2026-10-20T08:00:00Z', end: '2026-10-20T12:00:00Z' },
  ];
  ws.drivers = [
    {
      id: 'drv-marina',
      name: 'Marina',
      homeHubId: 'hub-rural-a',
      endorsements: [{ trailerClassId: 'tc-dry-van', validUntil: '2027-01-01T00:00:00Z' }],
      hosClock: { id: 'hos-marina', driverId: 'drv-marina', remainingMinutes: 480, onDutySince: '2026-10-19T08:00:00Z', restComplete: true },
    },
  ];
  // Three legs at hub-rural-a in D1-AM, but dock capacity is only 2.
  ws.legs = [
    {
      id: 'leg-201', shipmentId: 'ship-2001', originHubId: 'hub-rural-a', destHubId: 'hub-rural-b',
      trailerClassId: 'tc-dry-van', etaMinutes: 90, windowId: 'win-d1am',
      assignedDriverId: 'drv-marina', status: 'scheduled',
    },
    {
      id: 'leg-202', shipmentId: 'ship-2002', originHubId: 'hub-rural-a', destHubId: 'hub-rural-b',
      trailerClassId: 'tc-dry-van', etaMinutes: 90, windowId: 'win-d1am',
      assignedDriverId: null, status: 'pending',
    },
    {
      id: 'leg-203', shipmentId: 'ship-2003', originHubId: 'hub-rural-a', destHubId: 'hub-rural-b',
      trailerClassId: 'tc-dry-van', etaMinutes: 90, windowId: 'win-d1am',
      assignedDriverId: null, status: 'pending',
    },
  ];
  ws.unknowns = [];
  return ws;
}

/** S3 — unknown trailer class on legacy manifest. */
export function scenarioS3(id: string): Workspace {
  const ws = baseWorkspace(id, 'S3');
  ws.hubs = [
    { id: 'hub-legacy', name: 'Legacy Depot', region: 'north', dockCapacity: 2 },
  ];
  ws.trailers = [];
  ws.windows = [
    { id: 'win-d1am', label: 'Day 1 AM', start: '2026-10-19T08:00:00Z', end: '2026-10-19T12:00:00Z' },
  ];
  ws.drivers = [
    {
      id: 'drv-jorge',
      name: 'Jorge',
      homeHubId: 'hub-legacy',
      endorsements: [],
      hosClock: { id: 'hos-jorge', driverId: 'drv-jorge', remainingMinutes: 480, onDutySince: '2026-10-19T08:00:00Z', restComplete: true },
    },
  ];
  ws.legs = [
    {
      id: 'leg-301', shipmentId: 'ship-3001', originHubId: 'hub-legacy', destHubId: 'hub-legacy',
      trailerClassId: 'tc-unknown-legacy', etaMinutes: 120, windowId: 'win-d1am',
      assignedDriverId: null, status: 'blocked',
    },
  ];
  // The trailer class for this legacy manifest is genuinely unknown.
  ws.unknowns = [
    { legId: 'leg-301', note: 'Original manifest missing; trailer class not recorded in the legacy system.' },
  ];
  return ws;
}

export function createFixture(id: string, scenario: ScenarioId = 'S1'): Workspace {
  switch (scenario) {
    case 'S1': return scenarioS1(id);
    case 'S2': return scenarioS2(id);
    case 'S3': return scenarioS3(id);
  }
}
