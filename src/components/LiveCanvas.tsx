import React, { useState, useEffect } from 'react';
import './LiveCanvas.css';

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
  type: 'diagram' | 'sandbox' | 'media' | 'progress';
  content: string;
  title: string;
  lastUpdated: string;
}

const LiveCanvas: React.FC = () => {
  const [state, setState] = useState<CanvasState>({
    type: 'progress',
    title: 'Ready',
    content: 'Waiting for task...',
    lastUpdated: new Date().toLocaleTimeString()
  });

  // Listen for agent canvas updates
  useEffect(() => {
    const handleUpdate = (e: any) => {
      setState(e.detail);
    };
    window.addEventListener('agent:canvas-update', handleUpdate);
    return () => window.removeEventListener('agent:canvas-update', handleUpdate);
  }, []);

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
             <div className="media-placeholder">
               <div className="media-icon">🎬</div>
               <p>{state.content}</p>
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
