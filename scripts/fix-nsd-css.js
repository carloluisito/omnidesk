const fs = require('fs');
const path = 'C:/Users/carlo/Desktop/repositories/personal/claudedesk/src/renderer/components/ui/NewSessionDialog.tsx';
let content = fs.readFileSync(path, 'utf8');

const stylesStart = content.indexOf('const styles = `');
const stylesEnd = content.indexOf('`;\n', stylesStart) + 3;

const newStyles = `const styles = \`
  .nsd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    transition: background var(--duration-normal) var(--ease-out);
    font-family: var(--font-ui);
  }

  .nsd-overlay.visible {
    background: rgba(0, 0, 0, 0.6);
  }

  .nsd-dialog {
    width: var(--dialog-width-md, 520px);
    max-width: calc(100vw - 32px);
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    overflow: hidden;
    transform: scale(0.96) translateY(8px);
    opacity: 0;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .nsd-dialog.visible {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  /* Header */
  .nsd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px var(--space-5);
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-raised);
  }

  .nsd-title {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
    margin: 0;
    font-family: var(--font-ui);
  }

  .nsd-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-close:hover {
    background: var(--state-hover);
    color: var(--text-primary);
  }

  /* Split Layout */
  .nsd-split {
    display: flex;
    height: 280px;
    border-bottom: 1px solid var(--border-default);
  }

  /* Workspace Rail */
  .nsd-rail {
    width: 140px;
    background: var(--surface-base);
    border-right: 1px solid var(--border-default);
    display: flex;
    flex-direction: column;
  }

  .nsd-rail-label {
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--text-tertiary);
    padding: 12px 12px 8px;
    font-family: var(--font-ui);
  }

  .nsd-workspace-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 6px 6px;
  }

  .nsd-workspace-tab {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast);
    text-align: left;
    margin-bottom: 4px;
    font-family: var(--font-ui);
  }

  .nsd-workspace-tab:hover {
    background: var(--surface-overlay);
    border-color: var(--border-default);
  }

  .nsd-workspace-tab.active {
    background: var(--accent-primary-muted);
    border-color: var(--border-accent);
    color: var(--text-primary);
  }

  .nsd-ws-initial {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-high);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: var(--weight-semibold);
    color: var(--text-accent);
    flex-shrink: 0;
    font-family: var(--font-mono-ui);
  }

  .nsd-workspace-tab.active .nsd-ws-initial {
    background: var(--accent-primary);
    color: var(--text-inverse);
  }

  .nsd-ws-name {
    flex: 1;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nsd-ws-danger {
    color: var(--semantic-warning);
    flex-shrink: 0;
  }

  /* Directory Panel */
  .nsd-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .nsd-panel-header {
    padding: 8px;
    border-bottom: 1px solid var(--border-default);
  }

  .nsd-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .nsd-search-icon {
    position: absolute;
    left: 10px;
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .nsd-search {
    width: 100%;
    height: 36px;
    padding: 0 32px 0 34px;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-search::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-search:focus {
    outline: none;
    border-color: var(--border-accent);
    background: var(--surface-base);
  }

  .nsd-search-clear {
    position: absolute;
    right: 6px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-search-clear:hover {
    background: var(--state-hover);
    color: var(--text-secondary);
  }

  .nsd-search-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nsd-search-row .nsd-search-wrapper {
    flex: 1;
  }

  .nsd-new-folder-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .nsd-new-folder-btn:hover {
    background: var(--state-hover);
    color: var(--text-accent);
    border-color: var(--border-strong);
  }

  .nsd-new-folder-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    animation: nsd-slideDown 0.15s ease;
  }

  .nsd-new-folder-input {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-accent);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-new-folder-input::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-new-folder-input:focus {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-primary-muted);
  }

  .nsd-new-folder-confirm,
  .nsd-new-folder-cancel {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .nsd-new-folder-confirm {
    color: var(--semantic-success);
  }

  .nsd-new-folder-confirm:hover {
    background: var(--semantic-success-muted);
    border-color: var(--semantic-success);
  }

  .nsd-new-folder-cancel {
    color: var(--text-tertiary);
  }

  .nsd-new-folder-cancel:hover {
    background: var(--state-hover);
    color: var(--text-secondary);
  }

  .nsd-dir-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .nsd-loading, .nsd-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
  }

  .nsd-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: nsd-spin 0.8s linear infinite;
  }

  @keyframes nsd-spin {
    to { transform: rotate(360deg); }
  }

  .nsd-dir-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast);
    text-align: left;
    font-family: var(--font-ui);
  }

  .nsd-dir-item:hover {
    background: var(--surface-float);
    border-color: var(--border-default);
  }

  .nsd-dir-item.selected {
    background: var(--accent-primary-muted);
    border-color: var(--border-accent);
  }

  .nsd-dir-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .nsd-dir-item.selected .nsd-dir-icon {
    color: var(--text-accent);
  }

  .nsd-dir-name {
    font-size: var(--text-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Provider Section */
  .nsd-provider-section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-default);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .nsd-provider-section .nsd-label {
    margin-bottom: 0;
    flex-shrink: 0;
  }

  .nsd-provider-select {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-provider-select:focus {
    outline: none;
    border-color: var(--border-accent);
    box-shadow: 0 0 0 3px var(--accent-primary-muted);
  }

  /* Simple Layout (no workspaces) */
  .nsd-simple {
    padding: 20px;
    border-bottom: 1px solid var(--border-default);
  }

  .nsd-label {
    display: block;
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--text-tertiary);
    margin-bottom: 8px;
    font-family: var(--font-ui);
  }

  .nsd-optional {
    font-weight: var(--weight-normal);
    text-transform: none;
    letter-spacing: normal;
    color: var(--text-tertiary);
    margin-left: 6px;
    opacity: 0.6;
  }

  .nsd-input-row {
    display: flex;
    gap: 8px;
  }

  .nsd-input {
    flex: 1;
    height: 40px;
    padding: 0 14px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-input::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-input:focus {
    outline: none;
    border-color: var(--border-accent);
    box-shadow: 0 0 0 3px var(--accent-primary-muted);
  }

  .nsd-browse {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-float);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-browse:hover {
    background: var(--surface-high);
    border-color: var(--border-accent);
    color: var(--text-accent);
  }

  /* Footer */
  .nsd-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface-raised);
    border-top: 1px solid var(--border-default);
  }

  .nsd-permission {
    flex-shrink: 0;
  }

  .nsd-perm-toggle {
    display: flex;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: 2px;
    cursor: pointer;
  }

  .nsd-perm-toggle.danger {
    border-color: rgba(247, 167, 74, 0.3);
  }

  .nsd-perm-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    color: var(--text-tertiary);
    transition: all var(--duration-fast);
    font-family: var(--font-ui);
  }

  .nsd-perm-option.active {
    background: var(--surface-high);
    color: var(--text-primary);
  }

  .nsd-perm-toggle.danger .nsd-perm-option.active {
    background: var(--semantic-warning-muted);
    color: var(--semantic-warning);
  }

  .nsd-advanced-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-advanced-toggle:hover {
    background: var(--state-hover);
    color: var(--text-secondary);
  }

  .nsd-advanced-toggle.open {
    color: var(--text-accent);
  }

  .nsd-advanced-toggle svg {
    transition: transform 0.2s;
  }

  .nsd-advanced-toggle.open svg {
    transform: rotate(180deg);
  }

  .nsd-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .nsd-btn {
    height: 34px;
    padding: 0 16px;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    font-family: var(--font-ui);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-btn-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
  }

  .nsd-btn-cancel:hover {
    background: var(--state-hover);
    border-color: var(--border-strong);
  }

  .nsd-btn-submit {
    background: var(--accent-primary);
    border: none;
    color: var(--text-inverse);
  }

  .nsd-btn-submit:hover {
    background: var(--accent-primary-dim);
  }

  .nsd-btn-submit.danger {
    background: var(--semantic-warning);
  }

  .nsd-btn-submit.danger:hover {
    opacity: 0.9;
  }

  .nsd-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Advanced Section */
  .nsd-advanced {
    padding: 16px 20px;
    background: var(--surface-raised);
    border-top: 1px solid var(--border-default);
    animation: nsd-slideDown 0.2s ease;
  }

  @keyframes nsd-slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Error */
  .nsd-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 16px 16px;
    padding: 10px 14px;
    background: var(--semantic-error-muted);
    border: 1px solid rgba(247, 103, 142, 0.3);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    color: var(--semantic-error);
    font-family: var(--font-ui);
  }

  /* Worktree Section */
  .nsd-worktree-section {
    border-bottom: 1px solid var(--border-default);
    padding: 12px 16px;
  }

  .nsd-worktree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  }

  .nsd-worktree-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nsd-checkbox {
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .nsd-checkbox.checked {
    background: var(--semantic-success);
    border-color: var(--semantic-success);
    color: var(--text-inverse);
  }

  .nsd-worktree-label {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
    font-family: var(--font-ui);
  }

  .nsd-worktree-hint {
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
  }

  .nsd-worktree-options {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-default);
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: nsd-slideDown 0.15s ease;
  }

  .nsd-wt-radio-group {
    display: flex;
    gap: 16px;
  }

  .nsd-wt-radio {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: color var(--duration-fast);
    font-family: var(--font-ui);
  }

  .nsd-wt-radio.active {
    color: var(--text-secondary);
  }

  .nsd-wt-radio input {
    accent-color: var(--semantic-success);
  }

  .nsd-wt-branch-select {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .nsd-wt-search {
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-wt-search:focus {
    outline: none;
    border-color: var(--semantic-success);
  }

  .nsd-wt-search::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-wt-branch-list {
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--surface-base);
  }

  .nsd-wt-branch-item {
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
  }

  .nsd-wt-branch-item:hover {
    background: var(--surface-float);
  }

  .nsd-wt-branch-item.selected {
    background: var(--semantic-success-muted);
    color: var(--semantic-success);
  }

  .nsd-wt-no-branches {
    padding: 12px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
  }

  .nsd-wt-new-branch {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nsd-wt-input {
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-wt-input:focus {
    outline: none;
    border-color: var(--semantic-success);
  }

  .nsd-wt-input::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-wt-base-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
  }

  .nsd-wt-base-select {
    flex: 1;
    height: 28px;
    padding: 0 8px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    font-family: var(--font-ui);
  }

  .nsd-wt-path-preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nsd-wt-path-label {
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    font-family: var(--font-ui);
  }

  .nsd-wt-path-value {
    padding: 6px 10px;
    background: var(--surface-float);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    word-break: break-all;
    font-family: var(--font-mono-ui);
  }

  .nsd-wt-error {
    font-size: var(--text-2xs);
    color: var(--semantic-error);
    padding: 6px 10px;
    background: var(--semantic-error-muted);
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
  }

  .nsd-wt-branch-list::-webkit-scrollbar {
    width: 4px;
  }

  .nsd-wt-branch-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .nsd-wt-branch-list::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 2px;
  }

  /* Scrollbar styling */
  .nsd-workspace-list::-webkit-scrollbar,
  .nsd-dir-list::-webkit-scrollbar {
    width: 6px;
  }

  .nsd-workspace-list::-webkit-scrollbar-track,
  .nsd-dir-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .nsd-workspace-list::-webkit-scrollbar-thumb,
  .nsd-dir-list::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 3px;
  }

  .nsd-workspace-list::-webkit-scrollbar-thumb:hover,
  .nsd-dir-list::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong);
  }
\`;
`;

content = content.slice(0, stylesStart) + newStyles + content.slice(stylesEnd);
fs.writeFileSync(path, content, 'utf8');
console.log('Done. Replaced CSS section. New file length:', content.length);
