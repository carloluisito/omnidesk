# ClaudeDesk — Repository Index

114 source files | ~30,200 LOC | 12 domains | 102 IPC methods | 233 tests (v4.4.1)

## Entrypoints

| File | Role |
|------|------|
| `src/main/index.ts` (262 lines) | Main process — creates window, initializes all 8 managers, wires IPC |
| `src/renderer/App.tsx` (880 lines) | Root React component — composes all hooks, panels, and dialogs |
| `src/shared/ipc-contract.ts` (~550 lines) | IPC single source of truth — 102 methods, auto-derives preload bridge and types |

## IPC Infrastructure (cross-cutting)

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/shared/ipc-contract.ts` | Shared | Contract map: channel names, arg types, return types | 528 |
| `src/shared/ipc-types.ts` | Shared | All IPC payload/response types | 355 |
| `src/main/ipc-handlers.ts` | Main | Handler implementations for all 102 methods | ~450 |
| `src/main/ipc-registry.ts` | Main | Typed `handle()` / `on()` wrappers for `ipcMain` | 72 |
| `src/main/ipc-emitter.ts` | Main | Typed `emit()` wrapper for `webContents.send()` | 28 |
| `src/preload/index.ts` | Preload | Auto-derived context bridge from contract | 54 |

## Sessions

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/session-manager.ts` | Main | Session CRUD, lifecycle, team metadata, model change events | 440 |
| `src/main/cli-manager.ts` | Main | PTY spawning, output buffering, model detection | 253 |
| `src/shared/model-detector.ts` | Shared | Parse terminal output to detect model switches | 80 |
| `src/main/session-pool.ts` | Main | Pre-warmed shell pool for fast session creation | 277 |
| `src/main/session-persistence.ts` | Main | Session state save/load (JSON) | 93 |
| `src/renderer/hooks/useSessionManager.ts` | Renderer | Session CRUD hook, IPC event listeners | 199 |
| `src/renderer/components/Terminal.tsx` | Renderer | xterm.js wrapper, Ctrl+C intercept, Claude readiness | 677 |

## Split View

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/settings-persistence.ts` | Main | Split view state persistence (also workspaces, pool, atlas) | 422 |
| `src/renderer/hooks/useSplitView.ts` | Renderer | Tree-based layout state, split/close/assign/focus | 464 |
| `src/renderer/utils/layout-tree.ts` | Renderer | Pure tree functions extracted from useSplitView (countPanes, traverseTree, etc.) | 175 |
| `src/renderer/components/SplitLayout.tsx` | Renderer | Recursive tree renderer with drag-to-resize | 215 |
| `src/renderer/components/PaneHeader.tsx` | Renderer | Per-pane header with session picker and split controls | 251 |
| `src/renderer/components/PaneSessionPicker.tsx` | Renderer | Session assignment UI for empty panes | 206 |

## Agent Teams

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/agent-team-manager.ts` | Main | fs.watch() monitoring, session linking, team lifecycle | 512 |
| `src/shared/message-parser.ts` | Shared | Regex-based inter-agent message extraction | 119 |
| `src/renderer/hooks/useAgentTeams.ts` | Renderer | Team state + IPC event listeners | 103 |
| `src/renderer/hooks/useAutoTeamLayout.ts` | Renderer | Auto-split when teammates detected | 56 |
| `src/renderer/hooks/useMessageStream.ts` | Renderer | Debounced message parsing from terminal output | 57 |
| `src/renderer/components/TeamPanel.tsx` | Renderer | Team overview, member list, view switching | 540 |
| `src/renderer/components/TaskBoard.tsx` | Renderer | Kanban task board (pending/in-progress/completed) | 310 |
| `src/renderer/components/MessageStream.tsx` | Renderer | Inter-agent message timeline | 265 |
| `src/renderer/components/AgentGraph.tsx` | Renderer | reactflow node graph of agent communication | 253 |

## Templates (Command Palette)

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/prompt-templates-manager.ts` | Main | Template CRUD, built-in + user templates | 211 |
| `src/main/built-in-actions.ts` | Main | Default prompt templates shipped with app | 158 |
| `src/shared/types/prompt-templates.ts` | Shared | Template type definitions | 60 |
| `src/renderer/hooks/useCommandPalette.ts` | Renderer | Fuzzy search, selection, keyboard nav | 146 |
| `src/renderer/components/CommandPalette.tsx` | Renderer | Searchable template picker overlay | 465 |
| `src/renderer/components/TemplateEditor.tsx` | Renderer | Template create/edit form | 805 |

## History

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/history-manager.ts` | Main | Session history capture, search, export, cleanup | 801 |
| `src/shared/types/history-types.ts` | Shared | History entry and search result types | 106 |
| `src/renderer/hooks/useHistory.ts` | Renderer | History list, search, export, delete | 190 |
| `src/renderer/components/HistoryPanel.tsx` | Renderer | History browser with search and export | 681 |
| `src/renderer/components/HistoryPanel.css` | Renderer | History panel styles | 536 |

## Checkpoints

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/checkpoint-manager.ts` | Main | Checkpoint CRUD, export (JSON/Markdown) | 356 |
| `src/main/checkpoint-persistence.ts` | Main | Checkpoint file storage | 158 |
| `src/shared/types/checkpoint-types.ts` | Shared | Checkpoint and export format types | 86 |
| `src/renderer/hooks/useCheckpoints.ts` | Renderer | Checkpoint state + real-time events | 267 |
| `src/renderer/components/CheckpointPanel.tsx` | Renderer | Checkpoint list with filter/export | 374 |
| `src/renderer/components/ui/CheckpointDialog.tsx` | UI | Create checkpoint form | 273 |

## Quota / Budget

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/quota-service.ts` | Main | Anthropic API quota fetching, burn rate calculation | 388 |
| `src/renderer/hooks/useQuota.ts` | Renderer | Quota + burn rate polling | 84 |
| `src/renderer/components/ui/BudgetPanel.tsx` | UI | Quota visualization panel | 1087 |
| `src/renderer/components/ui/BudgetSettings.tsx` | UI | Budget configuration | 1181 |
| `src/renderer/components/ui/FuelStatusIndicator.tsx` | UI | Always-visible fuel gauge in TabBar | 200 |
| `src/renderer/components/ui/FuelGaugeBar.tsx` | UI | 5-segment horizontal gauge visualization | 60 |
| `src/renderer/components/ui/FuelTooltip.tsx` | UI | Hover tooltip with quota breakdown | 150 |

## Drag-Drop

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/file-dragdrop-handler.ts` | Main | File info resolution, content reading | 164 |
| `src/main/file-utils.ts` | Main | File type detection, size formatting | 190 |
| `src/renderer/hooks/useDragDrop.ts` | Renderer | Drag events, file processing | 134 |
| `src/renderer/components/DragDropOverlay.tsx` | Renderer | Visual overlay during drag | 202 |
| `src/renderer/components/DragDropContextMenu.tsx` | Renderer | Action picker for dropped files | 233 |
| `src/renderer/components/DragDropSettings.tsx` | Renderer | Drag-drop configuration | 401 |

## Window & UI Shell

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/renderer/components/ui/TabBar.tsx` | UI | Session tabs, toolbar buttons | 705 |
| `src/renderer/components/ui/Tab.tsx` | UI | Individual tab with close/rename | 438 |
| `src/renderer/components/ui/ModelBadge.tsx` | UI | Dynamic badge showing current model | 70 |
| `src/renderer/components/ui/ModelSwitcher.tsx` | UI | Dropdown for mid-session model switching | 167 |
| `src/renderer/components/ui/ConfirmDialog.tsx` | UI | Reusable confirmation modal | 219 |
| `src/renderer/components/ui/ContextMenu.tsx` | UI | Right-click context menu | 205 |
| `src/renderer/components/ui/EmptyState.tsx` | UI | No-sessions welcome screen | 116 |
| `src/renderer/components/ui/NewSessionDialog.tsx` | UI | New session form with workspace picker | 921 |
| `src/renderer/components/ui/SettingsDialog.tsx` | UI | Settings (workspaces, pool, templates, general, atlas) | 1916 |
| `src/renderer/components/ui/BrandLogo.tsx` | UI | App logo SVG | 29 |
| `src/renderer/components/ui/index.ts` | UI | Barrel export | — |
| `src/renderer/components/AboutDialog.tsx` | Renderer | Version info and credits | 322 |
| `src/renderer/components/TitleBarBranding.tsx` | Renderer | Title bar logo + name | 124 |

## Atlas

IPC: `atlas:*`

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/atlas-manager.ts` | Main | Scan engine: file enumeration, import analysis, domain inference, content generation | 917 |
| `src/renderer/hooks/useAtlas.ts` | Renderer | Atlas state management and IPC calls | 126 |
| `src/renderer/components/AtlasPanel.tsx` | Renderer | Atlas UI: status, scanning, preview, approve | 338 |
| `src/renderer/components/AtlasPanel.css` | Renderer | Atlas panel styles | 473 |
| `src/shared/types/atlas-types.ts` | Shared | Atlas type definitions | 148 |

## Git Integration

IPC: `git:*` (21 methods — 19 invoke + 2 events)

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/main/git-manager.ts` | Main | Git command execution, status parsing, AI commit messages, file watching | ~580 |
| `src/shared/types/git-types.ts` | Shared | Git type definitions (status, branches, commits, diffs, operations) | ~120 |
| `src/renderer/hooks/useGit.ts` | Renderer | Git state management and IPC calls | ~395 |
| `src/renderer/components/GitPanel.tsx` | Renderer | Git panel: branch bar, file staging, inline diff, commit history | ~1000 |
| `src/renderer/components/ui/CommitDialog.tsx` | UI | Commit message editor with AI generation | ~465 |

## Shared Utilities

| File | Layer | Role | Lines |
|------|-------|------|-------|
| `src/shared/claude-detector.ts` | Shared | Detect Claude CLI readiness patterns | 42 |
| `src/main/ansi-strip.ts` | Main | Strip ANSI escape codes from terminal output | 25 |
| `src/renderer/utils/variable-resolver.ts` | Renderer | Template variable resolution (`{{clipboard}}`, etc.) | 111 |
| `src/renderer/utils/fuzzy-search.ts` | Renderer | Fuzzy string matching for command palette | 184 |
| `src/renderer/utils/toast.ts` | Renderer | Toast notification utility | 83 |
| `src/renderer/styles/globals.css` | Renderer | Global styles and Tailwind imports | 244 |
| `src/renderer/main.tsx` | Renderer | React DOM entry point | 10 |
| `src/renderer/hooks/index.ts` | Renderer | Hooks barrel export | 3 |

## Testing Infrastructure (v4.4.1)

233 tests | 18 test files | Vitest 4 + @testing-library/react + Playwright

### Config & Setup

| File | Role | Lines |
|------|------|-------|
| `vitest.workspace.ts` | 3 workspace projects (shared/main/renderer) | ~35 |
| `playwright.config.ts` | Playwright config for Electron E2E | ~15 |
| `test/setup-main.ts` | Electron + node-pty mocks for main process tests | ~60 |
| `test/setup-renderer.ts` | jest-dom + electronAPI reset for renderer tests | ~5 |
| `test/helpers/electron-api-mock.ts` | Auto-derived electronAPI mock from IPC contract | ~60 |

### Unit Tests (Phase 1 — pure functions)

| File | Tests | Covers |
|------|-------|--------|
| `src/shared/model-detector.test.ts` | 15 | Initial/switch detection, ANSI stripping |
| `src/shared/message-parser.test.ts` | 10 | 4 message formats, dedup, ANSI stripping |
| `src/renderer/utils/variable-resolver.test.ts` | 18 | resolveVariables, extractVariables, getMissingVariables |
| `src/renderer/utils/fuzzy-search.test.ts` | 14 | Score tiers, sorting, minScore, highlightMatches |
| `src/main/git-manager.test.ts` | 41 | Status parsing, branches, commit, generateMessage, detectErrorCode |
| `src/renderer/utils/layout-tree.test.ts` | 33 | countPanes, traverseTree, transformTree, pruneTree, grid nodes |

### Integration Tests (Phase 2 — mocked dependencies)

| File | Tests | Covers |
|------|-------|--------|
| `src/renderer/hooks/useGit.test.ts` | 8 | Status loading, staging, commit, operationInProgress |
| `src/renderer/hooks/useSessionManager.test.ts` | 6 | CRUD, events, output subscribers |
| `src/renderer/hooks/useSplitView.test.ts` | 9 | Layout ops, persistence, focus navigation |
| `src/main/session-persistence.test.ts` | 16 | Load/save/clear, validation, atomic write |
| `src/main/ipc-registry.test.ts` | 5 | handle(), on(), removeAll() |
| `src/main/ipc-emitter.test.ts` | 3 | emit(), destroyed window guard |

### Component Tests (Phase 3 — mocked hooks)

| File | Tests | Covers |
|------|-------|--------|
| `src/renderer/components/ui/TabBar.test.tsx` | 8 | Tabs render, active state, callbacks |
| `src/renderer/components/ui/EmptyState.test.tsx` | 5 | Welcome screen, quick actions |
| `src/renderer/components/ui/CommitDialog.test.tsx` | 11 | Form, validation, commit flow, generate |
| `src/renderer/components/PaneHeader.test.tsx` | 10 | Name, split/close buttons, dropdown |
| `src/renderer/components/GitPanel.test.tsx` | 13 | File sections, branch, init, status |
| `src/renderer/components/SplitLayout.test.tsx` | 8 | Single/split/grid render, depth guard |

### E2E Tests (Phase 4 — Playwright for Electron)

| File | Tests | Covers |
|------|-------|--------|
| `e2e/app-launch.spec.ts` | 4 | Window, title, dimensions, content |
| `e2e/session.spec.ts` | 3 | New session button, dialog |
| `e2e/split-view.spec.ts` | 2 | Single pane default |
| `e2e/keyboard-shortcuts.spec.ts` | 3 | Ctrl+T, Escape, settings |
