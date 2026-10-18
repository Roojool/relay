'use client';

import React from 'react';

interface ErrorAlertProps {
  error: { message: string; code?: string } | null;
  onDismiss: () => void;
  onRetry: () => void;
  onRecheck: () => void;
}

export function ErrorAlert({ error, onDismiss, onRetry, onRecheck }: ErrorAlertProps) {
  if (!error) return null;

  return (
    <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${error.code === 'REVISION_CONFLICT' ? 'var(--sunflower-border)' : error.code === 'BUDGET_LIMIT' ? 'var(--sand-100)' : 'var(--orange-border)'}`, background: error.code === 'REVISION_CONFLICT' ? '#FFF9E6' : error.code === 'BUDGET_LIMIT' ? '#fff2df' : '#FDEEE9', color: '#3e422c', marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: error.code === 'REVISION_CONFLICT' ? '#8a6303' : error.code === 'BUDGET_LIMIT' ? '#b83412' : '#c44722' }}>
          {error.code === 'REVISION_CONFLICT' ? 'Revision conflict' : error.code === 'BUDGET_LIMIT' ? 'Allowance reached' : 'Service unavailable'}
        </span>
        <button type="button" onClick={onDismiss} style={{ fontSize: '0.75rem', color: '#8e857b', padding: 0 }}>
          Dismiss
        </button>
      </div>
      <p style={{ fontSize: '13px', marginBottom: 12 }}>{error.message}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {error.code === 'REVISION_CONFLICT' && (
          <button type="button" onClick={onRecheck} className="btn-editorial-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
            Re-check plan
          </button>
        )}
        <button type="button" onClick={onRetry} className="btn-editorial-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
          Try again
        </button>
      </div>
    </div>
  );
}
