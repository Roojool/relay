// Relay domain types — single source of truth (see BUILD_CONTRACT.md).
// Mirrors the PACT contract surface: workspace / analyze / repair / approve / memory.
// All fixture data is fictional.

export type ScenarioId = "S1" | "S2" | "S3";

export interface Hub {
  id: string;
  name: string;
  region: string;
  dockCapacity: number;
}

export interface TrailerClass {
  id: string;
  name: string;
}

export interface Driver {
  id: string;
  name: string;
  homeHubId: string;
  endorsements: TrailerClassHolding[];
  hosClock: DutyWindow | null;
}

export interface TrailerClassHolding {
  trailerClassId: string;
  validUntil: string; // ISO-8601
}

export interface DutyWindow {
  id: string;
  driverId: string;
  remainingMinutes: number;
  onDutySince: string;
  restComplete: boolean;
}

export interface Deadline {
  id: string;
  dueAt: string; // ISO-8601
  label: string;
}

export interface Leg {
  id: string;
  shipmentId: string;
  originHubId: string;
  destHubId: string;
  trailerClassId: string;
  etaMinutes: number;
  windowId: string;
  assignedDriverId: string | null;
  status: "pending" | "scheduled" | "blocked" | "completed";
}

export interface ShiftWindow {
  id: string;
  label: string;
  start: string; // ISO-8601
  end: string;   // ISO-8601
}

/** Legacy manifests whose trailer class is genuinely unknown — surfaced, never guessed. */
export interface UnknownRequirement {
  legId: string;
  note: string;
}

export interface Workspace {
  id: string;
  revision: number;
  scenario: ScenarioId;
  createdAt: string; // ISO-8601
  hubs: Hub[];
  legs: Leg[];
  drivers: Driver[];
  trailers: TrailerClass[];
  windows: ShiftWindow[];
  deadlines: Deadline[];
  unknowns: UnknownRequirement[];
  sources?: string[];
}

export type FindingSeverity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: FindingSeverity;
  code: string;
  message: string;
  /** Ordered node ids proving the multi-hop traversal (hub -> leg -> trailer class -> driver -> HOS clock). */
  evidencePath: string[];
}

export interface CheckResult {
  ok: boolean;
  checkedAtRevision: number;
  findings: Finding[];
  summary?: string;
}

export type RepairKind = "reschedule" | "reassign-driver" | "split-leg" | "clarify-unknown";

export interface RepairChange {
  kind: RepairKind;
  legId?: string;
  fromWindowId?: string;
  toWindowId?: string;
  fromDriverId?: string;
  toDriverId?: string;
  hubId?: string;
  trailerClassId?: string;
  note?: string;
}

export interface RejectedCandidate {
  driverId: string;
  reasonCode: string;
  reason: string;
}

export interface Proposal {
  id: string;
  title: string;
  summary: string;
  valid: boolean;
  status?: string;
  invalidReason?: string;
  changes: RepairChange[];
  rejectedCandidates: RejectedCandidate[];
  unlocksOriginalDeadline: boolean;
  revision?: number;
  /** New fact that, once approved, re-enables the original deadline. */
  requiresApprovalFact?: string;
}

export interface Decision {
  id: string;
  proposalId: string;
  workspaceRevisionAfter: number;
  idempotencyKey: string;
  approvedAt: string; // ISO-8601
}

export type AgentMode = "deterministic" | "live-groq" | "live-openrouter";

export interface AgentReply {
  mode: AgentMode;
  text: string;
  createdAt: string; // ISO-8601
  warning?: string;
}

export interface Analysis {
  workspaceRevision: number;
  check: CheckResult;
  proposals: Proposal[];
  mode?: AgentMode;
  warning?: string;
}

export type WorkspaceEdit =
  | { kind: "reassign-driver"; legId: string; driverId: string }
  | { kind: "reschedule"; legId: string; windowId: string }
  | { kind: "split-leg"; legId: string; hubId: string; note?: string }
  | {
      kind: "clarify-unknown";
      legId: string;
      trailerClassId: string;
      note: string;
    };
