# OmniDesk

Multi-provider Electron desktop application for AI coding CLIs, with multi-session terminals, split views, and agent team visualization. Supports Claude Code, Codex CLI, and future providers via a pluggable provider abstraction layer.

## Workflow Rule

**Always run the `requirements-clarifier` agent (via the Task tool) on the user's initial prompt before planning or implementing.** This ensures requirements are analyzed, ambiguities are surfaced, and acceptance criteria are established before any work begins. Skip only for trivial tasks (typo fixes, single-line changes, or purely informational questions).

## Tech Stack

Electron 28 | React 18 | TypeScript | xterm.js | node-pty | Tailwind CSS | reactflow

## Architecture

```
┌─────────────────────────────────────────────┐
│  Main Process (Node.js)                     │
│  15 managers + IPC handlers + session pool  │
└──────────────────┬──────────────────────────┘
                   │ IPC (~191 methods)
┌──────────────────┴──────────────────────────┐
│  Preload (auto-derived context bridge)      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│  Renderer (React 18)                        │
│  Hooks → Components → UI                   │
└─────────────────────────────────────────────┘
```

**3-layer pattern per domain:** Manager (main) → Hook (renderer) → Components (renderer)

**IPC contract** (`src/shared/ipc-contract.ts`) is the single source of truth — ~191 methods. The preload bridge and `ElectronAPI` type are auto-derived from it.

**Provider abstraction**: `IProvider` interface (`src/main/providers/`) decouples CLI specifics from session management. `CLIManager` delegates to the active provider for command building, environment variables, and model detection. Default provider is Claude.

**Launch mode picker**: Per-session launch mode for the Claude provider — `'default'` (`claude`), `'bypass-permissions'` (`claude --dangerously-skip-permissions`), or `'agents'` (`claude agents` — Claude Code 2.1.139+ TUI, see https://code.claude.com/docs/en/agent-view). The mode rides on `SessionCreateRequest.launchMode?: LaunchMode` from the renderer; `ClaudeProvider` switches on it to construct argv. There is no `bypassPermissions` runtime branch — the legacy `permissionMode === 'skip-permissions'` is only consulted as a fallback for callers that don't pass `launchMode`. `'agents'` is gated by an availability probe (see Agent View availability below); the `IProvider` surface is unchanged (Codex ignores the field).

## Domain Map

| Domain | Main (manager) | Renderer (hook + UI) | Shared types | IPC prefix |
|--------|---------------|---------------------|-------------|------------|
| Sessions | session-manager, cli-manager, session-pool, session-persistence | useSessionManager, Terminal | ipc-types.ts | `session:*` |
| Split View | settings-persistence | useSplitView, SplitLayout, PaneHeader, PaneSessionPicker | ipc-types.ts | `settings:*` |
| Agent Teams | agent-team-manager | useAgentTeams, useAutoTeamLayout, useMessageStream, TeamPanel, TaskBoard, MessageStream, AgentGraph | ipc-types.ts, message-parser.ts | `teams:*` |
| Templates | prompt-templates-manager, built-in-actions | useCommandPalette, CommandPalette, TemplateEditor | types/prompt-templates.ts | `template:*` |
| Custom Commands | custom-command-manager | useCustomCommands, CustomCommandDialog, CustomCommandPanel, CustomCommandParameterDialog | types/custom-command-types.ts | `customCommands:*` |
| History | history-manager | useHistory, HistoryPanel | types/history-types.ts | `history:*` |
| Checkpoints | checkpoint-manager, checkpoint-persistence | useCheckpoints, CheckpointPanel, CheckpointDialog | types/checkpoint-types.ts | `checkpoint:*` |
| Quota | quota-service | useQuota, BudgetPanel, BudgetSettings | ipc-types.ts | `quota:*`, `burnRate:*` |
| Drag-Drop | file-dragdrop-handler, file-utils | useDragDrop, DragDropOverlay, DragDropContextMenu, DragDropSettings | ipc-types.ts | `dragdrop:*` |
| Workspaces | settings-persistence | SettingsDialog | ipc-types.ts | `workspace:*` |
| Tasks | task-manager | useTasks, TaskPanel, TaskQuickCapture | types/task-types.ts, task-parser.ts | `task:*` |
| Atlas | atlas-manager | useAtlas, AtlasPanel | types/atlas-types.ts | `atlas:*` |
| Git | git-manager | useGit, useDiffViewer, GitPanel, DiffViewer, DiffFileNav, DiffViewerHeader, DiffContentArea, CommitDialog, WorktreePanel, diff-parser | types/git-types.ts | `git:*` |
| Focus Mode | — | FocusMode (Context + Provider), useFocusMode | ipc-types.ts (`AppSettings.focusMode`) | `settings:*` |
| Drag-Reorder | — | useDrag (pointer-events hook) | — | — |
| Playbooks | playbook-manager, playbook-executor, built-in-playbooks | usePlaybooks, PlaybookPicker, PlaybookParameterDialog, PlaybookProgressPanel, PlaybookPanel, PlaybookEditor | types/playbook-types.ts | `playbook:*` |
| Tunnels | tunnel-manager | useTunnel, TunnelPanel, TunnelCreateDialog, TunnelRequestLogs | types/tunnel-types.ts | `tunnel:*` |
| Providers | provider-registry, claude-provider, codex-provider | useProvider | types/provider-types.ts | `provider:*` |
| Agent View | agent-view/availability, agent-view/availability-cache, agent-view/probe-version | useAgentViewAvailability | types/agent-view-types.ts | `agentView:availability`, `agentView:availabilityChanged` |
| Session Sharing | sharing-manager | useSessionSharing, ShareSessionDialog, JoinSessionDialog, ObserverToolbar, ObserverMetadataSidebar, ShareManagementPanel, ShareIndicator, ControlRequestDialog | types/sharing-types.ts | `sharing:*` |
| Window | index.ts | ConfirmDialog, SettingsDialog, AboutDialog, TitleBarBranding | ipc-types.ts | `window:*`, `dialog:*` |

## Adding a New IPC Method

1. Add entry to `src/shared/ipc-contract.ts` (in `IPCContractMap`)
2. Add handler in `src/main/ipc-handlers.ts` using `registry.handle()` / `registry.on()`

That's it. The preload bridge and types auto-derive.

## Adding a New Domain

1. Create `src/main/<domain>-manager.ts` (or `src/main/<domain>/` directory for multi-file domains like Providers)
2. Create `src/renderer/hooks/use<Domain>.ts`
3. Create component(s) in `src/renderer/components/`
4. Add IPC methods to `ipc-contract.ts` with `<domain>:*` prefix
5. Wire manager in `src/main/index.ts` (import, instantiate, pass to `setupIPCHandlers`)
6. Update `docs/repo-index.md`

Example: The **Providers** domain uses `src/main/providers/` with `IProvider` interface, `ClaudeProvider`, `CodexProvider`, and `ProviderRegistry` — all wired into `SessionManager` and exposed via `provider:*` IPC methods.

## Critical Implementation Patterns

- **Shell setup**: `cli-manager.ts` uses `cmd.exe` on Windows and the user's default shell on Unix. No directory locking or shell overrides.
- **Output buffering**: 16ms batches in `CLIManager` prevent IPC flooding (~60fps).
- **Claude readiness**: Pattern detection ("Claude Code", "Sonnet", "Tips for getting started") + 5s fallback timeout in `Terminal.tsx`.
- **Ctrl+C interception**: Caught in `terminal.onData()`, shows `ConfirmDialog`. Never forward `\x03` to Claude (it exits).
- **Newline insertion**: Ctrl+Enter, Shift+Enter, Alt+Enter, and Cmd+Enter insert a literal `\n` into the terminal via `attachCustomKeyEventHandler` in `Terminal.tsx`. Works in both host and read-only modes (suppressed in read-only).
- **Session pool**: Pre-warmed shells in `session-pool.ts` for faster session creation. Delayed init (2.5s after app start).
- **IPC contract**: One entry in `IPCContractMap` = auto-derived channel, kind, preload bridge method, and TypeScript type. No manual wiring needed.
- **Split view**: `useSplitView` manages a tree of leaf/branch nodes. Max 4 panes. State persisted in settings.
- **Agent team detection**: `AgentTeamManager` watches `~/.claude/teams/` and `~/.claude/tasks/` via `fs.watch()`. Auto-links sessions within 30s of team creation.
- **Git integration**: `GitManager` uses `child_process.execFile` (not `exec` — prevents shell injection). Per-directory mutex serializes operations. `.git` directory watching with 500ms debounce for real-time status. Heuristic-based AI commit message generation (conventional commits format).
- **Playbook execution**: `PlaybookExecutor` writes prompts to PTY and uses silence-based detection (3s no output = step done) for step completion. Never sends Ctrl+C on cancel (just stops sending further steps). One execution per session, confirmation gates pause between steps.
- **Provider abstraction**: `IProvider` interface decouples CLI specifics. `CLIManager` delegates to provider for command building, env vars, and model detection. Default provider is Claude. `ProviderRegistry` auto-registers Claude and Codex providers on construction.
- **Launch mode picker**: `NewSessionDialog` shows a "Launch mode" dropdown when the Claude provider is selected, with three options driven by `LaunchMode = 'default' | 'bypass-permissions' | 'agents'` (`src/shared/ipc-types.ts`). Selection rides on the optional `SessionCreateRequest.launchMode`; `ClaudeProvider.buildCommand` switches on it. The default selection comes from the workspace's `defaultPermissionMode` (`'skip-permissions'` → seeds `'bypass-permissions'`). Codex sessions ignore the field. Defense-in-depth: `ClaudeProvider` reads the live availability cache and downgrades `'agents'` → `'default'` with a warning if availability is `'unavailable'`.
- **Agent View availability**: `claude agents` mode is gated by a one-shot main-process probe of `claude --version` plus `~/.claude/settings.json.disableAgentView` and `CLAUDE_CODE_DISABLE_AGENT_VIEW` kill switches (`src/main/agent-view/`). The probe runs in a `setTimeout(..., 2000)` block off the synchronous `createWindow` critical path (lesson from a prior aborted feature). Result is held in a module-level cache (`availability-cache.ts`), exposed via `agentView:availability` IPC (one-shot fetch on dialog open), and pushed to the renderer via `agentView:availabilityChanged` event once the probe completes. The `useAgentViewAvailability` hook does a **one-shot fetch on mount** then **subscribes to `onAgentViewAvailabilityChanged`**; if the initial fetch returns `reason: 'probing'` the hook stays `loading: true` until the push event delivers the final state. This is the same pattern used by `gitManager.setMainWindow` and `taskManager.setMainWindow`. Reason variants: `'cli-not-found'`, `'cli-too-old'`, `'version-unparseable'`, `'disabled-by-setting'`, `'disabled-by-env'`, `'probing'` (transient initial cache state — internal sentinel, never exposed to picker consumers), `'detection-failed'` (renderer-side IPC catch + the no-args ClaudeProvider fallback getter).
- **Tasks**: Per-repo todo list backed by `.omnidesk/tasks.md`. `TaskManager` uses `fs.watch` (200ms debounce) so external edits — including those by the active AI session — propagate to the UI. Mutations serialized via per-repo mutex. `Task.id` is a stable UUID stored in `.omnidesk/tasks.meta.json` (sidecar) so ids survive title edits; the markdown file stays clean of metadata noise.
- **Focus mode**: `FocusMode.tsx` exports `FocusModeProvider` (wraps `App.tsx`) and `useFocusMode()`. ⌘./Ctrl+. toggles the `focus-mode` class on `document.documentElement`. CSS transitions hide `[data-focus-hide="activity-bar"]` (slide left) and `[data-focus-hide="right-panel"]` (slide right) in ≤160ms using `var(--v2-duration-160)`. State persists to `AppSettings.focusMode` via `setSettings`. Restored on mount via `getSettings()`.
- **Drag-reorder**: `useDrag<T>({ items, onReorder, threshold? })` in `src/renderer/hooks/useDrag.ts` — hand-rolled pointer-capture drag. Uses `setPointerCapture` so move/up events follow the pointer off the element. Drag starts only after moving past threshold (default 4px). Drop target computed from sibling midpoints. Fires `onReorder(from, to)` on pointer up. Wired to TabBar v2 (persists `tabs.order` to settings) and TaskPanel v2 (persists `tasks.order` to settings). No external DnD library.
- **Session sharing** *(currently disabled — LaunchTunnel integration being fixed)*: WebSocket relay via LaunchTunnel (`wss://relay.launchtunnel.dev/share/<id>`). Binary frame protocol — 12 frame types (`0x10`–`0x1B`): TerminalData, TerminalInput, Metadata, ScrollbackBuffer, ControlRequest/Grant/Revoke, ObserverAnnounce/List, ShareClose, Ping/Pong. Scrollback buffer on observer join: 5000 lines, gzip-compressed. Observer Ctrl+C (`\x03`) is stripped from TerminalInput frames — same safety rule as local sessions. Metadata broadcast interval: 2s. Sharing gated behind LaunchTunnel Pro subscription (checked via `TunnelManager.getAccount()`). `omnidesk://join/<code>` deep links handled in `app.on('second-instance')` (Windows) and `app.on('open-url')` (macOS), pre-filling `JoinSessionDialog` via `sharing:deepLinkJoin` IPC event.

## Testing

Vitest 4 + @testing-library/react + Playwright for Electron.

**Run tests:**
```bash
npm test                    # All unit + integration tests
npm run test:unit           # shared + main only
npm run test:integration    # renderer only (jsdom)
npm run test:e2e            # Playwright E2E (requires built app)
npm run test:coverage       # With coverage report
npm run test:ci             # CI mode (coverage + JUnit XML)
```

**3 workspace projects** (configured in `vitest.workspace.ts`):

| Project | Environment | Setup file | Pattern |
|---------|-------------|------------|---------|
| `shared` | node | — | `src/shared/**/*.test.ts` |
| `main` | node | `test/setup-main.ts` | `src/main/**/*.test.ts` |
| `renderer` | jsdom | `test/setup-renderer.ts` | `src/renderer/**/*.test.{ts,tsx}` |

**Mock infrastructure:**
- `test/setup-main.ts` — Mocks `electron` (app, BrowserWindow, ipcMain, dialog, shell) and `node-pty`
- `test/setup-renderer.ts` — Imports `@testing-library/jest-dom`, resets `window.electronAPI` before each test
- `test/helpers/electron-api-mock.ts` — Auto-derives comprehensive `window.electronAPI` mock from IPC contract. Use `getElectronAPI()` for per-test customization.

**Extracted utility:** `src/renderer/utils/layout-tree.ts` — 7 pure tree functions extracted from `useSplitView.ts` for testability: `countPanes`, `traverseTree`, `transformTree`, `pruneTree`, `updateRatioAtPath`, `getAllPaneIds`, `getFirstPaneId`.

**Important:** The existing `vite.config.ts` has `root: 'src/renderer'` which conflicts with vitest auto-discovery. All test scripts use `--config vitest.workspace.ts` explicitly.

**E2E build requirement:** `npm run build` is `tsc && vite build` — it only rebuilds the **renderer** (the `tsc` step uses the default `tsconfig.json` with `noEmit: true`; vite outputs to `dist/renderer/`). The main process is built separately by `npm run build:electron` (`tsc -p tsconfig.main.json` → `dist/main/`). Playwright e2e tests load from `dist/main/index.js`, so before running them you must run **both** (or `npm run start` which chains them). Stale `dist/main` silently means source edits to managers/IPC handlers/providers don't apply, and the failure mode looks like old behavior persisting after a "successful" build.

## Pitfalls

- Windows paths need `.replace(/\\/g, '\\\\')`
- Never send Ctrl+C (`\x03`) to Claude — it exits immediately
- Never use React hooks inside callbacks (caused SplitLayout crash — see `useSplitView.ts`)
- Always batch PTY output (16ms `FLUSH_INTERVAL` in CLIManager)
- `transformTree` in `useSplitView.ts` must recurse children BEFORE applying transformation (infinite recursion otherwise)
- Reuse existing UI components from `components/ui/` for consistency
- No global state library — React hooks only

## Design Language

Dark theme (Obsidian): bg `#0D0E14`, accent `#00C9A7`, danger `#F7678E`, border `#292E44`
Font: JetBrains Mono. Monospace everywhere.
Design tokens defined in `src/renderer/styles/tokens.css`.

## Docs

- [Repo Index](docs/repo-index.md) — detailed domain-to-file mapping
- [Contributing](CONTRIBUTING.md)
