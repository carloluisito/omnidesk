// @atlas-entrypoint: Attention cockpit (⌘J).
// A cross-repo "who needs you" overlay — the routing surface of the
// supervisory cockpit. Reuses the ⌘K palette's overlay shell and chip visuals.
import { useEffect, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import {
  colorBg, colorFg, initials, agentLetter,
  STATUS_META, type RepoColor,
} from './shell-utils';
import { mapTabStatus } from './SessionRail';
import type { AttentionItem } from '../../hooks/useAttentionQueue';

interface CockpitPanelProps {
  items: AttentionItem[];
  onJump: (sessionId: string) => void;
  onAcknowledge: (sessionId: string) => void;
  onClose: () => void;
  /** Ship-it flow: offered on 'done' items (session → PR handoff). */
  onShipIt?: (sessionId: string, sessionName: string) => void;
}

export function CockpitPanel({ items, onJump, onAcknowledge, onClose, onShipIt }: CockpitPanelProps) {
  const [sel, setSel] = useState(0);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { rowsRef.current?.focus(); }, []);
  useEffect(() => { if (sel > items.length - 1) setSel(Math.max(0, items.length - 1)); }, [items.length, sel]);

  const jump = (id: string) => { onJump(id); onClose(); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { setSel(s => Math.min(items.length - 1, s + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSel(s => Math.max(0, s - 1)); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = items[sel]; if (it) jump(it.session.id); e.preventDefault(); }
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="p4-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Attention cockpit"
        tabIndex={-1}
        ref={rowsRef}
        onKeyDown={handleKey}
      >
        <div className="p4-palette-input" style={{ cursor: 'default' }}>
          <P4Icon name="bolt" size={15} style={{ color: 'var(--warning)' }} />
          <div style={{ flex: 1, fontWeight: 600 }}>
            {items.length === 0 ? 'Nothing needs you' : `${items.filter(i => !i.acknowledged).length} need you`}
          </div>
          <kbd className="p4-kbd">⎋</kbd>
        </div>

        <div className="p4-palette-list">
          {items.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
              All quiet. Agents that need approval, are waiting for input, errored, or finished a turn will appear here.
            </div>
          )}

          {items.map((it, i) => {
            const status = mapTabStatus(it.session);
            const meta = STATUS_META[status];
            const color: RepoColor = status === 'errored' ? 'error'
              : status === 'needs-approval' || status === 'awaiting' ? 'warn'
              : status === 'done' ? 'success' : 'info';
            return (
              <div
                key={it.session.id}
                className={'p4-palette-row' + (sel === i ? ' on' : '')}
                onMouseEnter={() => setSel(i)}
                style={{ opacity: it.acknowledged ? 0.5 : 1, alignItems: 'flex-start' }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: colorBg(color), color: colorFg(color),
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>{initials(it.session.name)}</span>

                <div style={{ flex: 1, marginLeft: 2, minWidth: 0 }}>
                  <div className="txt" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.session.name}</span>
                    <span
                      className={'p4-chip ' + (meta.chip || '')}
                      style={{ flexShrink: 0, animation: meta.pulse ? 'p4-pulse 1.6s var(--ease-in-out) infinite' : undefined }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.repoName ? `${it.repoName} · ` : ''}{agentLetter(it.session.providerId)}
                    {it.preview ? ` · ${it.preview}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="p4-btn primary" style={{ padding: '4px 10px' }} onClick={() => jump(it.session.id)}>
                    <P4Icon name="focus" size={12} /> Jump
                  </button>
                  {status === 'done' && onShipIt && (
                    <button
                      className="p4-btn"
                      style={{ padding: '4px 10px' }}
                      title="Turn this session's branch into a pull request"
                      onClick={() => { onShipIt(it.session.id, it.session.name); onClose(); }}
                    >
                      <P4Icon name="branch" size={12} /> Ship it
                    </button>
                  )}
                  <button className="p4-btn" style={{ padding: '4px 10px' }} onClick={() => onAcknowledge(it.session.id)}>
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
