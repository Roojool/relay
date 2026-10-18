'use client';

import React from 'react';
import type { Workspace, AgentReply } from '@/lib/types';

interface StudioMemoryViewProps {
  workspace: Workspace;
  replies: AgentReply[];
  onSendMessage: (message: string) => void;
  onOpenSourceDrawer: (sourceId?: string) => void;
  isSending: boolean;
  isLiveAiEnabled: boolean;
  isLiveCapable: boolean;
}

export function StudioMemoryView({
  workspace,
  replies,
  onSendMessage,
  onOpenSourceDrawer,
  isSending,
  isLiveAiEnabled,
  isLiveCapable,
}: StudioMemoryViewProps) {
  const [message, setMessage] = React.useState('');

  return (
    <section className="paper-card" data-testid="memory-view">
      <div style={{ padding: 24, borderBottom: '1px solid var(--paper-border-hairline)' }}>
        <p className="editorial-label">Agent memory</p>
        <h2 style={{ font: '400 clamp(24px, 4vw, 32px)/1.05 var(--font-display)', textTransform: 'uppercase', color: '#243c29', marginBottom: 12 }}>
          Q&A on the graph
        </h2>
        <p style={{ fontSize: '13px', color: '#5b5142', maxWidth: 600 }}>
          Ask about a leg, driver, or hub. The reply is grounded in the current workspace snapshot
          and the graph trail — never invented.
        </p>
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto', border: '1px solid var(--paper-border)', borderRadius: 12, background: '#fffcf3', padding: 12 }}>
          {replies.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#8e857b', fontStyle: 'italic' }}>No replies yet. Ask about leg L-31, driver Okafor, or hub Ravensgate.</p>
          ) : (
            replies.map((reply, i) => (
              <div key={i} style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: 'var(--paper-base)', border: '1px solid var(--paper-border-hairline)' }}>
                <p style={{ fontSize: '12px', color: '#655d4d', marginBottom: 4 }}>{reply.mode}</p>
                <p style={{ fontSize: '13px', color: '#3e422c', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{reply.text}</p>
                {reply.warning && <p style={{ fontSize: '11px', color: '#c28a13', marginTop: 4 }}>{reply.warning}</p>}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isSending && onSendMessage(message)}
            placeholder="Ask about a leg, driver, or hub…"
            disabled={isSending}
            className="editorial-input"
          />
          <button
            type="button"
            onClick={() => onSendMessage(message)}
            disabled={isSending || !message.trim()}
            className="btn-editorial-primary"
            style={{ padding: '8px 16px', fontSize: '0.85rem', minWidth: 120 }}
          >
            {isSending ? 'Sending…' : 'Ask'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '11px', color: '#8e857b' }}>
          <span className={`badge-status deterministic`}>Deterministic</span>
          {!isLiveCapable && <span>AI live replay unavailable</span>}
        </div>
      </div>
    </section>
  );
}
