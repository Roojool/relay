'use client';

import React from 'react';
import type { Workspace, Decision } from '@/lib/types';

interface SavedReceiptsViewProps {
  workspace: Workspace;
  decisions: Decision[];
  onOpenSourceDrawer: (sourceId?: string) => void;
  onNavigateToOverview: () => void;
}

export function SavedReceiptsView({
  workspace,
  decisions,
  onOpenSourceDrawer,
  onNavigateToOverview,
}: SavedReceiptsViewProps) {
  return (
    <section className="paper-card" data-testid="receipts-view">
      <div style={{ padding: 24, borderBottom: '1px solid var(--paper-border-hairline)' }}>
        <p className="editorial-label">Receipts</p>
        <h2 style={{ font: '400 clamp(24px, 4vw, 32px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Approved decisions
        </h2>
        <p style={{ fontSize: '13px', color: '#5b5142', maxWidth: 600 }}>
          Each approved repair is recorded idempotently: the same idempotency key returns the same
          decision, and the workspace revision is bumped exactly once.
        </p>
      </div>

      <div style={{ padding: 24 }}>
        {decisions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b5142' }}>
            <p style={{ fontSize: '14px', marginBottom: 8 }}>No approved decisions yet.</p>
            <p style={{ fontSize: '12px', color: '#8e857b' }}>Approve a repair proposal to record a decision here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {decisions.map((d) => (
              <div key={d.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--forest-border)', background: '#EFF6EE' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1f3b22' }}>Decision</span>
                  <span className="badge-status ok" style={{ fontSize: '0.7rem' }}>Approved</span>
                </div>
                <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 6 }}>
                  Proposal <strong>{d.proposalId}</strong> — approved at workspace revision {d.workspaceRevisionAfter}.
                </p>
                <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 0 }}>
                  Idempotency key: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{d.idempotencyKey}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onNavigateToOverview}
          className="btn-editorial-secondary"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          Back to overview
        </button>
      </div>
    </section>
  );
}
