interface PanelFooterProps {
  learnMoreUrl?: string;
  docsUrl?: string;
}

export function PanelFooter({ learnMoreUrl, docsUrl }: PanelFooterProps) {
  if (!learnMoreUrl && !docsUrl) {
    return null;
  }

  return (
    <div className="panel-footer">
      <div className="footer-links">
        {learnMoreUrl && (
          <a
            className="footer-link"
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Learn more about this feature"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Learn More
          </a>
        )}
        {docsUrl && (
          <a
            className="footer-link"
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View documentation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            View Docs
          </a>
        )}
      </div>

      <style>{`
        .panel-footer {
          display: flex;
          justify-content: flex-start;
          align-items: center;
          padding: var(--space-4, 16px) var(--space-6, 24px);
          border-top: 1px solid var(--border-subtle, #1E2030);
          background: var(--surface-raised, #13141C);
          flex-shrink: 0;
        }

        .footer-links {
          display: flex;
          gap: var(--space-4, 16px);
        }

        .footer-link {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-accent, #00C9A7);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          text-decoration: none;
          padding: 6px var(--space-3, 12px);
          border-radius: var(--radius-md, 6px);
          transition: background var(--duration-fast, 150ms) ease,
                      color var(--duration-fast, 150ms) ease;
        }

        .footer-link:hover {
          background: var(--state-hover, #FFFFFF0A);
          color: var(--text-primary, #E2E4F0);
        }

        .footer-link svg {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
