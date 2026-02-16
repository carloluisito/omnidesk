import { useState, useEffect, useRef } from 'react';
import type { PlaybookExecutionState } from '../../shared/types/playbook-types';

interface PlaybookProgressPanelProps {
  execution: PlaybookExecutionState | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PlaybookProgressPanel({ execution, onCancel, onConfirm }: PlaybookProgressPanelProps) {
  const [elapsed, setElapsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Elapsed timer
  useEffect(() => {
    if (execution && (execution.status === 'running' || execution.status === 'paused')) {
      setDismissed(false);
      const start = execution.startedAt;
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - start);
      }, 1000);
      return () => clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [execution?.status, execution?.startedAt]);

  // Auto-dismiss after completion
  useEffect(() => {
    if (execution && (execution.status === 'completed' || execution.status === 'cancelled' || execution.status === 'failed')) {
      const timer = setTimeout(() => setDismissed(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [execution?.status]);

  if (!execution || dismissed) return null;

  const isRunning = execution.status === 'running';
  const isPaused = execution.status === 'paused';
  const isFinished = execution.status === 'completed' || execution.status === 'cancelled' || execution.status === 'failed';
  const currentStep = execution.stepStates[execution.currentStepIndex];
  const isConfirmGate = currentStep?.status === 'waiting_confirmation';
  const totalSteps = execution.stepStates.length;
  const completedSteps = execution.stepStates.filter(s => s.status === 'completed').length;

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  const getStatusColor = () => {
    if (execution.status === 'completed') return '#9ece6a';
    if (execution.status === 'failed') return '#f7768e';
    if (execution.status === 'cancelled') return '#e0af68';
    return '#7aa2f7';
  };

  const getStatusIcon = () => {
    if (execution.status === 'completed') return '\u2713';
    if (execution.status === 'failed') return '\u2717';
    if (execution.status === 'cancelled') return '\u23F9';
    if (isPaused) return '\u23F8';
    return '\u25B6';
  };

  return (
    <div className={`pb-progress ${isConfirmGate ? 'expanded' : ''}`}>
      <div className="pb-progress-bar">
        {execution.stepStates.map((step, i) => {
          let color = '#292e42'; // pending
          if (step.status === 'completed') color = '#9ece6a';
          else if (step.status === 'running') color = '#7aa2f7';
          else if (step.status === 'waiting_confirmation') color = '#e0af68';
          else if (step.status === 'failed' || step.status === 'timed_out') color = '#f7768e';
          else if (step.status === 'skipped') color = '#565f89';

          return (
            <div
              key={i}
              className="pb-progress-segment"
              style={{
                flex: 1,
                background: color,
                opacity: step.status === 'running' ? undefined : 1,
              }}
            >
              {step.status === 'running' && <div className="pb-progress-pulse" />}
            </div>
          );
        })}
      </div>

      <div className="pb-progress-info">
        <div className="pb-progress-left">
          <span className="pb-progress-status-icon" style={{ color: getStatusColor() }}>
            {getStatusIcon()}
          </span>
          <span className="pb-progress-name">{execution.playbookName}</span>
          {(isRunning || isPaused) && (
            <span className="pb-progress-step">
              Step {execution.currentStepIndex + 1}/{totalSteps}
            </span>
          )}
          {isFinished && (
            <span className="pb-progress-step" style={{ color: getStatusColor() }}>
              {completedSteps}/{totalSteps} completed
            </span>
          )}
          <span className="pb-progress-elapsed">{formatElapsed(elapsed)}</span>
        </div>

        <div className="pb-progress-right">
          {isConfirmGate && (
            <button className="pb-progress-confirm" onClick={onConfirm}>
              Continue
            </button>
          )}
          {(isRunning || isPaused) && (
            <button className="pb-progress-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          {isFinished && (
            <button className="pb-progress-dismiss" onClick={() => setDismissed(true)}>
              Dismiss
            </button>
          )}
        </div>
      </div>

      <style>{progressStyles}</style>
    </div>
  );
}

const progressStyles = `
  .pb-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: rgba(31, 35, 53, 0.95);
    backdrop-filter: blur(8px);
    border-top: 1px solid #292e42;
    display: flex;
    flex-direction: column;
    z-index: 100;
    transition: height 0.2s ease;
  }

  .pb-progress.expanded {
    height: 72px;
  }

  .pb-progress-bar {
    display: flex;
    gap: 2px;
    padding: 0 12px;
    height: 4px;
    flex-shrink: 0;
  }

  .pb-progress-segment {
    border-radius: 2px;
    position: relative;
    overflow: hidden;
  }

  .pb-progress-pulse {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    animation: pb-pulse 1.5s ease-in-out infinite;
  }

  @keyframes pb-pulse {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .pb-progress-info {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
  }

  .pb-progress-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pb-progress-status-icon {
    font-size: 14px;
    width: 18px;
    text-align: center;
  }

  .pb-progress-name {
    color: #c0caf5;
    font-size: 12px;
    font-weight: 500;
  }

  .pb-progress-step {
    color: #565f89;
    font-size: 11px;
  }

  .pb-progress-elapsed {
    color: #565f89;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .pb-progress-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pb-progress-confirm {
    background: #9ece6a;
    border: none;
    border-radius: 4px;
    color: #1a1b26;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-progress-confirm:hover {
    background: #a9d682;
  }

  .pb-progress-cancel {
    background: transparent;
    border: 1px solid #f7768e;
    border-radius: 4px;
    color: #f7768e;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-progress-cancel:hover {
    background: rgba(247, 118, 142, 0.1);
  }

  .pb-progress-dismiss {
    background: transparent;
    border: 1px solid #565f89;
    border-radius: 4px;
    color: #565f89;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-progress-dismiss:hover {
    background: rgba(86, 95, 137, 0.1);
  }
`;
