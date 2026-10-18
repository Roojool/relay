'use client';

import React from 'react';
import type { Workspace, Analysis, WorkspaceEdit } from '@/lib/types';

interface DashboardViewProps {
  workspace: Workspace;
  analysis: Analysis | null;
  onNavigate: (view: 'dashboard' | 'overview' | 'conflicts' | 'repairs' | 'receipts' | 'memory') => void;
  onOpenSource: (sourceId?: string) => void;
  onEditWorkspace: (edit: WorkspaceEdit) => void;
  onCheck: () => void;
  isChecking: boolean;
}

export function DashboardView({
  workspace,
  analysis,
  onNavigate,
  onOpenSource,
  onEditWorkspace,
  onCheck,
  isChecking,
}: DashboardViewProps) {
  const check = analysis?.check;
  const ok = check?.ok ?? false;
  const critical = check?.findings.filter((f) => f.severity === 'critical').length ?? 0;
  const warnings = check?.findings.filter((f) => f.severity === 'warning').length ?? 0;

  return (
    <section className="paper-card" data-testid="dashboard-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p className="editorial-label">Relay desk</p>
          <h2 style={{ font: '400 clamp(32px, 5vw, 48px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 8 }}>
            Freight plan status
          </h2>
          <p style={{ fontSize: '14px', color: '#3e422c', maxWidth: 500 }}>
            Every shipment leg must hand off to a legal, awake, certified driver before the truck rolls.
            Coverage is discovered by real graph traversals — never denormalized foreign keys.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={`badge-status ${ok ? 'ok' : 'blocked'}`}>
            {ok ? 'All legs covered' : 'Open findings'}
          </span>
          <span className={`badge-status ${check?.ok === false && warnings > 0 ? 'unknown' : 'deterministic'}`}>
            Rules check
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160, background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 16 }}>
          <p className="editorial-label">Legs</p>
          <span style={{ font: '400 28px/1.2 var(--font-display)', color: '#33432c' }}>{workspace.legs.length}</span>
        </div>
        <div style={{ flex: 1, minWidth: 160, background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 16 }}>
          <p className="editorial-label">Drivers</p>
          <span style={{ font: '400 28px/1.2 var(--font-display)', color: '#33432c' }}>{workspace.drivers.length}</span>
        </div>
        <div style={{ flex: 1, minWidth: 160, background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 16 }}>
          <p className="editorial-label">Hubs</p>
          <span style={{ font: '400 28px/1.2 var(--font-display)', color: '#33432c' }}>{workspace.hubs.length}</span>
        </div>
        <div style={{ flex: 1, minWidth: 160, background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 16 }}>
          <p className="editorial-label">Trailer classes</p>
          <span style={{ font: '400 28px/1.2 var(--font-display)', color: '#33432c' }}>{workspace.trailers.length}</span>
        </div>
      </div>

      <div style={{ background: '#fffaf0f0', border: '1px solid #fff6e0b3', borderRadius: 21, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: '11px', color: '#655d4d', marginBottom: 8 }} className="editorial-label">Plan check result</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge-status ${ok ? 'ok' : 'blocked'}`}>
            {ok ? 'All legs are covered by legal drivers.' : `${critical} critical finding${critical !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}.`}
          </span>
          <span style={{ fontSize: '13px', color: '#5b5142' }}>Revision {workspace.revision}</span>
        </div>
      </div>

      {check && check.findings.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p className="editorial-label" style={{ marginBottom: 8 }}>Open findings</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {check.findings.slice(0, 8).map((f) => (
              <li key={f.id} style={{ marginBottom: 8, fontSize: '13px', color: '#3e422c', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: f.severity === 'critical' ? '#c44722' : '#c28a13' }}>{f.code}</span>: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onCheck}
          disabled={isChecking}
          className="btn-editorial-primary"
          data-testid="dashboard-check-plan"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          {isChecking ? 'Checking…' : 'Run plan check'}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('conflicts')}
          className="btn-editorial-secondary"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          Review evidence
        </button>
      </div>
    </section>
  );
}
