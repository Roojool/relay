/**
 * Relay — unified API entry point (PACT parity).
 *
 * Every public endpoint lives under /api/<action> and is dispatched from this
 * single route. Workspaces are anonymous and cookie-bound: the opaque
 * server-generated workspace id is set by the server and NEVER accepted from
 * the client payload. All errors are {error, code} with the proper HTTP status.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  checkOrigin,
  errorResponse,
  jsonBody,
  rateLimit,
  requireSession,
  sessionId,
  newSessionId,
  response,
} from '@/lib/http';
import {
  analyzeWorkspace,
  approveProposal,
  createWorkspace,
  editWorkspace,
  graphHealth,
  readWorkspace,
  recallMemory,
} from '@/lib/graph';
import { createFixture } from '@/lib/business-setup';
import { runAgentAnalysis, runAgentMemory } from '@/lib/agents';
import { buildAnalysis } from '@/lib/domain';
import type { AgentReply } from '@/lib/types';
import {
  analyzeBodySchema,
  approveBodySchema,
  editBodySchema,
  memoryBodySchema,
  resetBodySchema,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

function rateKey(request: NextRequest): string {
  return sessionId(request) ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
}

async function handleWorkspaceGet(request: NextRequest): Promise<NextResponse> {
  const id = sessionId(request);
  if (id) {
    const existing = await readWorkspace(id);
    if (existing) return response({ workspace: existing }, id);
  }
  const freshId = newSessionId();
  const workspace = await createWorkspace(freshId, createFixture(freshId, 'S1'));
  return response({ workspace }, freshId);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }): Promise<NextResponse> {
  try {
    checkOrigin(request);
    const { action } = await params;
    if (String(action) === 'health') {
      const ok = await graphHealth();
      return NextResponse.json({
        status: ok ? 'ok' : 'degraded',
        falkordb: ok,
        liveAgent: false,
      });
    }
    if (String(action) === 'workspace') return handleWorkspaceGet(request);
    return NextResponse.json({ error: 'Unknown endpoint.', code: 'INVALID_INPUT' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }): Promise<NextResponse> {
  try {
    checkOrigin(request);
    const { action } = await params;
    rateLimit(rateKey(request), RATE_MAX, RATE_WINDOW_MS);

    if (action === 'analyze') {
      const id = requireSession(request);
      const body = analyzeBodySchema.parse(await jsonBody(request));
      const { workspace, analysis } = await analyzeWorkspace(id, body.revision);
      const liveAnalysis = await runAgentAnalysis(workspace, analysis, { live: body.live });
      return response({ workspace, analysis: liveAnalysis }, id);
    }

    if (action === 'reset') {
      const body = resetBodySchema.parse(await jsonBody(request));
      const freshId = newSessionId();
      const workspace = await createWorkspace(freshId, createFixture(freshId, body.scenario ?? 'S1'));
      return response({ workspace }, freshId);
    }

    if (action === 'approve') {
      const id = requireSession(request);
      const body = approveBodySchema.parse(await jsonBody(request));
      const { workspace, decision } = await approveProposal(id, body.revision, body.proposalId, body.idempotencyKey);
      return response({ workspace, decision }, id);
    }

    if (action === 'memory') {
      const id = requireSession(request);
      const body = memoryBodySchema.parse(await jsonBody(request));
      const { reply: fallbackReply, workspace } = await recallMemory(id, body.message);
      const reply = await runAgentMemory(workspace, body.message, fallbackReply, { live: body.live });
      return response({ reply, workspace }, id);
    }

    return NextResponse.json({ error: 'Unknown endpoint.', code: 'INVALID_INPUT' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ action: string }> }): Promise<NextResponse> {
  try {
    checkOrigin(request);
    const { action } = await params;
    if (String(action) !== 'workspace') {
      return NextResponse.json({ error: 'Unknown endpoint.', code: 'INVALID_INPUT' }, { status: 400 });
    }
    const id = requireSession(request);
    const body = editBodySchema.parse(await jsonBody(request));
    const workspace = await editWorkspace(id, body.revision, body.edit);
    return response({ workspace }, id);
  } catch (err) {
    return errorResponse(err);
  }
}
