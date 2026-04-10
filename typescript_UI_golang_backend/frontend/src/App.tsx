import React, { useState, useCallback, useEffect } from 'react';
import { api } from './api';
import { Shard, AppPhase, DestroyResponse, RecoverResponse } from './types';
import { ShardNode } from './components/ShardNode';
import { RecoveryLog } from './components/RecoveryLog';
import { HashDisplay } from './components/HashDisplay';
import './App.css';

const TOTAL_SHARDS = 10;
const DATA_SHARDS = 6;  // Threshold

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('init');
  const [shards, setShards] = useState<Shard[]>([]);
  const [selectedForDestroy, setSelectedForDestroy] = useState<Set<number>>(new Set());
  const [originalHash, setOriginalHash] = useState('');
  const [recoveredHash, setRecoveredHash] = useState('');
  const [recoveryLog, setRecoveryLog] = useState<string[]>([]);
  const [recoveryVerified, setRecoveryVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [warnPayload, setWarnPayload] = useState<DestroyResponse | null>(null);
  const [explosingIds, setExplodingIds] = useState<Set<number>>(new Set());
  const [statusMsg, setStatusMsg] = useState('SYSTEM READY');
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if backend has existing data
    api.getShards().then((state) => {
      if (state.shards && state.shards.length > 0) {
        setShards(state.shards);
        setOriginalHash(state.original_hash);
        setPhase('generated');
        setStatusMsg('DATABASE LOADED');
      }
    }).catch(() => {});
  }, []);

  const activeCount = shards.filter(s => !s.destroyed).length;
  const destroyedCount = shards.filter(s => s.destroyed).length;
  const isRecoverable = activeCount >= DATA_SHARDS;
  const pendingDestroyCount = selectedForDestroy.size;
  const survivingAfterDestroy = activeCount - pendingDestroyCount;
  const willBeUnrecoverable = survivingAfterDestroy < DATA_SHARDS;

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setStatusMsg('GENERATING DATABASE...');
    try {
      const res = await api.generate();
      setShards(res.shards);
      setOriginalHash(res.original_hash);
      setSelectedForDestroy(new Set());
      setRecoveryLog([]);
      setRecoveryVerified(null);
      setRecoveredHash('');
      setPhase('generated');
      setStatusMsg(`DATABASE INITIALIZED — ${res.data_size} BYTES — ${res.shard_count} SHARDS`);
    } catch (e: any) {
      setError(e.message);
      setStatusMsg('ERROR');
    }
    setLoading(false);
  };

  const toggleShard = useCallback((id: number) => {
    setSelectedForDestroy(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDestroyAttempt = async () => {
    if (selectedForDestroy.size === 0) return;
    setLoading(true);
    setError('');

    const ids = Array.from(selectedForDestroy);

    // First attempt without force to check warning
    const res = await api.destroy(ids, false);

    if (res.warning && res.unrecoverable) {
      setWarnPayload(res);
      setPhase('warn');
      setLoading(false);
      return;
    }

    await executeDestroy(ids, false);
  };

  const executeDestroy = async (ids: number[], force: boolean) => {
    setLoading(true);
    try {
      // Animate explosion
      setExplodingIds(new Set(ids));
      await new Promise(r => setTimeout(r, 600));

      const res = await api.destroy(ids, force);
      if (res.shards) setShards(res.shards);
      setSelectedForDestroy(new Set());
      setExplodingIds(new Set());
      setWarnPayload(null);
      setPhase('generated');

      const recoverable = res.recoverable;
      setStatusMsg(
        recoverable
          ? `DESTRUCTION COMPLETE — ${res.active_shards} SHARDS ACTIVE — RECOVERABLE`
          : `⚠ CRITICAL: ONLY ${res.active_shards} SHARDS — BELOW THRESHOLD — DATA ENDANGERED`
      );
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleConfirmDestroy = async () => {
    const ids = Array.from(selectedForDestroy);
    await executeDestroy(ids, true);
  };

  const handleCancelWarn = () => {
    setPhase('generated');
    setWarnPayload(null);
  };

  const handleRecover = async () => {
    setPhase('recovering');
    setRecoveryLog(['Initializing recovery protocol...']);
    setRecoveryVerified(null);
    setLoading(true);
    setStatusMsg('RECOVERY IN PROGRESS...');

    try {
      const res: RecoverResponse = await api.recover();
      setRecoveryLog(res.log || []);
      setRecoveryVerified(res.verified);
      if (res.recovered_hash) setRecoveredHash(res.recovered_hash);
      if (res.shards) setShards(res.shards);

      if (res.success && res.verified) {
        setPhase('recovered');
        setStatusMsg('✓ RECOVERY VERIFIED — DATA INTEGRITY CONFIRMED');
      } else {
        setPhase('failed');
        setStatusMsg('✗ RECOVERY FAILED — DATA PERMANENTLY LOST');
      }
    } catch (e: any) {
      setError(e.message);
      setPhase('failed');
      setStatusMsg('RECOVERY ERROR');
    }
    setLoading(false);
  };

  const handleReset = () => {
    setPhase('init');
    setShards([]);
    setSelectedForDestroy(new Set());
    setOriginalHash('');
    setRecoveredHash('');
    setRecoveryLog([]);
    setRecoveryVerified(null);
    setError('');
    setStatusMsg('SYSTEM READY');
  };

  const getStatusColor = () => {
    if (phase === 'recovered' || recoveryVerified) return '#00ff9d';
    if (phase === 'failed' || !isRecoverable) return '#ff2d55';
    if (destroyedCount > 0) return '#ffb800';
    return '#00d4ff';
  };

  return (
    <div className="app">
      {/* Background grid */}
      <div className="bg-grid" />
      <div className="bg-noise" />

      {/* Header */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-bracket">[</span>
          <span className="logo-text">ERASURE</span>
          <span className="logo-sep">·</span>
          <span className="logo-sub">CODING</span>
          <span className="logo-bracket">]</span>
        </div>
        <div className="header-meta">
          <span className="meta-item">RS({TOTAL_SHARDS},{DATA_SHARDS})</span>
          <span className="meta-sep">|</span>
          <span className="meta-item">GALOIS FIELD GF(256)</span>
          <span className="meta-sep">|</span>
          <span className="meta-item">REED–SOLOMON</span>
        </div>
      </header>

      {/* Status bar */}
      <div className="status-bar" style={{ borderColor: getStatusColor() }}>
        <div className="status-dot" style={{ background: getStatusColor() }} />
        <span className="status-text" style={{ color: getStatusColor() }}>{statusMsg}</span>
        {loading && <div className="spinner" />}
      </div>

      {error && (
        <div className="error-banner">⚠ {error}</div>
      )}

      {/* Main layout */}
      <div className="main-layout">
        {/* Left panel — controls */}
        <aside className="control-panel">
          <div className="panel-section">
            <h3 className="panel-title">◈ CONFIGURATION</h3>
            <div className="config-grid">
              <div className="config-item">
                <span className="config-label">TOTAL SHARDS</span>
                <span className="config-val">{TOTAL_SHARDS}</span>
              </div>
              <div className="config-item">
                <span className="config-label">DATA SHARDS</span>
                <span className="config-val">{DATA_SHARDS}</span>
              </div>
              <div className="config-item">
                <span className="config-label">PARITY SHARDS</span>
                <span className="config-val">{TOTAL_SHARDS - DATA_SHARDS}</span>
              </div>
              <div className="config-item">
                <span className="config-label">THRESHOLD</span>
                <span className="config-val threshold">{DATA_SHARDS}</span>
              </div>
            </div>
            <p className="config-note">
              Data can be recovered as long as at least <strong>{DATA_SHARDS}</strong> shards remain intact.
              You can destroy up to <strong>{TOTAL_SHARDS - DATA_SHARDS}</strong> shards safely.
            </p>
          </div>

          <div className="panel-section">
            <h3 className="panel-title">◈ SHARD STATUS</h3>
            <div className="shard-stats">
              <div className="stat active-stat">
                <div className="stat-num">{activeCount}</div>
                <div className="stat-lbl">ACTIVE</div>
              </div>
              <div className="stat destroyed-stat">
                <div className="stat-num">{destroyedCount}</div>
                <div className="stat-lbl">DESTROYED</div>
              </div>
              <div className={`stat ${isRecoverable ? 'ok-stat' : 'critical-stat'}`}>
                <div className="stat-num">{isRecoverable ? '✓' : '✗'}</div>
                <div className="stat-lbl">{isRecoverable ? 'RECOVERABLE' : 'UNRECOVERABLE'}</div>
              </div>
            </div>

            {shards.length > 0 && (
              <div className="threshold-bar-wrap">
                <div className="threshold-bar-label">
                  <span>Shard Health</span>
                  <span>{activeCount}/{TOTAL_SHARDS}</span>
                </div>
                <div className="threshold-bar">
                  <div
                    className="threshold-fill"
                    style={{
                      width: `${(activeCount / TOTAL_SHARDS) * 100}%`,
                      background: activeCount >= DATA_SHARDS ? '#00ff9d' : '#ff2d55',
                    }}
                  />
                  <div
                    className="threshold-line"
                    style={{ left: `${(DATA_SHARDS / TOTAL_SHARDS) * 100}%` }}
                    title={`Recovery threshold: ${DATA_SHARDS} shards`}
                  />
                </div>
                <div className="threshold-bar-note">↑ THRESHOLD @ {DATA_SHARDS}</div>
              </div>
            )}
          </div>

          {pendingDestroyCount > 0 && (
            <div className={`destroy-preview ${willBeUnrecoverable ? 'preview-danger' : 'preview-warn'}`}>
              <div className="preview-title">
                {willBeUnrecoverable ? '⚠ DANGER ZONE' : '◈ PENDING DESTRUCTION'}
              </div>
              <div className="preview-body">
                Destroying {pendingDestroyCount} shard{pendingDestroyCount > 1 ? 's' : ''}.
                {' '}Surviving: {survivingAfterDestroy}/{TOTAL_SHARDS}
                {willBeUnrecoverable && (
                  <div className="preview-warn-text">
                    Below threshold! Data will NOT be recoverable!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading}
            >
              {phase === 'init' ? '⬡ INITIALIZE DATABASE' : '⬡ REGENERATE'}
            </button>

            {(phase === 'generated' || phase === 'destroying') && selectedForDestroy.size > 0 && (
              <button
                className="btn btn-destroy"
                onClick={handleDestroyAttempt}
                disabled={loading}
              >
                💥 DESTROY {selectedForDestroy.size} SHARD{selectedForDestroy.size > 1 ? 'S' : ''}
              </button>
            )}

            {shards.length > 0 && destroyedCount > 0 && phase !== 'recovering' && phase !== 'warn' && (
              <button
                className={`btn ${isRecoverable ? 'btn-recover' : 'btn-recover-disabled'}`}
                onClick={handleRecover}
                disabled={loading || !isRecoverable}
              >
                {isRecoverable ? '⟳ ATTEMPT RECOVERY' : '✗ UNRECOVERABLE'}
              </button>
            )}

            {(phase === 'recovered' || phase === 'failed') && (
              <button className="btn btn-reset" onClick={handleReset}>
                ↺ RESET SYSTEM
              </button>
            )}
          </div>

          {phase === 'generated' && shards.length > 0 && destroyedCount === 0 && (
            <div className="panel-hint">
              Click shards to mark them for destruction
            </div>
          )}
        </aside>

        {/* Center — shard visualization */}
        <main className="shard-canvas">
          <div className="canvas-header">
            <span className="canvas-title">DATABASE SHARD MATRIX</span>
            {phase === 'generated' && shards.length > 0 && (
              <span className="canvas-hint">Select shards to destroy →</span>
            )}
          </div>

          {shards.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-text">NO DATABASE INITIALIZED</div>
              <div className="empty-sub">Click INITIALIZE DATABASE to begin</div>
            </div>
          ) : (
            <div className="shard-grid">
              {shards.map(shard => (
                <ShardNode
                  key={shard.id}
                  shard={shard}
                  selected={selectedForDestroy.has(shard.id)}
                  onToggle={toggleShard}
                  phase={phase}
                  animateDestroy={explosingIds.has(shard.id)}
                />
              ))}
            </div>
          )}

          {/* Reed-Solomon visualization */}
          {shards.length > 0 && (
            <div className="rs-visual">
              <div className="rs-row rs-data">
                {shards.slice(0, DATA_SHARDS).map(s => (
                  <div
                    key={s.id}
                    className={`rs-block ${s.destroyed ? 'rs-dead' : 'rs-live'}`}
                    title={`Data Shard ${s.id}`}
                  >D{s.id}</div>
                ))}
                <span className="rs-label">DATA</span>
              </div>
              <div className="rs-row rs-parity">
                {shards.slice(DATA_SHARDS).map(s => (
                  <div
                    key={s.id}
                    className={`rs-block ${s.destroyed ? 'rs-dead' : 'rs-parity-live'}`}
                    title={`Parity Shard ${s.id}`}
                  >P{s.id - DATA_SHARDS}</div>
                ))}
                <span className="rs-label">PARITY</span>
              </div>
            </div>
          )}
        </main>

        {/* Right panel — hashes & log */}
        <aside className="hash-panel">
          {originalHash && (
            <HashDisplay
              label="ORIGINAL SHA256"
              hash={originalHash}
              match={recoveryVerified}
            />
          )}
          {recoveredHash && recoveredHash !== originalHash && (
            <HashDisplay
              label="RECOVERED SHA256"
              hash={recoveredHash}
              match={recoveredHash === originalHash}
            />
          )}
          {recoveredHash && recoveredHash === originalHash && (
            <HashDisplay
              label="RECOVERED SHA256"
              hash={recoveredHash}
              match={true}
            />
          )}

          {recoveryLog.length > 0 && (
            <RecoveryLog log={recoveryLog} verified={recoveryVerified} />
          )}

          {phase === 'init' && (
            <div className="hash-placeholder">
              <div className="placeholder-text">
                Generate a database to see cryptographic hashes and recovery logs here
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Warning Modal */}
      {phase === 'warn' && warnPayload && (
        <div className="modal-overlay">
          <div className="modal-warn">
            <div className="modal-skull">💀</div>
            <h2 className="modal-title">CRITICAL WARNING</h2>
            <div className="modal-body">
              <p>{warnPayload.message}</p>
              <div className="modal-stats">
                <div>Surviving shards: <strong>{warnPayload.surviving_shards}</strong></div>
                <div>Required minimum: <strong>{warnPayload.threshold}</strong></div>
                <div className="modal-danger">DATA WILL BE PERMANENTLY IRRECOVERABLE</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={handleCancelWarn}>
                ← ABORT DESTRUCTION
              </button>
              <button className="btn btn-confirm-destroy" onClick={handleConfirmDestroy}>
                ☠ CONFIRM PERMANENT DESTRUCTION
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <span>Reed–Solomon · GF(256) · Galois Field Arithmetic · Vandermonde Matrix</span>
      </footer>
    </div>
  );
}
