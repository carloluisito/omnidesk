/**
 * Tab — individual session tab in the tab bar.
 *
 * Layout: ProviderBadge + session name + StatusDot + close-on-hover
 * Active tab: surface-raised bg, top accent border (1px border-accent)
 * Inactive tab: transparent bg, tertiary text
 */
import { useState, useRef, useEffect } from 'react';
import type { ProviderId } from '../../../shared/types/provider-types';
import { ProviderBadge } from './ProviderBadge';
import { StatusDot, StatusDotState } from './StatusDot';
import { ShareIndicator } from './ShareIndicator';

export interface TabData {
  id:               string;
  name:             string;
  workingDirectory: string;
  permissionMode:   'standard' | 'skip-permissions';
  status:           'running' | 'exited' | 'error';
  worktreeBranch?:  string | null;
  providerId?:      ProviderId;
  // Sharing
  isShared?:        boolean;
  isObserverTab?:   boolean;
  observerCount?:   number;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface TabProps {
  data:            TabData;
  isActive:        boolean;
  isEditing:       boolean;
  index:           number;
  onSelect:        () => void;
  onClose:         () => void;
  onContextMenu:   (position: ContextMenuPosition) => void;
  onRename:        (name: string) => void;
  onCancelEdit:    () => void;
  visibilityState?: 'focused' | 'visible' | 'hidden';
  checkpointCount?: number;
}

function statusToState(status: TabData['status']): StatusDotState {
  if (status === 'running') return 'running';
  if (status === 'error')   return 'error';
  return 'idle';
}

export function Tab({
  data,
  isActive,
  isEditing,
  index: _index,  // used for keyboard shortcut display — kept for future
  onSelect,
  onClose,
  onContextMenu,
  onRename,
  onCancelEdit,
  visibilityState = 'hidden',
  checkpointCount = 0,
}: TabProps) {
  const [isHovered, setIsHovered]   = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editValue, setEditValue]   = useState(data.name);
  const inputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => { setEditValue(data.name); }, [data.name]);

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
    if (isEditing) { e.preventDefault(); return; }
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('sessionId', data.id);
    const preview = e.currentTarget.cloneNode(true) as HTMLElement;
    preview.style.opacity = '0.8';
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => { if (preview.parentNode) document.body.removeChild(preview); }, 0);
  };

  const handleDragEnd = () => setIsDragging(false);

  const isExited      = data.status === 'exited';
  const isDangerous   = data.permissionMode === 'skip-permissions';
  const showClose     = isActive || isHovered;
  const dotState      = statusToState(data.status);
  const isShared      = data.isShared ?? false;
  const isObserver    = data.isObserverTab ?? false;
  const observerCount = data.observerCount ?? 0;

  // Styles
  const tabBg       = isActive ? 'var(--surface-raised)' : 'transparent';
  const textColor   = isActive ? 'var(--text-primary)'   : (isHovered ? 'var(--text-secondary)' : 'var(--text-tertiary)');
  // Observer tabs use blue top border; shared host tabs use green; default uses accent
  const topBorder   = isActive
    ? isObserver
      ? '1px solid #7aa2f7'
      : '1px solid var(--border-accent)'
    : '1px solid transparent';

  return (
    <div
      role="tab"
      aria-selected={isActive}
      aria-controls={`pane-${data.id}`}
      id={`tab-${data.id}`}
      draggable={!isEditing}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`${data.name}\n${data.workingDirectory}${checkpointCount > 0 ? `\n${checkpointCount} checkpoint${checkpointCount !== 1 ? 's' : ''}` : ''}${isDangerous ? '\nSkip permissions enabled' : ''}`}
      style={{
        position:      'relative',
        height:        '28px',
        minWidth:      '120px',
        maxWidth:      '200px',
        display:       'flex',
        alignItems:    'center',
        gap:           'var(--space-1)',
        padding:       '0 var(--space-2) 0 var(--space-2)',
        background:    tabBg,
        borderTop:     topBorder,
        borderLeft:    '1px solid transparent',
        borderRight:   '1px solid transparent',
        borderBottom:  'none',
        borderRadius:  'var(--radius-sm) var(--radius-sm) 0 0',
        cursor:        isDragging ? 'grabbing' : 'pointer',
        opacity:       isExited ? 0.6 : 1,
        transition:    'background-color var(--duration-fast) var(--ease-inout), border-color var(--duration-fast) var(--ease-inout)',
        userSelect:    'none',
        fontFamily:    'var(--font-ui)',
        marginTop:     '5px',
      }}
    >
      {/* Observer tab: chain-link icon instead of provider badge */}
      {isObserver ? (
        <svg
          width="11"
          height="11"
          viewBox="0 0 15 15"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, color: isActive ? '#7aa2f7' : 'var(--text-tertiary)' }}
        >
          <path d="M6.5 10.5l-2 2a2.828 2.828 0 01-4-4l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8.5 4.5l2-2a2.828 2.828 0 014 4l-2 2"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="5.5" y1="9.5" x2="9.5" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        /* Provider badge — positioned relative so ShareIndicator can overlay */
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ProviderBadge
            providerId={data.providerId}
            size="sm"
            muted={!isActive && !isHovered}
          />
          {isShared && (
            <div style={{
              position:  'absolute',
              top:       '-5px',
              right:     '-5px',
              zIndex:    1,
            }}>
              <ShareIndicator count={observerCount} />
            </div>
          )}
        </div>
      )}

      {/* Tab name */}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
          maxLength={50}
          style={{
            flex:            1,
            minWidth:        0,
            fontSize:        'var(--text-xs)',
            fontFamily:      'var(--font-ui)',
            color:           'var(--text-primary)',
            backgroundColor: 'var(--surface-float)',
            border:          '1px solid var(--border-accent)',
            borderRadius:    'var(--radius-sm)',
            padding:         '2px 4px',
            outline:         'none',
          }}
        />
      ) : (
        <span
          style={{
            flex:          1,
            minWidth:      0,
            fontSize:      'var(--text-xs)',
            fontWeight:    isActive ? 'var(--weight-medium)' as any : 'var(--weight-regular)' as any,
            color:         textColor,
            whiteSpace:    'nowrap',
            overflow:      'hidden',
            textOverflow:  'ellipsis',
            transition:    'color var(--duration-fast) var(--ease-inout)',
            fontStyle:     isExited ? 'italic' : 'normal',
          }}
        >
          {isObserver && (
            <span style={{ color: '#7aa2f7', marginRight: '3px', fontWeight: 600 as any }}>[SHARED]</span>
          )}
          {data.name}
        </span>
      )}

      {/* Session status dot */}
      {!isEditing && (
        <StatusDot status={dotState} size={6} />
      )}

      {/* Split visibility indicator (when in split view) */}
      {visibilityState !== 'hidden' && !isEditing && (
        <span
          aria-hidden="true"
          title={visibilityState === 'focused' ? 'In focused pane' : 'Visible in other pane'}
          style={{
            width:           '6px',
            height:          '6px',
            borderRadius:    'var(--radius-full)',
            backgroundColor: visibilityState === 'focused' ? 'var(--accent-secondary)' : 'transparent',
            border:          visibilityState === 'visible'  ? '1px solid var(--accent-secondary)' : 'none',
            flexShrink:      0,
          }}
        />
      )}

      {/* Danger indicator */}
      {isDangerous && !isEditing && (
        <span
          aria-label="Skip permissions enabled"
          title="Skip permissions enabled"
          style={{
            width:           '6px',
            height:          '6px',
            borderRadius:    'var(--radius-full)',
            backgroundColor: 'var(--semantic-warning)',
            flexShrink:      0,
          }}
        />
      )}

      {/* Close button — visible on hover/active */}
      <button
        className={`tab-close-btn ${showClose ? 'tab-close-visible' : ''}`}
        onClick={handleCloseClick}
        aria-label={`Close ${data.name}`}
        tabIndex={showClose ? 0 : -1}
        style={{
          width:           '16px',
          height:          '16px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          background:      'transparent',
          border:          'none',
          borderRadius:    'var(--radius-sm)',
          cursor:          'pointer',
          color:           'var(--text-tertiary)',
          opacity:         showClose ? 1 : 0,
          transition:      'opacity var(--duration-fast) var(--ease-inout), color var(--duration-fast) var(--ease-inout)',
          flexShrink:      0,
          padding:         0,
          outline:         'none',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--semantic-error)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" strokeLinecap="round" />
        </svg>
      </button>

      <style>{`
        .tab-close-btn:focus-visible {
          outline: 2px solid var(--state-focus);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
