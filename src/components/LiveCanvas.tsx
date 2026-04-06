import React, { useState, useEffect } from 'react';
import './LiveCanvas.css';
import { DeadLetterEntry, mediaCloudClient } from '../core/media-ml/cloud-client';

/**
 * Live Canvas — The Visual Logic Board (OpenClaw C-5)
 *
 * This component provides a real-time visual workspace where the agent
 * can show:
 *  - Mermaid diagrams (Architecture/Thinking)
 *  - HTML/CSS sandboxes (UI Prototyping)
 *  - Media preview (Video/3D status)
 *  - Task progress visualization
 */

export interface CanvasState {
  type: 'diagram' | 'sandbox' | 'media' | 'progress' | 'soul';
  content: string;
  title: string;
  lastUpdated: string;
  metadata?: {
    runtime?: 'local' | 'cloud';
    status?: string;
    progress?: number;
    stageType?: string;
    stageId?: string;
    jobId?: string;
    mood?: string;
    energy?: number;
    memories?: Array<{ key: string; value: string }>;
  };
}

const LiveCanvas: React.FC = () => {
  const [state, setState] = useState<CanvasState>({
    type: 'progress',
    title: 'Ready',
    content: 'Waiting for task...',
    lastUpdated: new Date().toLocaleTimeString()
  });
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [deadLetterMessage, setDeadLetterMessage] = useState<string>('');

  // Listen for agent canvas updates
  useEffect(() => {
    const handleUpdate = (e: CustomEvent<CanvasState>): void => {
      setState(e.detail);
    };
    window.addEventListener('agent:canvas-update', handleUpdate as EventListener);
    return () => window.removeEventListener('agent:canvas-update', handleUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (state.type !== 'media') return;
    const refresh = (): void => {
      setDeadLetters(mediaCloudClient.listDeadLetters());
    };

    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [state.type, state.lastUpdated]);

  const handleReplayDeadLetter = async (gpuJobId: string): Promise<void> => {
    setReplayingId(gpuJobId);
    const result = await mediaCloudClient.replayDeadLetter(gpuJobId);
    setDeadLetterMessage(result.message);
    setDeadLetters(mediaCloudClient.listDeadLetters());
    setReplayingId(null);

    if (result.ok) {
      window.dispatchEvent(
        new CustomEvent<CanvasState>('agent:canvas-update', {
          detail: {
            ...state,
            content: `${state.content} · Replay queued`,
            lastUpdated: new Date().toLocaleTimeString(),
            metadata: {
              ...state.metadata,
              status: 'running',
            },
          },
        }),
      );
    }
  };

  const handleClearDeadLetters = (): void => {
    mediaCloudClient.clearDeadLetters();
    setDeadLetters([]);
    setDeadLetterMessage('Dead-letter queue cleared.');
  };

  return (
    <div className="live-canvas-container">
      <div className="canvas-header">
        <div className="canvas-dot-group">
          <span className="dot red"></span>
          <span className="dot yellow"></span>
          <span className="dot green"></span>
        </div>
        <div className="canvas-title">
          <span>{state.title}</span>
          <span className="last-sync">Sync: {state.lastUpdated}</span>
        </div>
        <div className="canvas-controls">
          <button className="canvas-btn">▢</button>
          <button className="canvas-btn">⤢</button>
        </div>
      </div>

      <div className="canvas-body ripple-dark">
        {state.type === 'progress' && (
          <div className="canvas-progress-view">
            <div className="brain-glow"></div>
            <div className="progress-content">
              <h3>Agent Thinking...</h3>
              <div className="skeleton-line"></div>
              <div className="skeleton-line short"></div>
              <p className="pulse-text">{state.content}</p>
            </div>
          </div>
        )}

        {state.type === 'diagram' && (
          <div className="canvas-diagram-view">
            <pre className="mermaid-code">{state.content}</pre>
          </div>
        )}

        {state.type === 'sandbox' && (
          <iframe 
            title="sandbox"
            className="canvas-iframe" 
            srcDoc={state.content}
          />
        )}

        {state.type === 'media' && (
          <div className="canvas-media-view">
             {state.metadata?.runtime === 'cloud' && state.metadata?.status === 'running' && (
               <div className="movie-aura" />
             )}
             <div className="media-placeholder">
               <div className="media-icon">🎬</div>
               <div className="media-runtime-chip">
                 {(state.metadata?.runtime || 'local').toUpperCase()} · {(state.metadata?.stageType || 'media').toUpperCase()}
               </div>
               <div className="media-progress-wrap">
                 <div
                   className="media-progress-fill"
                   style={{ width: `${Math.max(0, Math.min(100, state.metadata?.progress ?? 0))}%` }}
                 />
               </div>
               <p>{state.content}</p>
               {(state.metadata?.runtime === 'cloud' && (deadLetters.length > 0 || deadLetterMessage)) && (
                 <div className="dead-letter-panel">
                   <div className="dead-letter-header">
                     <span>Failed Cloud Stages: {deadLetters.length}</span>
                     {deadLetters.length > 0 && (
                       <button className="dead-letter-btn" onClick={handleClearDeadLetters}>Clear</button>
                     )}
                   </div>
                   {deadLetterMessage && <p className="dead-letter-note">{deadLetterMessage}</p>}
                   {deadLetters.slice(0, 2).map((entry) => (
                     <div key={entry.gpuJobId} className="dead-letter-item">
                       <div>
                         <strong>{entry.stageType.toUpperCase()}</strong> · {entry.reason}
                       </div>
                       <button
                         className="dead-letter-btn"
                         onClick={() => handleReplayDeadLetter(entry.gpuJobId)}
                         disabled={replayingId === entry.gpuJobId}
                       >
                         {replayingId === entry.gpuJobId ? 'Replaying...' : 'Replay'}
                       </button>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </div>
        )}

        {state.type === 'soul' && (
          <div className="canvas-soul-view">
            <div className={`mood-aura ${state.metadata?.mood?.toLowerCase() || 'neutral'}`}></div>
            <div className="soul-content">
              <h3>{state.title}</h3>
              <div className="mood-radar">
                <div className="radar-stat">
                  <span>Mood</span>
                  <span className="stat-val">{state.metadata?.mood || 'Neutral'}</span>
                </div>
                <div className="radar-stat">
                  <span>Energy</span>
                  <span className="stat-val">{state.metadata?.energy ? `${state.metadata.energy * 100}%` : '50%'}</span>
                </div>
              </div>
              <div className="habit-list">
                <h4>Recent Memories</h4>
                {(state.metadata?.memories || []).slice(0, 3).map((m, i: number) => (
                  <div key={i} className="habit-item">🧠 {m.key}: {m.value}</div>
                ))}
              </div>
              <p className="soul-bio">{state.content}</p>
            </div>
          </div>
        )}
      </div>

      <div className="canvas-footer">
        <span className="status-badge">A2UI Mode: ACTIVE</span>
        <span className="telemetry">⚡ 50ms latency | FLOPs: 4.2T</span>
      </div>
    </div>
  );
};

export default LiveCanvas;
