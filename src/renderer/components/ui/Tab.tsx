import { useState, useRef, useEffect } from 'react';

export interface TabData {
  id: string;
  name: string;
  workingDirectory: string;
  permissionMode: 'standard' | 'skip-permissions';
  status: 'running' | 'exited' | 'error';
  worktreeBranch?: string | null;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface TabProps {
  data: TabData;
  isActive: boolean;
  isEditing: boolean;
  index: number;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (position: ContextMenuPosition) => void;
  onRename: (name: string) => void;
  onCancelEdit: () => void;
  visibilityState?: 'focused' | 'visible' | 'hidden';
  checkpointCount?: number;
}

export function Tab({
  data,
  isActive,
  isEditing,
  index,
  onSelect,
  onClose,
  onContextMenu,
  onRename,
  onCancelEdit,
  visibilityState = 'hidden',
  checkpointCount = 0,
}: TabProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editValue, setEditValue] = useState(data.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(data.name);
  }, [data.name]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onRename(editValue.trim() || data.name);
    } else if (e.key === 'Escape') {
      setEditValue(data.name);
      onCancelEdit();
    }
  };

  const handleBlur = () => {
    onRename(editValue.trim() || data.name);
  };

  const handleDragStart = (e: React.DragEvent) => {
    // Don't allow dragging while editing
    if (isEditing) {
      e.preventDefault();
      return;
    }

    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('sessionId', data.id);

    // Create a custom drag preview (clone of the tab)
    const dragPreview = e.currentTarget.cloneNode(true) as HTMLElement;
    dragPreview.style.opacity = '0.8';
    dragPreview.style.transform = 'rotate(-2deg)';
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);

    // Remove the preview element after a short delay
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const isExited = data.status === 'exited';
  const isError = data.status === 'error';
  const isDangerous = data.permissionMode === 'skip-permissions';
  const showClose = isActive || isHovered;
  const shortcutKey = index < 9 ? index + 1 : null;

  return (
    <div
      className={`tab ${isActive ? 'active' : ''} ${isExited ? 'exited' : ''} ${isError ? 'error' : ''} ${isDangerous ? 'dangerous' : ''} ${isDragging ? 'dragging' : ''}`}
      draggable={!isEditing}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`${data.name}\n${data.workingDirectory}${checkpointCount > 0 ? `\n📌 ${checkpointCount} checkpoint${checkpointCount > 1 ? 's' : ''}` : ''}${isDangerous ? '\n⚠ Skip permissions enabled' : ''}`}
    >
      {/* Active indicator line */}
      {isActive && <div className="active-indicator" />}

      {/* Permission indicator */}
      <div className={`permission-icon ${isDangerous ? 'dangerous' : ''}`}>
        {isDangerous ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Visibility indicator */}
      {visibilityState !== 'hidden' && (
        <div className={`visibility-indicator ${visibilityState}`} title={
          visibilityState === 'focused' ? 'In focused pane' : 'Visible in other pane'
        }>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4" />
          </svg>
        </div>
      )}

      {/* Checkpoint badge */}
      {checkpointCount > 0 && (
        <div className="checkpoint-badge" title={`${checkpointCount} checkpoint${checkpointCount > 1 ? 's' : ''}`}>
          <span className="checkpoint-icon">📌</span>
          {checkpointCount > 1 && <span className="checkpoint-count">{checkpointCount}</span>}
        </div>
      )}

      {/* Worktree branch badge */}
      {data.worktreeBranch && (
        <div className="worktree-badge" title={`Worktree: ${data.worktreeBranch}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span className="worktree-branch-name">{data.worktreeBranch}</span>
        </div>
      )}

      {/* Exited dot indicator */}
      {isExited && <div className="exited-dot" />}

      {/* Tab name */}
      {isEditing ? (
        <input
          ref={inputRef}
          className="tab-name-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
          maxLength={50}
        />
      ) : (
        <span className="tab-name">{data.name}</span>
      )}

      {/* Keyboard shortcut hint */}
      {shortcutKey && !isEditing && (
        <span className={`shortcut-hint ${isActive || isHovered ? 'visible' : ''}`}>
          ^{shortcutKey}
        </span>
      )}

      {/* Close button */}
      <button
        className={`close-btn ${showClose ? 'visible' : ''}`}
        onClick={handleCloseClick}
        aria-label={`Close ${data.name}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
        </svg>
      </button>

      <style>{`
        .tab {
          position: relative;
          height: 36px;
          min-width: 120px;
          max-width: 200px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px 0 12px;
          background: transparent;
          border-radius: 8px 8px 0 0;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: 'JetBrains Mono', monospace;
        }

        .tab[draggable="true"] {
          cursor: grab;
        }

        .tab.dragging {
          opacity: 0.5;
          cursor: grabbing;
        }

        .tab:hover {
          background: #1a1b26;
        }

        .tab.active {
          background: #1a1b26;
        }

        .tab.exited {
          opacity: 0.5;
        }

        .tab.exited .tab-name {
          font-style: italic;
        }

        .active-indicator {
          position: absolute;
          bottom: 0;
          left: 8px;
          right: 8px;
          height: 2px;
          background: linear-gradient(90deg, #7aa2f7, #7dcfff);
          border-radius: 2px 2px 0 0;
        }

        .tab.dangerous.active .active-indicator {
          background: linear-gradient(90deg, #e0af68, #ff9e64);
          animation: danger-pulse 2s ease-in-out infinite;
        }

        .worktree-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          color: #9ece6a;
          font-size: 10px;
          max-width: 80px;
        }

        .worktree-branch-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 500;
        }

        @keyframes danger-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .permission-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #3b4261;
          flex-shrink: 0;
          transition: color 0.15s ease;
        }

        .tab:hover .permission-icon,
        .tab.active .permission-icon {
          color: #565f89;
        }

        .permission-icon.dangerous {
          color: #e0af68;
        }

        .tab.active .permission-icon.dangerous {
          color: #e0af68;
          animation: icon-pulse 2s ease-in-out infinite;
        }

        @keyframes icon-pulse {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 0 transparent); }
          50% { opacity: 0.8; filter: drop-shadow(0 0 4px rgba(224, 175, 104, 0.3)); }
        }

        .visibility-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .visibility-indicator svg circle {
          stroke: none;
        }

        .visibility-indicator.focused svg circle {
          fill: #7aa2f7;
        }

        .visibility-indicator.visible svg circle {
          fill: none;
          stroke: #7aa2f7;
          stroke-width: 1.5;
        }

        .checkpoint-badge {
          display: flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
          font-size: 10px;
        }

        .checkpoint-icon {
          font-size: 11px;
          line-height: 1;
          opacity: 0.7;
          transition: opacity 0.15s ease;
        }

        .tab:hover .checkpoint-icon,
        .tab.active .checkpoint-icon {
          opacity: 1;
        }

        .checkpoint-count {
          color: #7aa2f7;
          font-weight: 600;
          font-size: 10px;
          line-height: 1;
        }

        .exited-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #f7768e;
          flex-shrink: 0;
          animation: dot-fade 1.5s ease-in-out infinite;
        }

        @keyframes dot-fade {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .tab-name {
          flex: 1;
          font-size: 12px;
          color: #565f89;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s ease;
        }

        .tab:hover .tab-name,
        .tab.active .tab-name {
          color: #a9b1d6;
        }

        .tab-name-input {
          flex: 1;
          min-width: 0;
          font-size: 12px;
          font-family: inherit;
          color: #c0caf5;
          background: #16161e;
          border: 1px solid #7aa2f7;
          border-radius: 4px;
          padding: 2px 6px;
          outline: none;
        }

        .shortcut-hint {
          font-size: 10px;
          color: #3b4261;
          opacity: 0;
          transition: opacity 0.15s ease;
          flex-shrink: 0;
        }

        .shortcut-hint.visible {
          opacity: 1;
        }

        .close-btn {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #565f89;
          cursor: pointer;
          opacity: 0;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }

        .close-btn.visible {
          opacity: 1;
        }

        .close-btn:hover {
          background: rgba(247, 118, 142, 0.15);
          color: #f7768e;
        }

        .close-btn:active {
          transform: scale(0.9);
        }
      `}</style>
    </div>
  );
}
