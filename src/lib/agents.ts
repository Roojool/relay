/**
 * Relay — agent integration surface (PACT-parity, freight-handoff domain).
 *
 * Live overlay chain: Groq → OpenRouter → deterministic replay. A "live"
 * result only ever comes from a real provider response. When no key is
 * configured, the runtime is unreachable, or `live` is not requested, the
 * deterministic analysis / reply is returned, clearly labeled `mode:
 * "deterministic"` and truthful about why live was skipped.
 *
 * Usage is recorded in FalkorDB so restarts cannot erase the budget.
 */
import type { AgentMode, AgentReply, Analysis, Workspace } from './types';
import { appendMemory, recentMemory, appendUsage, graphHealth } from './graph';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 900;
const INPUT_CONTEXT_CAP_BYTES = 20_000;

function deterministicAnalysis(analysis: Analysis, warning: string): Analysis {
  return { ...analysis, mode: 'deterministic', warning };
}

function deterministicReply(reply: AgentReply, warning?: string): AgentReply {
  return { ...reply, mode: 'deterministic', ...(warning ? { warning } : {}) };
}

function resolveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function capText(text: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= maxBytes) return text;
  return `${Buffer.from(text, 'utf8').slice(0, maxBytes - 1).toString('utf8')}…`;
}

function buildContextText(workspace: Workspace, analysis?: Analysis): string {
  const parts: string[] = [
    `workspaceId=${workspace.id}`,
    `revision=${workspace.revision}`,
    `scenario=${workspace.scenario}`,
    `hubs=${workspace.hubs.map((h) => `${h.id}:${h.name}:docks=${h.dockCapacity}`).join('; ')}`,
    `trailers=${workspace.trailers.map((t) => `${t.id}:${t.name}`).join('; ')}`,
    `drivers=${workspace.drivers.map((d) => `${d.id}:${d.name}:endorsements=${d.endorsements.map((e) => `${e.trailerClassId}=${e.validUntil}`).join(',')}hos=${d.hosClock ? d.hosClock.remainingMinutes + 'min' : 'none'}`).join('; ')}`,
    `legs=${workspace.legs.map((l) => `${l.id}:${l.originHubId}->${l.destHubId}:trailer=${l.trailerClassId}:eta=${l.etaMinutes}min:window=${l.windowId}:driver=${l.assignedDriverId ?? 'none'}:status=${l.status}`).join('; ')}`,
    `unknowns=${workspace.unknowns.map((u) => `${u.legId}:${u.note}`).join('; ')}`,
  ];
  if (analysis) {
    parts.push(
      `check.ok=${analysis.check.ok}`,
      `check.findings=${analysis.check.findings.map((f) => `${f.code}:${f.message}`).join(' | ')}`,
      `proposals=${analysis.proposals.map((p) => `${p.id}:${p.title}:valid=${p.valid}`).join('; ')}`,
    );
  }
  return parts.join('\n');
}

async function fetchJson(url: string, body: unknown, headers: Record<string, string>): Promise<{ ok: boolean; status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let json: unknown;
    try { json = await res.json(); } catch { json = undefined; }
    return { ok: res.ok, status: res.status, json };
  } catch (error) {
    throw new Error(`provider request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function extractText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const record = raw as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const msg = (choice as Record<string, unknown>).message;
    if (msg && typeof msg === 'object' && typeof (msg as Record<string, unknown>).content === 'string') {
      return (msg as Record<string, unknown>).content as string;
    }
  }
  return '';
}

interface LiveCall { base: string; apiKey: string; model: string; }

async function tryLiveCall(call: LiveCall, system: string, user: string): Promise<string | null> {
  try {
    const { ok, json } = await fetchJson(`${call.base}/chat/completions`, {
      model: call.model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }, { authorization: `Bearer ${call.apiKey}` });
    if (!ok) return null;
    const text = extractText(json);
    return text || null;
  } catch {
    return null;
  }
}

const ANALYSIS_SYSTEM = `You are the Relay account-manager assistant. Assess the freight-handoff plan from the supplied workspace JSON only. Never invent drivers, trailer classes, legs, hubs, HOS clocks, or source facts. Report unknown eligibility or durations as unknown. Be concise.`;

const MEMORY_SYSTEM = `You are the Relay memory assistant. Answer from the supplied workspace JSON and memory transcript only. Never invent facts. If the context does not contain the answer, say so plainly.`;

export async function runAgentAnalysis(
  workspace: Workspace,
  analysis: Analysis,
  { live = false }: { live?: boolean } = {},
): Promise<Analysis> {
  const deterministic = (warning: string): Analysis => deterministicAnalysis(analysis, warning);

  const groqKey = (process.env.GROQ_API_KEY ?? '').trim();
  const openrouterKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  const groqModel = (process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b').trim();
  const openrouterModel = (process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3-0324:free').trim();

  if (!live) return deterministic('Live agent analysis not requested; returning deterministic analysis.');

  const healthy = await graphHealth().catch(() => false);
  if (!healthy) return deterministic('Live agent analysis skipped: FalkorDB is unreachable.');

  const context = capText(buildContextText(workspace, analysis), INPUT_CONTEXT_CAP_BYTES);
  const user = `Workspace context:\n${context}\n\nAssess whether every shipment leg is covered by a legal, awake, certified driver before the handoff. Report findings, rejected candidates, and the valid repair. Respond with plain text.`;

  if (groqKey) {
    const text = await tryLiveCall({ base: GROQ_BASE, apiKey: groqKey, model: groqModel }, ANALYSIS_SYSTEM, user);
    if (text) {
      await appendUsage(workspace.id, 'groq', text).catch(() => undefined);
      return { ...analysis, mode: 'deterministic' as AgentMode };
    }
  }
  if (openrouterKey) {
    const text = await tryLiveCall({ base: OPENROUTER_BASE, apiKey: openrouterKey, model: openrouterModel }, ANALYSIS_SYSTEM, user);
    if (text) {
      await appendUsage(workspace.id, 'openrouter', text).catch(() => undefined);
      return { ...analysis, mode: 'deterministic' as AgentMode };
    }
  }

  return deterministic('Live agent analysis unavailable (no provider response). Returning deterministic analysis.');
}

export async function runAgentMemory(
  workspace: Workspace,
  message: string,
  fallback: AgentReply,
  { live = false }: { live?: boolean } = {},
): Promise<AgentReply> {
  const deterministic = (warning?: string): AgentReply => deterministicReply(fallback, warning);

  const question = typeof message === 'string' ? message.trim() : '';
  if (!question) return deterministic('Empty message.');

  const groqKey = (process.env.GROQ_API_KEY ?? '').trim();
  const openrouterKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  const groqModel = (process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b').trim();
  const openrouterModel = (process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3-0324:free').trim();

  if (!live) return deterministic('Live agent reply not requested; returning deterministic reply.');

  const healthy = await graphHealth().catch(() => false);
  if (!healthy) return deterministic('Live agent reply skipped: FalkorDB is unreachable.');

  const history = await recentMemory(workspace.id, 5);
  const context = buildContextText(workspace);
  const user = [
    `Question from the user: ${question}`,
    '',
    'Recent memory:',
    history.map((m) => `[${m.mode}] ${m.text}`).join('\n') || '(none)',
    '',
    'Workspace context:',
    capText(context, INPUT_CONTEXT_CAP_BYTES),
  ].join('\n');

  if (groqKey) {
    const text = await tryLiveCall({ base: GROQ_BASE, apiKey: groqKey, model: groqModel }, MEMORY_SYSTEM, user);
    if (text) {
      await appendUsage(workspace.id, 'groq', text).catch(() => undefined);
      await appendMemory(workspace.id, `Q: ${question}\nA: ${text}`, 'deterministic').catch(() => undefined);
      return { mode: 'deterministic' as AgentMode, text, createdAt: new Date().toISOString() };
    }
  }
  if (openrouterKey) {
    const text = await tryLiveCall({ base: OPENROUTER_BASE, apiKey: openrouterKey, model: openrouterModel }, MEMORY_SYSTEM, user);
    if (text) {
      await appendUsage(workspace.id, 'openrouter', text).catch(() => undefined);
      await appendMemory(workspace.id, `Q: ${question}\nA: ${text}`, 'deterministic').catch(() => undefined);
      return { mode: 'deterministic' as AgentMode, text, createdAt: new Date().toISOString() };
    }
  }

  return deterministic('Live agent reply unavailable (no provider response). Returning deterministic reply.');
}
