// Phase 4 shell — public exports.
export { P4Icon, type P4IconName } from './P4Icon';
export {
  colorBg, colorFg, initials, agentLetter, agentColor,
  STATUS_META, colorFromString, formatLastActive, resolveSessionWorktree,
  type RepoColor, type SessionStatus, type StatusMeta, type WorktreeRequest,
} from './shell-utils';

export { RepoActivityBar, isPathPrefix } from './RepoActivityBar';
export {
  SessionRail, sessionsForRepo, liveCount, mapTabStatus, ACTIVE_STATUSES,
} from './SessionRail';
export { SessionPane } from './SessionPane';
export { SessionTile } from './SessionTile';
export { MainView, type ViewMode } from './MainView';
export { RepoSwitcher } from './RepoSwitcher';
export { AddRepoSheet } from './AddRepoSheet';
export { NewSessionSheet, type NewSessionForm } from './NewSessionSheet';
export { Palette, type PaletteAction } from './Palette';
export { RightInspector } from './RightInspector';
export { TitleBar } from './TitleBar';
export { StatusBar } from './StatusBar';
