'use client';

import React from 'react';
import type { Workspace, Analysis, Proposal } from '@/lib/types';

interface RepairComparisonViewProps {
  workspace: Workspace;
  analysis: Analysis | null;
  onApproveProposal: (proposalId: string) => void;
  onOpenSourceDrawer: (sourceId?: string) => void;
  isApproving: boolean;
  onCheckPlan: () => void;
  isChecking: boolean;
}

export function RepairComparisonView({
  workspace,
  analysis,
  onApproveProposal,
  onOpenSourceDrawer,
  isApproving,
  onCheckPlan,
  isChecking,
}: RepairComparisonViewProps) {
  const proposals = analysis?.proposals ?? [];
  const valid = proposals.filter((p) => p.valid);
  const rejected = proposals.filter((p) => !p.valid);

  return (
    <section className="paper-card" data-testid="options-view">
      <div style={{ padding: 24, borderBottom: '1px solid var(--paper-border-hairline)' }}>
        <p className="editorial-label">Repair proposals</p>
        <h2 style={{ font: '400 clamp(24px, 4vw, 32px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Deterministic repairs
        </h2>
        <p style={{ fontSize: '13px', color: '#5b5142', maxWidth: 600 }}>
          Each proposal is a pure function of the current workspace snapshot. Rejected candidates carry
          evidence — they are never silently skipped.
        </p>
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {proposals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b5142' }}>
            <p style={{ fontSize: '14px', marginBottom: 8 }}>No repair proposals.</p>
            <p style={{ fontSize: '12px', color: '#8e857b' }}>The plan is already feasible, or run a plan check first.</p>
          </div>
        ) : (
          <>
            {valid.length > 0 && (
              <div>
                <p className="editorial-label" style={{ marginBottom: 10 }}>Valid repairs</p>
                {valid.map((p) => (
                  <div key={p.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--forest-border)', background: '#EFF6EE' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3b22' }}>Valid</span>
                      <span className="badge-status ok" style={{ fontSize: '0.7rem' }}>Proposed</span>
                    </div>
                    <h3 style={{ font: '400 16px/1.2 var(--font-serif)', color: '#33432c', marginBottom: 6 }}>{p.title}</h3>
                    <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 8 }}>{p.summary}</p>
                    {p.unlocksOriginalDeadline && (
                      <p style={{ fontSize: '12px', color: '#8a6303', fontStyle: 'italic', marginBottom: 8 }}>
                        Unlocks original deadline once approved: {p.requiresApprovalFact ?? 'approval fact'}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onApproveProposal(p.id)}
                      disabled={isApproving}
                      className="btn-editorial-secondary"
                      data-testid={`approve-${p.id}`}
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                      {isApproving ? 'Approving…' : 'Approve repair'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {rejected.length > 0 && (
              <div>
                <p className="editorial-label" style={{ marginBottom: 10 }}>Rejected candidates (with evidence)</p>
                {rejected.map((p) => (
                  <div key={p.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--orange-border)', background: '#FDEEE9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c44722' }}>Rejected</span>
                      <span className="badge-status blocked" style={{ fontSize: '0.7rem' }}>Not eligible</span>
                    </div>
                    <h3 style={{ font: '400 16px/1.2 var(--font-serif)', color: '#33432c', marginBottom: 6 }}>{p.title}</h3>
                    <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 8 }}>{p.summary}</p>
                    {p.invalidReason && (
                      <p style={{ fontSize: '12px', color: '#8b270e', marginBottom: 8 }}>{p.invalidReason}</p>
                    )}
                    {p.rejectedCandidates.length > 0 && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#655d4d', background: '#fffcf3', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                        {p.rejectedCandidates.map((rc) => (
                          <div key={rc.driverId} style={{ marginBottom: 4 }}>{rc.driverId}: {rc.reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onCheckPlan}
          disabled={isChecking}
          className="btn-editorial-secondary"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          {isChecking ? 'Checking…' : 'Re-run plan check'}
        </button>
      </div>
    </section>
  );
}
