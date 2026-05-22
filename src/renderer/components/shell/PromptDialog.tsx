// @atlas-entrypoint: Simple text-input dialog. Used for "name your group" etc.
import { useEffect, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';

interface PromptDialogProps {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  message,
  defaultValue = '',
  placeholder,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
  };

  return (
    <div
      className="p4-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label={title} style={{ width: 420 }}>
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="folder" size={16} /></div>
          <div>
            <div className="t">{title}</div>
            {message && <div className="d">{message}</div>}
          </div>
          <button className="x" onClick={onCancel} aria-label="Cancel">
            <P4Icon name="x" size={14} />
          </button>
        </div>
        <div className="p4-sheet-body">
          <div className="p4-form-row" style={{ marginBottom: 0 }}>
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={placeholder}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
          </div>
        </div>
        <div className="p4-sheet-foot">
          <button className="p4-btn ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="p4-btn primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
