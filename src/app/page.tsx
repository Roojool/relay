'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Workspace, Analysis, AgentReply, WorkspaceEdit, Decision } from '@/lib/types';
import { Header } from '@/components/Header';
import { Nav } from '@/components/Nav';
import { DashboardView } from '@/components/DashboardView';
import { HeroBottleneckCard } from '@/components/HeroBottleneckCard';
import { BusinessSetup } from '@/components/BusinessSetup';
import { OverviewView } from '@/components/OverviewView';
import { ConflictEvidenceView } from '@/components/ConflictEvidenceView';
import { RepairComparisonView } from '@/components/RepairComparisonView';
import { SavedReceiptsView } from '@/components/SavedReceiptsView';
import { StudioMemoryView } from '@/components/StudioMemoryView';
import { SourceDrawer } from '@/components/SourceDrawer';
import { ResetModal } from '@/components/EditModals';
import { ErrorAlert } from '@/components/ErrorAlert';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { RefreshCw, Compass } from 'lucide-react';

export default function RelayDeskPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [health, setHealth] = useState<{ ok?: boolean; liveAvailable?: boolean; graphConnected?: boolean; database?: boolean; [key: string]: unknown } | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSendingMemory, setIsSendingMemory] = useState<boolean>(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const [currentView, setCurrentView] = useState<'dashboard' | 'overview' | 'conflicts' | 'repairs' | 'receipts' | 'memory'>('dashboard');
  const [isLiveAiEnabled, setIsLiveAiEnabled] = useState<boolean>(false);

  const [isSourceDrawerOpen, setIsSourceDrawerOpen] = useState<boolean>(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);

  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [memoryReplies, setMemoryReplies] = useState<AgentReply[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        if (!data.liveAvailable && !data.liveAiAvailable) setIsLiveAiEnabled(false);
      } else {
        setHealth({ ok: false, graphConnected: false, database: false, liveAvailable: false });
        setIsLiveAiEnabled(false);
      }
    } catch {
      setHealth({ ok: false, graphConnected: false, database: false, liveAvailable: false });
      setIsLiveAiEnabled(false);
    }
  }, []);

  const fetchWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { message: errData.error || 'The relay service is unavailable. Try again.', code: String(res.status) };
      }
      const data = await res.json();
      setWorkspace(data.workspace);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({ message: typedErr.message || 'The relay service is unavailable. Try again.', code: typedErr.code || 'SERVICE_UNAVAILABLE' });
      setWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchWorkspace();
  }, [fetchHealth, fetchWorkspace]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [currentView, workspace?.id]);

  const handleAnalyze = async () => {
    if (!workspace || isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const isLiveCandidate = isLiveAiEnabled && Boolean(health?.liveAvailable || health?.liveAiAvailable);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: workspace.revision, live: isLiveCandidate }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { message: errData.error || 'The check could not run. Try again.', code: String(res.status) };
      }
      const data = await res.json();
      setWorkspace(data.workspace);
      setAnalysis(data.analysis);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({ message: typedErr.message || 'The check could not run. Try again.', code: typedErr.code || 'CHECK_ERROR' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEditWorkspace = async (edit: WorkspaceEdit) => {
    if (!workspace) return;
    setError(null);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: workspace.revision, edit }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { message: errData.error || 'The edit could not be applied.', code: String(res.status) };
      }
      const data = await res.json();
      setWorkspace(data.workspace);
      setAnalysis(null);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({ message: typedErr.message || 'The edit could not be applied.', code: typedErr.code || 'EDIT_ERROR' });
      throw err;
    }
  };

  const handleApproveProposal = async (proposalId: string) => {
    if (!workspace || isApproving) return;
    setIsApproving(true);
    setError(null);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: workspace.revision, proposalId, idempotencyKey }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { message: errData.error || 'The approval could not be recorded.', code: String(res.status) };
      }
      const data = await res.json();
      setWorkspace(data.workspace);
      setAnalysis(null);
      setCurrentView('receipts');
      if (data.decision) {
        setDecisions((prev) => [data.decision, ...prev]);
      }
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({ message: typedErr.message || 'The approval could not be recorded.', code: typedErr.code || 'APPROVE_ERROR' });
    } finally {
      setIsApproving(false);
    }
  };

  const handleResetWorkspace = async (sample = true) => {
    setError(null);
    try {
      const res = await fetch(sample ? '/api/reset' : '/api/workspace', {
        method: sample ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: sample ? JSON.stringify({}) : undefined,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { message: errData.error || 'The workspace could not be reset.', code: String(res.status) };
      }
      const data = await res.json();
      setWorkspace(data.workspace);
      setAnalysis(null);
      setMemoryReplies([]);
      setDecisions([]);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({ message: typedErr.message || 'The workspace could not be reset.', code: typedErr.code || 'RESET_ERROR' });
      throw err;
    }
  };

  const handleSendMemoryMessage = async (message: string) => {
    if (isSendingMemory) return;
    setIsSendingMemory(true);
    setError(null);
    try {
      const isLiveCandidate = isLiveAiEnabled && Boolean(health?.liveAvailable || health?.liveAiAvailable);
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, live: isLiveCandidate }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw { message: errData.error || 'The message could not be sent.', code: String(res.status) };
      }
      const data = await res.json();
      setMemoryReplies((prev) => [data.reply, ...prev]);
      if (data.workspace) setWorkspace(data.workspace);
    } catch (err: unknown) {
      const typedErr = err as { message?: string; code?: string };
      setError({ message: typedErr.message || 'The message could not be sent.', code: typedErr.code || 'MEMORY_ERROR' });
    } finally {
      setIsSendingMemory(false);
    }
  };

  const handleOpenSourceDrawer = (sourceId?: string) => {
    setActiveSourceId(null);
    setIsSourceDrawerOpen(true);
  };

  return (
    <div className="pact-app-layout" data-business-type="other">
      {workspace && (
        <div className="pact-topbar">
          <Header
            workspace={workspace}
            analysis={analysis}
            health={health}
            isLiveAiEnabled={isLiveAiEnabled}
            onToggleLiveAi={setIsLiveAiEnabled}
            onAnalyze={handleAnalyze}
            onResetClick={() => setIsResetModalOpen(true)}
            isAnalyzing={isAnalyzing}
          />
          <Nav
            currentView={currentView}
            onSelectView={setCurrentView}
            workspace={workspace}
            analysis={analysis}
            onOpenSourceDrawer={() => handleOpenSourceDrawer()}
          />
        </div>
      )}

      <main className="pact-content-container" data-testid="main-stage" data-view={currentView}>
        <ErrorAlert error={error} onDismiss={() => setError(null)} onRetry={fetchWorkspace} onRecheck={handleAnalyze} />

        {isLoading ? (
          <SkeletonLoader />
        ) : !workspace && !error ? (
          <BusinessSetup
            aiAvailable={false}
            onSample={handleResetWorkspace}
            onCreated={(created) => {
              setWorkspace(created);
              setAnalysis(null);
              setMemoryReplies([]);
              setCurrentView('dashboard');
            }}
          />
        ) : !workspace ? (
          <div className="paper-card pact-empty-state" data-testid="workspace-empty" style={{ padding: '48px 36px', textAlign: 'center', maxWidth: '640px', margin: '40px auto' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--paper-subtle)', border: '1px solid var(--paper-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: 'var(--ink-secondary)' }}>
              <Compass size={24} />
            </div>
            <span className="editorial-label" style={{ color: 'var(--clay-700)', display: 'block', marginBottom: '4px' }}>Your relay desk</span>
            <h2 className="editorial-headline" style={{ fontSize: '1.5rem', marginBottom: '12px' }}>The relay service is unavailable. Try again.</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', lineHeight: '1.5', marginBottom: '24px' }}>Please check your connection or retry to load the freight-handoff fixture.</p>
            <button type="button" onClick={fetchWorkspace} className="btn-editorial-primary" style={{ padding: '8px 20px' }}>
              <RefreshCw size={14} />
              <span>Try again</span>
            </button>
          </div>
        ) : (
          <>
            {currentView === 'dashboard' && (
              <>
                <HeroBottleneckCard
                  workspace={workspace}
                  analysis={analysis}
                  onNavigateToConflicts={() => setCurrentView('conflicts')}
                  onNavigateToRepairs={() => setCurrentView('repairs')}
                  onOpenSourceDrawer={handleOpenSourceDrawer}
                  onCheckPlan={handleAnalyze}
                  isChecking={isAnalyzing}
                />
                <DashboardView workspace={workspace} analysis={analysis} onNavigate={setCurrentView} onOpenSource={handleOpenSourceDrawer} onEditWorkspace={handleEditWorkspace} onCheck={handleAnalyze} isChecking={isAnalyzing} />
              </>
            )}
            {currentView === 'overview' && (
              <OverviewView workspace={workspace} analysis={analysis} onEditWorkspace={handleEditWorkspace} onOpenSourceDrawer={handleOpenSourceDrawer} />
            )}
            {currentView === 'conflicts' && (
              <ConflictEvidenceView workspace={workspace} analysis={analysis} onOpenSourceDrawer={handleOpenSourceDrawer} onNavigateToRepairs={() => setCurrentView('repairs')} onCheckPlan={handleAnalyze} isChecking={isAnalyzing} />
            )}
            {currentView === 'repairs' && (
              <RepairComparisonView workspace={workspace} analysis={analysis} onApproveProposal={handleApproveProposal} onOpenSourceDrawer={handleOpenSourceDrawer} isApproving={isApproving} onCheckPlan={handleAnalyze} isChecking={isAnalyzing} />
            )}
            {currentView === 'receipts' && (
              <SavedReceiptsView workspace={workspace} decisions={decisions} onOpenSourceDrawer={handleOpenSourceDrawer} onNavigateToOverview={() => setCurrentView('overview')} />
            )}
            {currentView === 'memory' && (
              <StudioMemoryView workspace={workspace} replies={memoryReplies} onSendMessage={handleSendMemoryMessage} onOpenSourceDrawer={handleOpenSourceDrawer} isSending={isSendingMemory} isLiveAiEnabled={isLiveAiEnabled} isLiveCapable={Boolean(health?.liveAvailable || health?.liveAiAvailable)} />
            )}
          </>
        )}
      </main>

      <SourceDrawer isOpen={isSourceDrawerOpen} onClose={() => setIsSourceDrawerOpen(false)} sources={[]} activeSourceId={activeSourceId} onSelectSource={() => {}} />

      {isResetModalOpen && (
        <ResetModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirm={() => handleResetWorkspace(false)} />
      )}
    </div>
  );
}
