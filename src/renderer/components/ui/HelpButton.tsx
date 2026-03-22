interface HelpButtonProps {
  onClick: () => void;
  title?: string;
}

export function HelpButton({ onClick, title = 'Help & Shortcuts (Ctrl+/)' }: HelpButtonProps) {
  return (
    <button className="help-button" onClick={onClick} title={title} aria-label="Help">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>

      <style>{`
        .help-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: var(--surface-float);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md, 6px);
          color: var(--text-tertiary);
          cursor: pointer;
          transition: border-color var(--duration-fast, 150ms) ease,
                      color var(--duration-fast, 150ms) ease,
                      background var(--duration-fast, 150ms) ease;
        }

        .help-button:hover {
          background: var(--state-hover);
          border-color: var(--border-accent);
          color: var(--text-accent);
        }

        .help-button:active {
          transform: scale(0.95);
        }
      `}</style>
    </button>
  );
}
