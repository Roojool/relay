'use client';

import React from 'react';
import type { Workspace, Analysis } from '@/lib/types';

interface ConflictEvidenceViewProps {
  workspace: Workspace;
  analysis: Analysis | null;
  onOpenSourceDrawer: (sourceId?: string) => void;
  onNavigateToRepairs: () => void;
  onCheckPlan: () => void;
  isChecking: boolean;
}

export function ConflictEvidenceView({
  workspace,
  analysis,
  onOpenSourceDrawer,
  onNavigateToRepairs,
  onCheckPlan,
  isChecking,
}: ConflictEvidenceViewProps) {
  const check = analysis?.check;
  const findings = check?.findings ?? [];

  return (
    <section className="paper-card" data-testid="conflict-view">
      <div style={{ padding: 24, borderBottom: '1px solid var(--paper-border-hairline)' }}>
        <p className="editorial-label">Conflict evidence</p>
        <h2 style={{ font: '400 clamp(24px, 4vw, 32px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Coverage findings
        </h2>
        <p style={{ fontSize: '13px', color: '#5b5142', maxWidth: 600 }}>
          Each finding is proven by a graph traversal: hub → leg → trailer class → driver → HOS clock.
          Nothing is guessed; unknowns are surfaced truthfully.
        </p>
      </div>

      <div style={{ padding: 24 }}>
        {findings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#5b5142' }}>
            <p style={{ fontSize: '14px', marginBottom: 8 }}>No open findings.</p>
            <p style={{ fontSize: '12px', color: '#8e857b' }}>Run a plan check to evaluate coverage.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {findings.map((f) => (
              <div key={f.id} style={{ padding: 14, borderRadius: 12, border: '1px solid ' + (f.severity === 'critical' ? 'var(--orange-border)' : 'var(--paper-border)'), background: f.severity === 'critical' ? '#FDEEE9' : 'var(--paper-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: f.severity === 'critical' ? '#c44722' : '#c28a13' }}>
                    {f.code}
                  </span>
                  <span className="badge-status" style={{ fontSize: '0.7rem' }}>{f.severity}</span>
                </div>
                <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 6 }}>{f.message}</p>
                {f.evidencePath.length > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#655d4d', background: '#fffcf3', padding: 8, borderRadius: 6 }}>
                    Traversal: {f.evidencePath.join(' → ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onCheckPlan}
          disabled={isChecking}
          className="btn-editorial-primary"
          data-testid="conflicts-check-plan"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          {isChecking ? 'Checking…' : 'Re-run plan check'}
        </button>
        <button
          type="button"
          onClick={onNavigateToRepairs}
          className="btn-editorial-secondary"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          Review repair proposals
        </button>
      </div>
    </section>
  );
}
