'use client';

import React from 'react';
import type { Workspace, Analysis } from '@/lib/types';

export type NavView = 'dashboard' | 'overview' | 'conflicts' | 'repairs' | 'receipts' | 'memory';

interface NavProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  workspace: Workspace | null;
  analysis: Analysis | null;
  onOpenSourceDrawer: () => void;
}

export function Nav({
  currentView,
  onSelectView,
  workspace,
  analysis,
  onOpenSourceDrawer,
}: NavProps) {
  const checks = analysis?.check;
  const criticalFindings = checks?.findings.filter((f) => f.severity === 'critical').length ?? 0;
  const warnings = checks?.findings.filter((f) => f.severity === 'warning').length ?? 0;

  return (
    <nav className="pact-nav-rail" data-testid="nav-rail">
      <div className="pact-nav-items">
        <button
          type="button"
          className={`nav-item-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          data-testid="nav-dashboard"
          onClick={() => onSelectView('dashboard')}
          title="Dashboard — plan status and findings"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Dashboard</span>
        </button>
        <button
          type="button"
          className={`nav-item-btn ${currentView === 'overview' ? 'active' : ''}`}
          data-testid="nav-overview"
          onClick={() => onSelectView('overview')}
          title="Overview — legs, drivers, hubs"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Overview</span>
        </button>
        <button
          type="button"
          className={`nav-item-btn ${currentView === 'conflicts' ? 'active' : ''}`}
          data-testid="nav-conflicts"
          onClick={() => onSelectView('conflicts')}
          title="Conflicts — evidence of coverage gaps"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Conflicts</span>
          {criticalFindings > 0 && <span className="nav-count-badge">{criticalFindings}</span>}
        </button>
        <button
          type="button"
          className={`nav-item-btn ${currentView === 'repairs' ? 'active' : ''}`}
          data-testid="nav-repairs"
          onClick={() => onSelectView('repairs')}
          title="Repairs — reschedule, reassign, split-leg proposals"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Repairs</span>
          {warnings > 0 && <span className="nav-count-badge">{warnings}</span>}
        </button>
        <button
          type="button"
          className={`nav-item-btn ${currentView === 'receipts' ? 'active' : ''}`}
          data-testid="nav-receipts"
          onClick={() => onSelectView('receipts')}
          title="Receipts — approved decisions"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Receipts</span>
        </button>
        <button
          type="button"
          className={`nav-item-btn ${currentView === 'memory' ? 'active' : ''}`}
          data-testid="nav-memory"
          onClick={() => onSelectView('memory')}
          title="Memory — agent Q&A about legs and drivers"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Memory</span>
        </button>
        <button
          type="button"
          className="nav-item-btn"
          data-testid="nav-sources"
          onClick={onOpenSourceDrawer}
          title="Open source evidence drawer"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Sources</span>
        </button>
      </div>
    </nav>
  );
}
