'use client';

import React from 'react';
import type { Workspace, Analysis, WorkspaceEdit } from '@/lib/types';

interface OverviewViewProps {
  workspace: Workspace;
  analysis: Analysis | null;
  onEditWorkspace: (edit: WorkspaceEdit) => void;
  onOpenSourceDrawer: (sourceId?: string) => void;
}

export function OverviewView({
  workspace,
  analysis,
  onEditWorkspace,
  onOpenSourceDrawer,
}: OverviewViewProps) {
  const check = analysis?.check;

  return (
    <section className="paper-card" data-testid="overview-view">
      <div style={{ padding: 24, borderBottom: '1px solid var(--paper-border-hairline)' }}>
        <p className="editorial-label">Overview</p>
        <h2 style={{ font: '400 clamp(24px, 4vw, 32px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Network overview
        </h2>
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 18 }}>
            <p className="editorial-label">Legs</p>
            <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 8 }}>{workspace.legs.length} shipment leg(s)</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {workspace.legs.slice(0, 10).map((l) => (
                <li key={l.id} style={{ marginBottom: 4, fontSize: '12px', color: '#5b5142' }}>
                  {l.id}: {l.originHubId} → {l.destHubId} ({l.etaMinutes} min, {l.status})
                </li>
              ))}
              {workspace.legs.length > 10 && <li style={{ fontSize: '12px', color: '#8e857b', fontStyle: 'italic' }}>…and {workspace.legs.length - 10} more</li>}
            </ul>
          </div>
          <div style={{ background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 18 }}>
            <p className="editorial-label">Drivers</p>
            <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 8 }}>{workspace.drivers.length} driver(s)</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {workspace.drivers.slice(0, 10).map((d) => (
                <li key={d.id} style={{ marginBottom: 4, fontSize: '12px', color: '#5b5142' }}>
                  {d.name} ({d.id}) — {d.endorsements.length} endorsement(s), {d.hosClock?.remainingMinutes ?? '?'} min HOS
                </li>
              ))}
              {workspace.drivers.length > 10 && <li style={{ fontSize: '12px', color: '#8e857b', fontStyle: 'italic' }}>…and {workspace.drivers.length - 10} more</li>}
            </ul>
          </div>
          <div style={{ background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 18 }}>
            <p className="editorial-label">Hubs</p>
            <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 8 }}>{workspace.hubs.length} hub(s)</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {workspace.hubs.slice(0, 10).map((h) => (
                <li key={h.id} style={{ marginBottom: 4, fontSize: '12px', color: '#5b5142' }}>
                  {h.name} ({h.id}) — {h.dockCapacity} dock(s)
                </li>
              ))}
            </ul>
          </div>
          <div style={{ background: '#fffaf0ed', border: '1px solid #fffae5a3', borderRadius: 22, padding: 18 }}>
            <p className="editorial-label">Trailer classes</p>
            <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 8 }}>{workspace.trailers.length} class(es)</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {workspace.trailers.map((t) => (
                <li key={t.id} style={{ marginBottom: 4, fontSize: '12px', color: '#5b5142' }}>
                  {t.name} ({t.id})
                </li>
              ))}
            </ul>
          </div>
        </div>

        {workspace.unknowns.length > 0 && (
          <div style={{ background: '#FFF9E6', border: '1px solid var(--sunflower-border)', borderRadius: 22, padding: 18 }}>
            <p className="editorial-label" style={{ color: '#8a6303' }}>Unknown trailer classes</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {workspace.unknowns.map((u) => (
                <li key={u.legId} style={{ marginBottom: 6, fontSize: '13px', color: '#3e422c' }}>
                  <span style={{ fontWeight: 600 }}>{u.legId}</span>: {u.note}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => onOpenSourceDrawer()}
            className="btn-editorial-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            Open source drawer
          </button>
        </div>
      </div>
    </section>
  );
}
