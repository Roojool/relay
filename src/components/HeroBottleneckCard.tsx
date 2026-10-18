'use client';

import React from 'react';
import type { Workspace, Analysis } from '@/lib/types';

interface HeroBottleneckCardProps {
  workspace: Workspace;
  analysis: Analysis | null;
  onNavigateToConflicts: () => void;
  onNavigateToRepairs: () => void;
  onOpenSourceDrawer: () => void;
  onCheckPlan: () => void;
  isChecking: boolean;
}

export function HeroBottleneckCard({
  workspace,
  analysis,
  onNavigateToConflicts,
  onNavigateToRepairs,
  onOpenSourceDrawer,
  onCheckPlan,
  isChecking,
}: HeroBottleneckCardProps) {
  const check = analysis?.check;
  const ok = check?.ok ?? false;
  const critical = check?.findings.filter((f) => f.severity === 'critical').length ?? 0;

  // Find the most critical leg for the hero card
  const criticalFinding = check?.findings.find((f) => f.severity === 'critical');
  const heroLegId = criticalFinding?.evidencePath[1];
  const heroLeg = heroLegId ? workspace.legs.find((l) => l.id === heroLegId) : null;
  const heroDriver = heroLeg?.assignedDriverId ? workspace.drivers.find((d) => d.id === heroLeg.assignedDriverId) : null;

  return (
    <section className="paper-card" data-testid="hero-card" style={{ marginBottom: 24 }}>
      <div style={{ padding: 24, borderBottom: '1px solid var(--paper-border-hairline)' }}>
        <p className="editorial-label">Hero bottleneck (S1)</p>
        <h2 style={{ font: '400 clamp(24px, 4vw, 32px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Leg coverage before the handoff
        </h2>
        <p style={{ fontSize: '14px', color: '#3e422c', lineHeight: 1.6, maxWidth: 600 }}>
          Prove that every shipment leg hands off to a legal, awake, certified driver. The hero leg
          <strong>{heroLeg?.id ?? '—'}</strong> needs coverage within its window.
        </p>
      </div>

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 20 }}>
          <p className="editorial-label">Hero leg</p>
          <h3 style={{ font: '400 20px/1.2 var(--font-serif)', color: '#33432c', marginBottom: 8 }}>{heroLeg?.id ?? 'No leg selected'}</h3>
          <p style={{ fontSize: '13px', color: '#5b5142', marginBottom: 6 }}>
            {heroLeg ? `${heroLeg.originHubId} → ${heroLeg.destHubId}, ${heroLeg.etaMinutes} min, trailer ${heroLeg.trailerClassId}` : 'Run a plan check to surface the hero leg.'}
          </p>
          {heroDriver && (
            <p style={{ fontSize: '13px', color: '#5b5142', marginBottom: 6 }}>
              Driver: {heroDriver.name} • {heroDriver.hosClock?.remainingMinutes ?? '?'} min HOS remaining
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <span className={`badge-status ${ok ? 'ok' : critical > 0 ? 'blocked' : 'unknown'}`}>
            {ok ? 'All legs covered' : critical > 0 ? `${critical} critical finding${critical !== 1 ? 's' : ''}` : 'Unknown'}
          </span>
          <span className="badge-status deterministic">Rules check</span>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCheckPlan}
            disabled={isChecking}
            className="btn-editorial-primary pact-primary-action"
            data-testid="hero-check-plan"
            style={{ padding: '10px 20px', fontSize: '0.9rem' }}
          >
            {isChecking ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Checking…</span> : 'Run plan check'}
          </button>
          <button
            type="button"
            onClick={onNavigateToConflicts}
            className="btn-editorial-secondary"
            data-testid="hero-nav-conflicts"
            style={{ padding: '10px 20px', fontSize: '0.9rem' }}
          >
            View evidence
          </button>
          <button
            type="button"
            onClick={onNavigateToRepairs}
            className="btn-editorial-secondary"
            data-testid="hero-nav-repairs"
            style={{ padding: '10px 20px', fontSize: '0.9rem' }}
          >
            Review repairs
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: '12px', color: '#655d4d', fontStyle: 'italic' }}>
          Hero scenario is fictional. HOS clocks, endorsements, and hazmat single-custody are modeled on the FalkorDB graph.
        </div>
      </div>
    </section>
  );
}
