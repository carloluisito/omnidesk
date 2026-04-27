import { useEffect, useRef, useState } from 'react';
import { useTasks } from '../hooks/useTasks';

interface Props {
  isOpen: boolean;
  repoPath: string | null;
  onClose: () => void;
}

export function TaskQuickCapture({ isOpen, repoPath, onClose }: Props) {
  const { tasks, add } = useTasks(repoPath);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else setDraft('');
  }, [isOpen]);

  if (!isOpen) return null;

  const recent = tasks.filter(t => !t.done).slice(0, 3);

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      if (!repoPath || !draft.trim()) { onClose(); return; }
      const v = draft;
      setDraft('');
      await add(v);
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '20vh', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600, background: 'var(--surface-base, #0D0E14)',
          border: '1px solid var(--border-default, #292E44)', borderRadius: 8,
          fontFamily: 'JetBrains Mono', color: 'var(--text-primary)', padding: 12,
        }}
      >
        {!repoPath ? (
          <div style={{ color: 'var(--text-tertiary)' }}>no repo — open a workspace first</div>
        ) : (
          <>
            <input
              ref={inputRef}
              placeholder="Add a task… (Enter to save, Esc to cancel)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              style={{
                width: '100%', padding: '8px 10px',
                background: 'transparent', color: 'var(--text-primary)',
                border: 'none', outline: 'none', fontSize: 14,
              }}
            />
            {recent.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <div style={{ marginBottom: 4 }}>Recent:</div>
                {recent.map(r => (
                  <div key={r.id} style={{ padding: '2px 0' }}>· {r.title}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
