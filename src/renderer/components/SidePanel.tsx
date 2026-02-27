/**
 * SidePanel — Generic wrapper for all right-side feature panels.
 *
 * Spec §5.2: 280px default, resizable 200–480px via drag handle.
 * At ≤900px window width: renders as overlay drawer with backdrop.
 * Animated entrance: translateX slide from right.
 * Only one panel open at a time (managed by ActivityBar state).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Optional extra element in the header (e.g. action buttons) */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  /** Initial width in px. Default: 280 */
  defaultWidth?: number;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 280;
const COMPACT_BREAKPOINT = 900;

export function SidePanel({
  isOpen,
  onClose,
  title,
  headerActions,
  children,
  defaultWidth = DEFAULT_WIDTH,
}: SidePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isCompact, setIsCompact] = useState(window.innerWidth <= COMPACT_BREAKPOINT);
  const [isVisible, setIsVisible] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle responsive breakpoint
  useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth <= COMPACT_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      // Tiny delay to allow mount before animation
      const t = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Escape key closes the panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Resize handle drag
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging LEFT increases width (panel is on right side)
      const delta = dragStartX.current - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — shown on compact/overlay mode only */}
      {isCompact && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: isVisible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
            zIndex: 'var(--z-overlay)' as any,
            transition: 'background var(--duration-normal) var(--ease-out)',
          }}
        />
      )}

      {/* Resize handle (left edge of panel) */}
      {!isCompact && (
        <div
          onMouseDown={handleDragStart}
          style={{
            position: 'fixed',
            top: 'calc(var(--title-bar-height) + var(--tab-bar-height))',
            bottom: 'var(--status-bar-height)',
            right: width,
            width: 'var(--resize-handle-hitbox)',
            zIndex: 'calc(var(--z-panel) + 1)' as any,
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              width: 'var(--resize-handle-width)',
              marginLeft: 'calc((var(--resize-handle-hitbox) - var(--resize-handle-width)) / 2)',
              background: 'var(--border-default)',
              transition: 'background var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--border-default)';
            }}
          />
        </div>
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: isCompact ? 0 : 'calc(var(--title-bar-height) + var(--tab-bar-height))',
          right: 0,
          bottom: isCompact ? 0 : 'var(--status-bar-height)',
          width: isCompact ? `min(${MAX_WIDTH}px, 92vw)` : `${width}px`,
          background: 'var(--surface-overlay)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: isCompact ? 'var(--z-overlay)' : 'var(--z-panel)' as any,
          display: 'flex',
          flexDirection: 'column',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform var(--duration-normal) var(--ease-out)',
          overflow: 'hidden',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-3)',
            background: 'var(--surface-raised)',
            borderBottom: '1px solid var(--border-default)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
              letterSpacing: 'var(--tracking-normal)',
            }}
          >
            {title}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close panel"
              style={{
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: 0,
                transition: 'color var(--duration-fast), background var(--duration-fast)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--state-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border-strong) transparent',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
