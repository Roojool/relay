'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Workspace } from '@/lib/types';

const STORAGE_KEY = 'relay-business-setup-draft-v1';

export function BusinessSetup({ onCreated, onSample, aiAvailable }: { onCreated: (workspace: Workspace) => void; onSample: () => Promise<void>; aiAvailable: boolean }) {
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && typeof raw === 'string' && raw.length <= 4000) {
        setNote(raw);
      }
    } catch { /* An unavailable browser store must not block setup. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, note); } catch { /* The in-page note remains usable. */ }
  }, [loaded, note]);

  async function handleSample() {
    setBusy(true);
    setError('');
    try {
      await onSample();
    } catch {
      setError('Could not open the sample workspace. Your draft is still here.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="setup-shell" data-testid="business-setup">
      <div className="setup-heading">
        <span className="editorial-label">Relay / Freight desk setup</span>
        <h1>Your freight operation.<br /><em>Prove coverage before the handoff.</em></h1>
        <p>Load a freight-handoff fixture to explore the graph: hubs, legs, drivers, trailer classes, HOS clocks, and deadlines.</p>
        <p className="setup-hint">All fixture data is fictional. The desk is cookie-bound and anonymous — no workspace id is ever sent from the browser.</p>
      </div>

      {error && <div className="setup-error" role="alert">{error}</div>}

      <div className="setup-panel">
        <label htmlFor="relay-note">Describe your relay desk (optional)</label>
        <p className="setup-hint">A note helps label this session. It does not change the graph fixture; the fixture is chosen when you load a sample.</p>
        <textarea
          id="relay-note"
          data-testid="relay-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="e.g. L-31 hazmat desk, S1 hero scenario"
        />
        <p className="setup-hint">This note stays in this browser until you clear it. AI setup is not configured for Relay; load a sample fixture instead.</p>
        <div className="setup-actions">
          <button className="btn-editorial-secondary" onClick={() => { setNote(''); setError(''); }} disabled={busy || !note}>Clear my note</button>
        </div>
        <div className="setup-secondary-actions">
          <button disabled={busy} onClick={handleSample} data-testid="load-sample" style={{ minWidth: '200px' }}>
            {busy ? 'Loading sample…' : <><ArrowRight size={15} /> Load freight-handoff sample</>}
          </button>
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onSample(); } finally { setBusy(false); } }} data-testid="try-original-sample">
            Try the original sample workspace
          </button>
        </div>
        {!aiAvailable && (
          <p className="setup-hint">AI setup is currently unavailable. The sample fixture still loads and the full desk works in rules mode.</p>
        )}
      </div>
    </section>
  );
}
