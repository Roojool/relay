'use client';

import React from 'react';

interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResetModal({ isOpen, onClose, onConfirm }: ResetModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" data-testid="reset-modal" role="dialog" aria-modal="true">
      <div className="modal-content">
        <p className="editorial-label">Start over</p>
        <h2 style={{ font: '400 24px/1.2 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Reset the relay desk
        </h2>
        <p style={{ fontSize: '13px', color: '#3e422c', marginBottom: 20 }}>
          This clears the current workspace and loads a fresh fixture. The cookie-bound anonymous
          workspace id rotates; no data is sent from the browser.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} className="btn-editorial-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Cancel
          </button>
          <button type="button" onClick={() => { onClose(); onConfirm(); }} className="btn-editorial-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
