// @atlas-entrypoint: Phase 4 icon set — ported from prototype
// Single-source icons used throughout the new shell. SVG strokes, currentColor.
import React from 'react';

export type P4IconName =
  | 'terminal' | 'tasks' | 'git' | 'history' | 'snapshot' | 'teams'
  | 'playbook' | 'tunnel' | 'settings' | 'plus' | 'x'
  | 'chev_down' | 'chev_right' | 'chev_up'
  | 'search' | 'branch' | 'folder' | 'bolt' | 'layers'
  | 'focus' | 'split' | 'grid' | 'expand' | 'cmd'
  | 'check' | 'sparkle' | 'arrow_right' | 'play' | 'pause'
  | 'flame' | 'dollar' | 'cpu' | 'user' | 'file' | 'blank';

interface P4IconProps {
  name: P4IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<P4IconName, React.ReactNode> = {
  terminal:    <><polyline points="4 8 8 12 4 16"/><line x1="11" y1="16" x2="18" y2="16"/></>,
  tasks:       <><rect x="4" y="4" width="16" height="16" rx="2"/><polyline points="8 11 11 14 16 9"/></>,
  git:         <><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 8v8M6 14a4 4 0 0 0 4 4h4"/></>,
  history:     <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
  snapshot:    <><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M9 6V4h6v2"/></>,
  teams:       <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="11" r="2"/><path d="M3 19a6 6 0 0 1 12 0M14 19a4 4 0 0 1 7 0"/></>,
  playbook:    <><path d="M4 4h10a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 8h6M8 12h6"/></>,
  tunnel:      <><path d="M3 12a9 9 0 0 1 18 0v8H3z"/><line x1="9" y1="20" x2="9" y2="12"/><line x1="15" y1="20" x2="15" y2="12"/></>,
  settings:    <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.08-1l2-1.5-2-3.5-2.4.9a7 7 0 0 0-1.8-1L14 3h-4l-.7 2.4a7 7 0 0 0-1.8 1L5 5.5l-2 3.5L5 10.5A7 7 0 0 0 5 13l-2 1.5 2 3.5 2.4-.9a7 7 0 0 0 1.8 1L10 21h4l.7-2.4a7 7 0 0 0 1.8-1l2.4.9 2-3.5L19 13z"/></>,
  plus:        <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  x:           <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>,
  chev_down:   <polyline points="6 9 12 15 18 9"/>,
  chev_right:  <polyline points="9 6 15 12 9 18"/>,
  chev_up:     <polyline points="6 15 12 9 18 15"/>,
  search:      <><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></>,
  branch:      <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v2a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8"/><line x1="12" y1="14" x2="12" y2="16"/></>,
  folder:      <path d="M4 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>,
  bolt:        <polygon points="13 2 4 14 11 14 10 22 20 10 13 10"/>,
  layers:      <><polygon points="12 2 22 8 12 14 2 8"/><polyline points="2 14 12 20 22 14"/></>,
  focus:       <><rect x="6" y="6" width="12" height="12" rx="2"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/></>,
  split:       <><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></>,
  grid:        <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  expand:      <><polyline points="4 9 4 4 9 4"/><polyline points="20 9 20 4 15 4"/><polyline points="4 15 4 20 9 20"/><polyline points="20 15 20 20 15 20"/></>,
  cmd:         <><path d="M9 3a3 3 0 1 1-3 3v0M15 3a3 3 0 1 0 3 3v0M9 21a3 3 0 1 1-3-3v0M15 21a3 3 0 1 0 3-3v0"/><rect x="6" y="6" width="12" height="12" rx="0"/></>,
  check:       <polyline points="20 6 9 17 4 12"/>,
  sparkle:     <><path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.5 2.5M14.5 14.5L17 17M7 17l2.5-2.5M14.5 9.5L17 7"/></>,
  arrow_right: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></>,
  play:        <polygon points="6 4 20 12 6 20"/>,
  pause:       <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
  flame:       <path d="M12 3c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-5 3-7 1 1 2 2 2 5 1-2 2-3 1-8z"/>,
  dollar:      <><line x1="12" y1="3" x2="12" y2="21"/><path d="M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7"/></>,
  cpu:         <><rect x="6" y="6" width="12" height="12" rx="1"/><rect x="9" y="9" width="6" height="6"/></>,
  user:        <><circle cx="12" cy="9" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></>,
  file:        <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></>,
  blank:       <></>,
};

export function P4Icon({ name, size = 16, stroke = 1.75, className = '', style }: P4IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths[name] || null}
    </svg>
  );
}
