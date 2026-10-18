'use client';

import React from 'react';

interface SourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sources: Array<{ id: string; title: string; kind: string; excerpt: string }>;
  activeSourceId: string | null;
  onSelectSource: (srcId: string) => void;
}

export function SourceDrawer({
  isOpen,
  onClose,
  sources,
  activeSourceId,
  onSelectSource,
}: SourceDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="editorial-drawer" data-testid="source-drawer" aria-label="Source evidence drawer">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1.5px solid var(--ink-primary)' }}>
        <div>
          <p className="editorial-label">Source evidence</p>
          <h2 style={{ font: '400 20px/1.2 var(--font-display)', textTransform: 'uppercase', color: '#243c29' }}>Sources</h2>
        </div>
        <button type="button" onClick={onClose} className="btn-editorial-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
          Close
        </button>
      </div>

      <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
        {sources.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#8e857b', fontStyle: 'italic', padding: 20 }}>
            Evidence is graph-derived (hub → leg → trailer class → driver → HOS clock).
            Open the Conflict view to see traversals.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sources.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelectSource(s.id)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${activeSourceId === s.id ? 'var(--ink-primary)' : 'var(--paper-border-hairline)'}`,
                  background: activeSourceId === s.id ? '#FFF9E6' : 'var(--paper-base)',
                  cursor: 'pointer',
                }}
              >
                <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#243c29', marginBottom: 4 }}>{s.title}</p>
                <p style={{ fontSize: '12px', color: '#655d4d', marginBottom: 2 }}>{s.kind}</p>
                <p style={{ fontSize: '12px', color: '#3e422c' }}>{s.excerpt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
