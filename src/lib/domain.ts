/**
 * Relay — deterministic bounded plan checker and repair proposer.
 *
 * Pure functions over a Workspace snapshot: no clock, no randomness, no I/O.
 * The same input always produces the same result (including evidence paths).
 *
 * Matching rules (from the fictional Relay freight-handoff spec):
 *  - A leg is covered only when its assigned driver holds a valid endorsement
 *    for the leg's trailer class, valid at the window start, AND has enough
 *    HOS clock remaining for the leg's eta. Missing or expired coverage is a
 *    finding, never guessed.
 *  - Hazmat single-custody: a hazmat leg must not be split across 3+ drivers
 *    (triple split rejected); a pair split at a hub is the legal maximum.
 *  - Unknown trailer class on a legacy manifest surfaces truthfully as
 *    unknown: the leg is blocked until clarified, never auto-assigned.
 *  - Dock capacity: more legs than dock capacity in the same window at a hub
 *    is a capacity conflict.
 *
 * The scheduler is deterministic: candidate windows/drivers are evaluated in
 * stable id order and the first legal repair wins.
 */
import type {
  Analysis,
  CheckResult,
  Finding,
  Proposal,
  RepairChange,
  RejectedCandidate,
  Workspace,
  WorkspaceEdit,
} from './types';

/** Hard bound so the checker always terminates on large snapshots. */
export const MAX_LEGS = 50;

/** A trailer-class endorsement is valid for a window when its expiry is not before the window start. */
function endorsementValidAt(validUntil: string, windowStart: string): boolean {
  return validUntil >= windowStart;
}

/** Parse an ISO-8601 instant to a comparable epoch-ms number. NaN if unparseable. */
function instantMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

/** Do two shift windows overlap (end-exclusive)? */
function windowsOverlap(a: ShiftWindowLike, b: ShiftWindowLike): boolean {
  return instantMs(a.start) < instantMs(b.end) && instantMs(b.start) < instantMs(a.end);
}

interface ShiftWindowLike {
  id: string;
  start: string;
  end: string;
}

interface DriverEndorsement {
  trailerClassId: string;
  validUntil: string;
}

/** Index: driverId -> trailerClassId -> validUntil. */
function buildEndorsementIndex(drivers: Workspace['drivers']): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>();
  for (const driver of drivers) {
    const endorsements = new Map<string, string>();
    for (const h of driver.endorsements) endorsements.set(h.trailerClassId, h.validUntil);
    index.set(driver.id, endorsements);
  }
  return index;
}

/** Index: trailerClassId -> set of driver ids that hold it. */
function buildEndorsementHolders(drivers: Workspace['drivers']): Map<string, Set<string>> {
  const holders = new Map<string, Set<string>>();
  for (const driver of drivers) {
    for (const h of driver.endorsements) {
      let set = holders.get(h.trailerClassId);
      if (!set) { set = new Set(); holders.set(h.trailerClassId, set); }
      set.add(driver.id);
    }
  }
  return holders;
}

interface LegContext {
  leg: Workspace['legs'][number];
  originHubName: string;
  destHubName: string;
  window: Workspace['windows'][number];
  trailerClass: Workspace['trailers'][number] | null;
  assignedDriver: Workspace['drivers'][number] | null;
}

function buildLegContexts(workspace: Workspace): LegContext[] {
  const hubsById = new Map(workspace.hubs.map((h) => [h.id, h]));
  const windowsById = new Map(workspace.windows.map((w) => [w.id, w]));
  const trailersById = new Map(workspace.trailers.map((t) => [t.id, t]));
  const driversById = new Map(workspace.drivers.map((d) => [d.id, d]));
  const contexts: LegContext[] = [];
  for (const leg of workspace.legs) {
    const originHub = hubsById.get(leg.originHubId);
    const destHub = hubsById.get(leg.destHubId);
    const window = windowsById.get(leg.windowId);
    const trailerClass = trailersById.get(leg.trailerClassId);
    const assignedDriver = leg.assignedDriverId ? driversById.get(leg.assignedDriverId) ?? null : null;
    contexts.push({
      leg,
      originHubName: originHub?.name ?? leg.originHubId,
      destHubName: destHub?.name ?? leg.destHubId,
      window: window ?? { id: leg.windowId, label: leg.windowId, start: '', end: '' },
      trailerClass: trailerClass ?? null,
      assignedDriver,
    });
  }
  return contexts.sort((a, b) => a.leg.id.localeCompare(b.leg.id));
}

function evidencePath(hub: string, leg: string, trailerClass: string | null, driver: string | null): string[] {
  return [hub, leg, trailerClass ?? '', driver ?? ''].filter(Boolean);
}

/**
 * Check whether the plan (optionally with repair `changes` applied) covers every
 * leg. Deterministic and bounded; never mutates the input.
 */
export function checkPlan(workspace: Workspace, changes: WorkspaceEdit[] = []): CheckResult {
  const findings: Finding[] = [];
  if (workspace.legs.length > MAX_LEGS) {
    return {
      ok: false,
      checkedAtRevision: workspace.revision,
      findings: [{
        id: 'finding-bound',
        severity: 'critical',
        code: 'too_many_legs',
        message: `Workspace has ${workspace.legs.length} legs; the bounded checker supports at most ${MAX_LEGS}.`,
        evidencePath: [],
      }],
    };
  }

  const endorsementIndex = buildEndorsementIndex(workspace.drivers);
  const endorsementHolders = buildEndorsementHolders(workspace.drivers);
  const windowsById = new Map(workspace.windows.map((w) => [w.id, w]));
  const driversById = new Map(workspace.drivers.map((d) => [d.id, d]));
  const hubsById = new Map(workspace.hubs.map((h) => [h.id, h]));

  // Apply repair changes logically (non-mutating) to evaluate the resulting plan.
  const legsById = new Map(workspace.legs.map((l) => [l.id, l]));
  const modifiedLegs = new Map(legsById);
  for (const change of changes) {
    if (change.kind === 'clarify-unknown') continue;
    const leg = modifiedLegs.get(change.legId);
    if (!leg) continue;
    const next: typeof leg = { ...leg };
    if (change.kind === 'reschedule' && change.windowId) next.windowId = change.windowId;
    if (change.kind === 'reassign-driver' && change.driverId) next.assignedDriverId = change.driverId;
    modifiedLegs.set(leg.id, next);
  }

  const contexts = buildLegContexts({
    ...workspace,
    legs: [...modifiedLegs.values()],
  });

  // Track per-driver assigned windows to detect consecutive-shift / HOS pressure.
  const driverAssignedLegs = new Map<string, string[]>();
  for (const ctx of contexts) {
    if (ctx.assignedDriver) {
      let list = driverAssignedLegs.get(ctx.assignedDriver.id);
      if (!list) { list = []; driverAssignedLegs.set(ctx.assignedDriver.id, list); }
      list.push(ctx.leg.id);
    }
  }

  // 1. Coverage check per leg.
  for (const ctx of contexts) {
    const { leg, window, trailerClass, assignedDriver } = ctx;
    const path = evidencePath(ctx.originHubName, leg.id, trailerClass?.id ?? null, assignedDriver?.id ?? null);

    // Unknown requirement: trailer class not recorded for this leg.
    const unknown = workspace.unknowns.find((u) => u.legId === leg.id);

    if (!assignedDriver) {
      findings.push({
        id: `finding-unassigned-${leg.id}`,
        severity: 'critical',
        code: 'unassigned',
        message: `"${leg.id}" at ${ctx.originHubName} has no driver assigned; it cannot be dispatched.`,
        evidencePath: [...path],
      });
    }

    // Driver-dependent coverage checks (HOS clock + trailer-class endorsement).
    if (assignedDriver) {
      // HOS clock check: driver must have enough remaining minutes for the leg's eta.
      const hosClock = assignedDriver.hosClock;
      if (!hosClock) {
        findings.push({
          id: `finding-hos-${leg.id}`,
          severity: 'critical',
          code: 'no_hos_clock',
          message: `${assignedDriver.name} (${assignedDriver.id}) has no HOS clock on record for "${leg.id}" (${leg.id}); cannot confirm legal driving time.`,
          evidencePath: [...path],
        });
      } else {
        const needsMinutes = leg.etaMinutes;
        if (hosClock.remainingMinutes < needsMinutes) {
          findings.push({
            id: `finding-hos-${leg.id}`,
            severity: 'critical',
            code: 'hos_insufficient',
            message: `${assignedDriver.name} has ${hosClock.remainingMinutes} min remaining HOS but "${leg.id}" needs ${needsMinutes} min — HOS clock would be exceeded.`,
            evidencePath: [...path],
          });
        }
      }

      // Trailer-class endorsement: driver must hold a valid endorsement at window start.
      if (trailerClass) {
        const validUntil = endorsementIndex.get(assignedDriver.id)?.get(trailerClass.id);
        if (!validUntil || !endorsementValidAt(validUntil, window.start)) {
          findings.push({
            id: `finding-endorsement-${leg.id}-${trailerClass.id}`,
            severity: 'critical',
            code: 'endorsement_not_valid',
            message: `${assignedDriver.name} does not hold a valid "${trailerClass.name}" endorsement for "${leg.id}" (${leg.id}) in window "${window.label}" (starts ${window.start}).`,
            evidencePath: [...path],
          });
        }
      }
    }

    // Unknown trailer class: surfaces truthfully whether or not a driver is assigned.
    if (unknown) {
      findings.push({
        id: `finding-unknown-${leg.id}`,
        severity: 'warning',
        code: 'unknown_trailer_class',
        message: `${leg.id} at ${ctx.originHubName} has an unknown trailer class ("${unknown.note}"); the leg is blocked until clarified.`,
        evidencePath: [...path],
      });
    }
  }

  // 2. Dock capacity conflicts: more legs than dock capacity at a hub in overlapping windows.
  const legsByHub = new Map<string, typeof workspace.legs>();
  for (const ctx of contexts) {
    let list = legsByHub.get(ctx.leg.originHubId);
    if (!list) { list = []; legsByHub.set(ctx.leg.originHubId, list); }
    list.push(ctx.leg);
  }
  for (const [hubId, hubLegs] of legsByHub) {
    const hub = hubsById.get(hubId);
    if (!hub) continue;
    for (let i = 0; i < hubLegs.length; i++) {
      for (let j = i + 1; j < hubLegs.length; j++) {
        const a = hubLegs[i];
        const b = hubLegs[j];
        const wa = windowsById.get(a.windowId);
        const wb = windowsById.get(b.windowId);
        if (wa && wb && windowsOverlap(wa, wb)) {
          const countAtHubInWindow = hubLegs.filter((l) => {
            const w = windowsById.get(l.windowId);
            return w && windowsOverlap(wa, w);
          }).length;
          if (countAtHubInWindow > hub.dockCapacity) {
            findings.push({
              id: `finding-dock-${hubId}-${a.id}-${b.id}`,
              severity: 'critical',
              code: 'dock_capacity',
              message: `Hub "${hub.name}" (${hubId}) has ${countAtHubInWindow} legs in overlapping window "${wa.label}" but only ${hub.dockCapacity} dock(s); "${a.id}" and "${b.id}" contend for dock space.`,
              evidencePath: [hubId, a.id, b.id],
            });
          }
        }
      }
    }
  }

  const ok = findings.every((f) => f.severity !== 'critical');
  return { ok, checkedAtRevision: workspace.revision, findings };
}

interface RepairOptions {
  legId: string;
  toWindowId?: string;
  toDriverId?: string;
}

function findLegalWindows(
  workspace: Workspace,
  legId: string,
  endorsementIndex: Map<string, Map<string, string>>,
  endorsementHolders: Map<string, Set<string>>,
  windowsById: Map<string, Workspace['windows'][number]>,
): string[] {
  const leg = [...workspace.legs].find((l) => l.id === legId);
  if (!leg) return [];
  const legal: string[] = [];
  for (const win of workspace.windows) {
    let allCovered = true;
    const trailerClass = workspace.trailers.find((t) => t.id === leg.trailerClassId);
    if (!trailerClass) { allCovered = false; }
    else {
      const holders = endorsementHolders.get(trailerClass.id);
      if (!holders) { allCovered = false; }
      else {
        let anyValid = false;
        for (const driverId of holders) {
          const validUntil = endorsementIndex.get(driverId)?.get(trailerClass.id);
          if (validUntil && endorsementValidAt(validUntil, win.start)) { anyValid = true; break; }
        }
        if (!anyValid) allCovered = false;
      }
    }
    if (allCovered) legal.push(win.id);
  }
  return legal.sort((a, b) => a.localeCompare(b));
}

/**
 * Deterministic repair proposals for the current snapshot. Never mutates the
 * input workspace. Emits reschedule proposals, reassign-driver proposals with
 * rejected backup candidates, split-leg proposals for hazmat pair-split,
 * clarify-unknown proposals, and approval-fact unlocks.
 */
export function proposeRepairs(workspace: Workspace): Proposal[] {
  const base = checkPlan(workspace);
  if (base.ok) return [];

  const endorsementIndex = buildEndorsementIndex(workspace.drivers);
  const endorsementHolders = buildEndorsementHolders(workspace.drivers);
  const windowsById = new Map(workspace.windows.map((w) => [w.id, w]));
  const driversById = new Map(workspace.drivers.map((d) => [d.id, d]));
  const hubsById = new Map(workspace.hubs.map((h) => [h.id, h]));
  const trailersById = new Map(workspace.trailers.map((t) => [t.id, t]));

  const proposals: Proposal[] = [];

  // Unknown-trailer-class proposals first: clarify before any assignment.
  for (const finding of base.findings) {
    if (finding.code !== 'unknown_trailer_class') continue;
    const legId = finding.evidencePath[1];
    const unknown = workspace.unknowns.find((u) => u.legId === legId);
    if (!unknown) continue;
    const changes: RepairChange[] = [{ kind: 'clarify-unknown', legId, trailerClassId: '', note: unknown.note }];
    proposals.push({
      id: `pr-${stableId('clarify', legId)}`,
      title: `Clarify trailer class for ${legId}`,
      summary: `${legId}: ${unknown.note}. The leg stays blocked until a trailer class is confirmed.`,
      valid: true,
      changes,
      rejectedCandidates: [],
      unlocksOriginalDeadline: false,
    });
  }

  // Reschedule proposals for HOS-insufficient or endorsement-not-valid on the assigned driver.
  for (const finding of base.findings) {
    if (finding.code !== 'hos_insufficient' && finding.code !== 'endorsement_not_pending') continue;
    // evidencePath: [hub, leg, trailerClass, driver]
    const legId = finding.evidencePath[1];
    const driverId = finding.evidencePath[3];
    const leg = [...workspace.legs].find((l) => l.id === legId);
    const driver = driversById.get(driverId);
    const win = leg ? windowsById.get(leg.windowId) : undefined;
    if (!leg || !driver || !win) continue;

    const legalWindows = findLegalWindows(workspace, legId, endorsementIndex, endorsementHolders, windowsById);
    const currentIdx = workspace.windows.findIndex((w) => w.id === leg.windowId);
    const targetWindow = legalWindows.find((wid) => {
      const w = windowsById.get(wid);
      return w && currentIdx >= 0 && instantMs(w.start) > instantMs(win.start);
    });

    if (targetWindow) {
      const changes: RepairChange[] = [{ kind: 'reschedule', legId, fromWindowId: leg.windowId, toWindowId: targetWindow }];
      const target = windowsById.get(targetWindow)!;
      proposals.push({
        id: `pr-${stableId('reschedule', legId, targetWindow)}`,
        title: `Move "${leg.id}" to ${target.label}`,
        summary: `${driver.name}'s coverage is not valid for ${leg.id} in ${win.label}. Move to ${target.label} (${target.start}) where coverage is available.`,
        valid: true,
        changes,
        rejectedCandidates: [],
        unlocksOriginalDeadline: false,
      });
    }

    // Rejected backup drivers: drivers who cannot legally cover.
    for (const candidate of [...workspace.drivers].sort((a, b) => a.id.localeCompare(b.id))) {
      if (candidate.id === driverId) continue;
      const trailerClass = trailersById.get(leg.trailerClassId);
      if (!trailerClass) continue;
      const holdsAll = Boolean(
        endorsementIndex.get(candidate.id)?.get(trailerClass.id) &&
        endorsementValidAt(endorsementIndex.get(candidate.id)!.get(trailerClass.id)!, win.start)
      ) && candidate.hosClock && candidate.hosClock.remainingMinutes >= leg.etaMinutes;
      if (holdsAll) continue; // legally eligible — not a rejection
      const reasons: string[] = [];
      const validUntil = endorsementIndex.get(candidate.id)?.get(trailerClass.id);
      if (!validUntil || !endorsementValidAt(validUntil, win.start)) {
        reasons.push(`does not hold a valid "${trailerClass.name}" endorsement for ${win.label}`);
      }
      if (!candidate.hosClock || candidate.hosClock.remainingMinutes < leg.etaMinutes) {
        reasons.push(`HOS clock would be exceeded (${candidate.hosClock?.remainingMinutes ?? 0} min remaining vs ${leg.etaMinutes} min needed)`);
      }
      proposals.push({
        id: `pr-${stableId('reject', legId, candidate.id)}`,
        title: `Rejected: ${candidate.name} for "${leg.id}"`,
        summary: `Backup driver ${candidate.name} considered and rejected: ${reasons.join('; ')}. A new approval fact would re-open this option.`,
        valid: false,
        invalidReason: reasons.join('; '),
        changes: [{ kind: 'reassign-driver', legId, fromDriverId: driverId, toDriverId: candidate.id }],
        rejectedCandidates: [{ driverId: candidate.id, reasonCode: 'not_eligible', reason: reasons.join('; ') }],
        unlocksOriginalDeadline: false,
      });
    }
  }

  // Split-leg proposal for hazmat legs where the assigned driver's HOS is insufficient.
  // Pair split at an intermediate hub: driver A drives to the hub, driver B takes custody.
  // Triple split (3+ drivers) violates single-custody hazmat — not offered.
  for (const finding of base.findings) {
    if (finding.code !== 'hos_insufficient') continue;
    const legId = finding.evidencePath[1];
    const driverId = finding.evidencePath[3];
    const leg = [...workspace.legs].find((l) => l.id === legId);
    const driver = driversById.get(driverId);
    if (!leg || !driver) continue;
    const trailerClass = trailersById.get(leg.trailerClassId);
    const isHazmat = trailerClass?.name.toLowerCase().includes('hazmat');
    if (!isHazmat) continue;

    // Look for an intermediate hub on the route (dest hub is the split point).
    const destHub = hubsById.get(leg.destHubId);
    if (!destHub) continue;

    // Check if an alternate driver is available at the dest hub with a valid endorsement and HOS.
    const alternate = [...workspace.drivers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .find((d) => {
        if (d.id === driverId) return false;
        const tc = trailersById.get(leg.trailerClassId);
        if (!tc) return false;
        const vu = endorsementIndex.get(d.id)?.get(tc.id);
        if (!vu || !endorsementValidAt(vu, leg.windowId ? windowsById.get(leg.windowId)?.start ?? '' : '')) return false;
        return d.hosClock && d.hosClock.remainingMinutes >= Math.ceil(leg.etaMinutes * 0.4) && d.hosClock.restComplete;
      });

    if (alternate) {
      proposals.push({
        id: `pr-${stableId('split', legId, destHub.id)}`,
        title: `Split "${leg.id}" at ${destHub.name}`,
        summary: `${driver.name}'s HOS clock (${driver.hosClock?.remainingMinutes ?? 0} min) is short of the ${leg.etaMinutes} min route. Split at ${destHub.name}: ${driver.name} drives the first leg, ${alternate.name} takes custody for the relay — pair fits, no triple split.`,
        valid: true,
        changes: [{ kind: 'split-leg', legId, hubId: destHub.id, note: `Pair split at ${destHub.name}: ${driver.name} → ${alternate.name}. Single-custody hazmat preserved (no 3-way split).` }],
        rejectedCandidates: [],
        unlocksOriginalDeadline: false,
      });
    }
  }

  // Approval fact: "emergency-hos-exemption-okafor" unlocks the original deadline.
  const hasHosFinding = base.findings.some((f) => f.code === 'hos_insufficient');
  if (hasHosFinding && proposals.length === 0) {
    proposals.push({
      id: `pr-${stableId('approval', 'unlock-original')}`,
      title: 'Approval: emergency HOS exemption',
      summary: 'If an emergency HOS exemption certificate is issued for the assigned driver, the original single-driver completion is re-enabled without splitting the leg.',
      valid: true,
      changes: [],
      rejectedCandidates: [],
      unlocksOriginalDeadline: true,
      requiresApprovalFact: 'emergency-hos-exemption-okafor',
    });
  }

  return proposals;
}

/** Stable 8-hex FNV-1a digest so proposal ids are deterministic across runs. */
export function stableId(...parts: string[]): string {
  const input = parts.join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Analysis assembler used by the graph layer. */
export function buildAnalysis(workspace: Workspace): Analysis {
  return {
    workspaceRevision: workspace.revision,
    check: checkPlan(workspace),
    proposals: proposeRepairs(workspace),
  };
}
