# OmniDesk

Multi-provider Electron desktop application for AI coding CLIs. Organizes work around a flat repo→session model: an activity bar for switching repositories, a session rail for navigating sessions within a repo, and a terminal host that fills the main view. Supports Claude Code, Codex CLI, and future providers via a pluggable provider abstraction layer.

## Workflow Rule

**Always run the `requirements-clarifier` agent (via the Task tool) on the user's initial prompt before planning or implementing.** This ensures requirements are analyzed, ambiguities are surfaced, and acceptance criteria are established before any work begins. Skip only for trivial tasks (typo fixes, single-line changes, or purely informational questions).

## Tech Stack

Electron 28 | React 18 | TypeScript | xterm.js | node-pty | Tailwind CSS

## Architecture

```
┌─────────────────────────────────────────────┐
│  Main Process (Node.js)                     │
│  ~7 managers + IPC handlers + session pool  │
└──────────────────┬──────────────────────────┘
                   │ IPC (103 methods)
┌──────────────────┴──────────────────────────┐
│  Preload (auto-derived context bridge)      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│  Renderer (React 18)                        │
│  Hooks → Shell components → Terminal        │
└─────────────────────────────────────────────┘
```

**3-layer pattern per domain:** Manager (main) → Hook (renderer) → Components (renderer)

**IPC contract** (`src/shared/ipc-contract.ts`) is the single source of truth — 103 methods. The preload bridge and `ElectronAPI` type are auto-derived from it.

**Provider abstraction**: `IProvider` interface (`src/main/providers/`) decouples CLI specifics from session management. `CLIManager` delegates to the active provider for command building, environment variables, and model detection. Default provider is Claude.

**Launch mode picker**: Per-session launch mode for the Claude provider — `'default'` (`claude`), `'bypass-permissions'` (`claude --dangerously-skip-permissions`), or `'agents'` (`claude agents` — Claude Code 2.1.139+ TUI, see https://code.claude.com/docs/en/agent-view). The mode rides on `SessionCreateRequest.launchMode?: LaunchMode` from the renderer; `ClaudeProvider` switches on it to construct argv. There is no `bypassPermissions` runtime branch — the legacy `permissionMode === 'skip-permissions'` is only consulted as a fallback for callers that don't pass `launchMode`. `'agents'` is gated by an availability probe (see Agent View availability below); the `IProvider` surface is unchanged (Codex ignores the field).

## Domain Map

| Domain | Main (manager) | Renderer (hook + UI) | Shared types | IPC prefix |
|--------|---------------|---------------------|-------------|------------|
| Shell | — | `components/shell/` (RepoActivityBar, SessionRail, MainView, RightInspector, TerminalHost, Palette, RepoSwitcher, AddRepoSheet, NewSessionSheet, StatusBar, TitleBar, ContextMenu, PromptDialog, CloseSessionDialog, NonGitFolderDialog, P4Icon, SessionPane, SessionTile, shell-utils) | — | — |
| Sessions | session-manager, cli-manager, session-pool, session-persistence | useSessionManager, useSessionPreviews, Terminal, `terminal/` (kitty-keyboard, shell-key-rules) | ipc-types.ts (`SessionKind`) | `session:*` |
| Repos / Workspaces | settings-persistence | useRepos | ipc-types.ts | `workspace:*`, `fs:listGitRepos` |
| Git (worktree ops) | git-manager | — (backend only; useRepos calls git IPC) | types/git-types.ts | `git:*` |
| History | history-manager | — (backend/persistence only; no UI panel) | types/history-types.ts | `history:*` |
| Checkpoints | checkpoint-manager, checkpoint-persistence | — (backend/persistence only; no UI panel) | types/checkpoint-types.ts | `checkpoint:*` |
| Quota / Burn Rate | quota-service | useQuota | ipc-types.ts | `quota:*`, `burnRate:*` |
| Drag-Drop | file-dragdrop-handler, file-utils | — | ipc-types.ts | `dragdrop:*` |
| Settings | settings-persistence | — | ipc-types.ts | `settings:*` |
| Providers | provider-registry, claude-provider, codex-provider | useProvider | types/provider-types.ts | `provider:*` |
| Agent View | agent-view/availability, agent-view/availability-cache, agent-view/probe-version | useAgentViewAvailability | types/agent-view-types.ts | `agentView:availability`, `agentView:availabilityChanged` |
| Window | index.ts | ConfirmDialog, ToastContainer | ipc-types.ts | `window:*`, `dialog:*`, `shell:*`, `updates:*`, `app:*` |

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
- **Ctrl+C interception**: In **agent** sessions, `\x03` is caught in `terminal.onData()` and shows `ConfirmDialog` — never forward it to Claude (it exits). In **plain shell** sessions, `Ctrl+C` passes straight through to interrupt the running command (`Terminal.tsx:413-416`). Session kind drives the branch (`SessionKind` in `src/shared/ipc-types.ts`).
- **Newline insertion**: Ctrl+Enter, Shift+Enter, Alt+Enter, and Cmd+Enter insert a literal `\n` into the terminal via `attachCustomKeyEventHandler` in `Terminal.tsx`. Works in both host and read-only modes (suppressed in read-only).
- **Terminal key handling** (`src/renderer/terminal/`): `kitty-keyboard.ts` negotiates and encodes the Kitty keyboard protocol when the running CLI requests it (accurate key/modifier encoding); `shell-key-rules.ts` holds the plain-shell key mapping (incl. the Ctrl+C pass-through rule). Both are unit-tested.
- **Session pool**: Pre-warmed shells in `session-pool.ts` for faster session creation. Delayed init (2.5s after app start).
- **IPC contract**: One entry in `IPCContractMap` = auto-derived channel, kind, preload bridge method, and TypeScript type. No manual wiring needed.
- **Git integration**: `GitManager` uses `child_process.execFile` (not `exec` — prevents shell injection). Per-directory mutex serializes operations. `.git` directory watching with 500ms debounce for real-time status. Heuristic-based AI commit message generation (conventional commits format). Used by `useRepos` for repo/worktree discovery and session creation — there is no Git panel UI in the current shell.
- **History and Checkpoints (backend-only)**: `HistoryManager` and `CheckpointManager` are kept because they are load-bearing dependencies (`SessionManager` requires `historyManager`; `GitManager` requires `checkpointManager`). They have IPC handlers and full persistence, but the current shell has no UI panel for either domain.
- **Provider abstraction**: `IProvider` interface decouples CLI specifics. `CLIManager` delegates to provider for command building, env vars, and model detection. Default provider is Claude. `ProviderRegistry` auto-registers Claude and Codex providers on construction.
- **Launch mode picker**: `NewSessionSheet` (in `src/renderer/components/shell/NewSessionSheet.tsx`) shows a launch mode control when the Claude provider is selected, with three options driven by `LaunchMode = 'default' | 'bypass-permissions' | 'agents'` (`src/shared/ipc-types.ts`). Selection rides on the optional `SessionCreateRequest.launchMode`; `ClaudeProvider.buildCommand` switches on it. The default selection comes from the workspace's `defaultPermissionMode` (`'skip-permissions'` → seeds `'bypass-permissions'`). Codex sessions ignore the field. Defense-in-depth: `ClaudeProvider` reads the live availability cache and downgrades `'agents'` → `'default'` with a warning if availability is `'unavailable'`.
- **Agent View availability**: `claude agents` mode is gated by a one-shot main-process probe of `claude --version` plus `~/.claude/settings.json.disableAgentView` and `CLAUDE_CODE_DISABLE_AGENT_VIEW` kill switches (`src/main/agent-view/`). The probe runs in a `setTimeout(..., 2000)` block off the synchronous `createWindow` critical path (lesson from a prior aborted feature). Result is held in a module-level cache (`availability-cache.ts`), exposed via `agentView:availability` IPC (one-shot fetch on sheet open), and pushed to the renderer via `agentView:availabilityChanged` event once the probe completes. The `useAgentViewAvailability` hook does a **one-shot fetch on mount** then **subscribes to `onAgentViewAvailabilityChanged`**; if the initial fetch returns `reason: 'probing'` the hook stays `loading: true` until the push event delivers the final state. Reason variants: `'cli-not-found'`, `'cli-too-old'`, `'version-unparseable'`, `'disabled-by-setting'`, `'disabled-by-env'`, `'probing'` (transient initial cache state — internal sentinel, never exposed to picker consumers), `'detection-failed'` (renderer-side IPC catch + the no-args ClaudeProvider fallback getter).
- **Agent teams CLI capability**: The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable is injected by `ClaudeProvider` (`claude-provider.ts:120`) when the setting is enabled, and also set directly in `cli-manager.ts:334`. This is independent of any team-visualization UI (which was removed). The env-var injection is the only surviving part of the agent-teams feature.

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

**Important:** The existing `vite.config.ts` has `root: 'src/renderer'` which conflicts with vitest auto-discovery. All test scripts use `--config vitest.workspace.ts` explicitly.

**E2E build requirement:** `npm run build` is `tsc && vite build` — it only rebuilds the **renderer** (the `tsc` step uses the default `tsconfig.json` with `noEmit: true`; vite outputs to `dist/renderer/`). The main process is built separately by `npm run build:electron` (`tsc -p tsconfig.main.json` → `dist/main/`). Playwright e2e tests load from `dist/main/index.js`, so before running them you must run **both** (or `npm run start` which chains them). Stale `dist/main` silently means source edits to managers/IPC handlers/providers don't apply, and the failure mode looks like old behavior persisting after a "successful" build.

## Pitfalls

- Windows paths need `.replace(/\\/g, '\\\\')`
- Never send Ctrl+C (`\x03`) to Claude in **agent** sessions — it exits immediately (plain shell sessions intentionally pass it through)
- Always batch PTY output (16ms `FLUSH_INTERVAL` in CLIManager)
- Reuse existing UI components from `components/ui/` for consistency
- No global state library — React hooks only

## Design Language

Dark theme (Obsidian): surface base `#0A0B11`, accent `#00C9A7`, danger `#F7678E`, borders `rgba(255,255,255,0.035–0.12)` (subtle/default/strong). See `src/renderer/styles/tokens.css` for the full token set.
Font: JetBrains Mono. Monospace everywhere.
Design tokens defined in `src/renderer/styles/tokens.css`.
`globals.css` imports `tokens.css`, `animations.css`, `motion.css`, and `prototype-shell.css` (the Phase 4 shell's own CSS). `App.tsx` imports `tokens.css` and `animations.css` directly before mounting.

## Docs

- [Repo Index](docs/repo-index.md) — detailed domain-to-file mapping
- [Contributing](CONTRIBUTING.md)
