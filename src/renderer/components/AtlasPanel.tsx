/**
 * Atlas Panel — Redesigned to match Obsidian spec §6.13.
 *
 * Three states: idle → scanning → preview.
 * Preserves all existing hooks/IPC/props.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type {
  AtlasScanProgress,
  AtlasScanResult,
  AtlasGeneratedContent,
  AtlasStatus,
  InlineTag,
  AtlasScanPhase,
} from '../../shared/types/atlas-types';
import { showToast } from '../utils/toast';
import { SidePanel } from './SidePanel';
import { MapIcon, Copy, FileText, RotateCcw, Check } from 'lucide-react';

interface AtlasPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  isScanning: boolean;
  scanProgress: AtlasScanProgress | null;
  scanResult: AtlasScanResult | null;
  generatedContent: AtlasGeneratedContent | null;
  atlasStatus: AtlasStatus | null;
  error: string | null;
  onGenerate: () => void;
  onWrite: (claudeMd: string, repoIndex: string, inlineTags: InlineTag[]) => Promise<boolean>;
  onReset: () => void;
}

const PHASE_ORDER: AtlasScanPhase[] = ['enumerating', 'analyzing', 'inferring', 'generating'];
const PHASE_LABELS: Record<AtlasScanPhase, string> = {
  enumerating: 'Discover Files',
  analyzing: 'Analyze Imports',
  inferring: 'Infer Domains',
  generating: 'Generate Content',
};

// ─── Thin progress bar ─────────────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      style={{
        height: 6,
        background: 'var(--surface-float)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent-primary)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 0.3s var(--ease-out)',
        }}
      />
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '10px var(--space-3) 6px',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span
        style={{
          fontSize: 'var(--text-2xs)',
          fontFamily: 'var(--font-mono-ui)',
          color: 'var(--text-tertiary)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function AtlasPanel({
  isOpen,
  onClose,
  projectPath,
  isScanning,
  scanProgress,
  scanResult,
  generatedContent,
  atlasStatus,
  error,
  onGenerate,
  onWrite,
  onReset,
}: AtlasPanelProps) {
  const [editedClaudeMd, setEditedClaudeMd] = useState('');
  const [editedRepoIndex, setEditedRepoIndex] = useState('');
  const [editedTags, setEditedTags] = useState<InlineTag[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (generatedContent) {
      setEditedClaudeMd(generatedContent.claudeMd);
      setEditedRepoIndex(generatedContent.repoIndex);
      setEditedTags(generatedContent.inlineTags);
    }
  }, [generatedContent]);

  const handleWrite = useCallback(async () => {
    try {
      const success = await onWrite(editedClaudeMd, editedRepoIndex, editedTags);
      if (success) {
        showToast('Atlas files written successfully', 'success');
        onClose();
      } else {
        showToast('Failed to write atlas files', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to write atlas files', 'error');
    }
  }, [editedClaudeMd, editedRepoIndex, editedTags, onWrite, onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedClaudeMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [editedClaudeMd]);

  if (!isOpen) return null;

  const isPreviewMode = !isScanning && generatedContent !== null;
  const isIdleMode = !isScanning && generatedContent === null;

  // Scan progress percentage
  const scanPct = scanProgress && scanProgress.total > 0
    ? Math.round((scanProgress.current / scanProgress.total) * 100)
    : 0;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Atlas Engine">
      <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

        {/* Working directory */}
        {projectPath && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono-ui)',
              color: 'var(--text-tertiary)',
              padding: '4px var(--space-2)',
              background: 'var(--surface-float)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={projectPath}
          >
            {projectPath}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--semantic-error-muted)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--semantic-error)',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--semantic-error)', lineHeight: 'var(--leading-normal)' }}>
              {error}
            </span>
          </div>
        )}

        {/* Scan button */}
        {isIdleMode && (
          <button
            onClick={onGenerate}
            disabled={!projectPath || isScanning}
            style={{
              width: '100%',
              padding: '8px var(--space-3)',
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-inverse)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              fontFamily: 'var(--font-ui)',
              cursor: !projectPath ? 'not-allowed' : 'pointer',
              opacity: !projectPath ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <MapIcon size={14} />
            {atlasStatus?.hasAtlas ? 'Rebuild Atlas' : 'Scan Repository'}
          </button>
        )}

        {/* Idle — atlas status */}
        {isIdleMode && atlasStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '8px var(--space-3)',
              background: 'var(--surface-float)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: atlasStatus.hasAtlas ? 'var(--semantic-success)' : 'var(--text-tertiary)',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
                {atlasStatus.hasAtlas ? 'Atlas found' : 'Repository not scanned'}
              </div>
              {!atlasStatus.hasAtlas && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)', marginTop: 2 }}>
                  Scan this project to generate an intelligent CLAUDE.md
                </div>
              )}
              {atlasStatus.hasAtlas && atlasStatus.lastGenerated && (
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono-ui)', marginTop: 2 }}>
                  Updated {new Date(atlasStatus.lastGenerated).toLocaleDateString()}
                  {atlasStatus.inlineTagCount ? ` · ${atlasStatus.inlineTagCount} tags` : ''}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scanning state */}
      {isScanning && (
        <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <SectionLabel>Status</SectionLabel>

          {/* Phase list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {PHASE_ORDER.map((phase) => {
              const isActive = scanProgress?.phase === phase;
              const phaseIdx = PHASE_ORDER.indexOf(phase);
              const currentIdx = scanProgress ? PHASE_ORDER.indexOf(scanProgress.phase) : -1;
              const isDone = currentIdx > phaseIdx;
              return (
                <div
                  key={phase}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: '4px var(--space-2)',
                    background: isActive ? 'var(--accent-primary-muted)' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'background var(--duration-fast)',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isDone
                        ? 'var(--semantic-success)'
                        : isActive
                          ? 'var(--accent-primary)'
                          : 'var(--border-strong)',
                      flexShrink: 0,
                      animation: isActive ? 'pulse 1.5s ease-in-out infinite' : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-ui)',
                      color: isDone
                        ? 'var(--semantic-success)'
                        : isActive
                          ? 'var(--text-accent)'
                          : 'var(--text-tertiary)',
                    }}
                  >
                    {PHASE_LABELS[phase]}
                  </span>
                  {isActive && scanProgress?.message && (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 'var(--text-2xs)',
                        fontFamily: 'var(--font-mono-ui)',
                        color: 'var(--text-tertiary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {scanProgress.message}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          {scanProgress && scanProgress.total > 0 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono-ui)' }}>
                  Scanning {scanProgress.current} / {scanProgress.total} files
                </span>
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-accent)', fontFamily: 'var(--font-mono-ui)' }}>
                  {scanPct}%
                </span>
              </div>
              <ProgressBar value={scanProgress.current} max={scanProgress.total} />
            </div>
          )}
        </div>
      )}

      {/* Preview state */}
      {isPreviewMode && scanResult && (
        <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {[
              { value: scanResult.totalFiles, label: 'Files' },
              { value: scanResult.domains.length, label: 'Domains' },
            ].map(({ value, label }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '6px',
                  background: 'var(--surface-float)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-accent)', fontFamily: 'var(--font-mono-ui)' }}>
                  {value}
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          <SectionLabel>Preview</SectionLabel>

          {/* CLAUDE.md preview card */}
          <div
            style={{
              background: 'var(--surface-float)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '6px var(--space-2)',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-raised)',
              }}
            >
              <FileText size={11} style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono-ui)', color: 'var(--text-secondary)' }}>
                CLAUDE.md
              </span>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 'var(--space-2)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                lineHeight: 'var(--leading-normal)',
                maxHeight: 200,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {editedClaudeMd}
            </pre>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={handleCopy}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-1)',
                padding: '7px',
                background: 'var(--surface-float)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: copied ? 'var(--semantic-success)' : 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy to Clipboard'}
            </button>
            <button
              onClick={handleWrite}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-1)',
                padding: '7px',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-inverse)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              <FileText size={11} />
              Write CLAUDE.md
            </button>
          </div>

          {/* Reset link */}
          <button
            onClick={onReset}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 0,
              margin: '0 auto',
            }}
          >
            <RotateCcw size={10} />
            Discard and rescan
          </button>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </SidePanel>
  );
}
