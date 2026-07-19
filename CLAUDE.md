# OmniDesk

Multi-provider Electron desktop application for AI coding CLIs. Organizes work around a flat repo→session model: an activity bar for switching repositories, a session rail for navigating sessions within a repo, and a terminal host that fills the main view. Supports Claude Code, Codex CLI, and future providers via a pluggable provider abstraction layer.

## Workflow Rules

**Always run the `requirements-clarifier` agent (via the Task tool) on the user's initial prompt before planning or implementing.** This ensures requirements are analyzed, ambiguities are surfaced, and acceptance criteria are established before any work begins. Skip only for trivial tasks (typo fixes, single-line changes, or purely informational questions).

**Always start new work in a fresh branch based on an up-to-date `main` — and always use a git worktree for it.** For any new feature, issue, or bug fix that is **not** related to the branch the current checkout is on, before writing code:
1. `git fetch origin` — always get the latest `main` first; never create a branch or worktree from a stale local `main`.
2. Create a worktree with its own new branch cut from the freshly-fetched `origin/main`:
   `git worktree add .claude/worktrees/<type>-<short-desc> -b <type>/<short-desc> origin/main`
   (e.g. `git worktree add .claude/worktrees/fix-terminal-garble -b fix/terminal-initial-size-garble origin/main`). In Claude Code, `EnterWorktree` is the preferred way to do this.
3. Do all work for that item inside that worktree on that one branch, then open a PR against `main`.
4. When the work is merged/abandoned, clean up: `git worktree remove <path>`.

**Why worktrees are required:** multiple sessions often run concurrently in this repo. Switching branches (or stashing/restoring) in the main checkout would change files underneath another running session. A worktree gives each work item its own isolated directory, so nothing else is affected.

Never commit work directly to `main`, and never build a fix on top of an unrelated feature branch — if the task doesn't belong to the current branch, spin up a new worktree from `origin/main` as above instead of reusing the checkout. Skip only when the user explicitly asks to work on the current branch.

## Tech Stack

Electron 28 | React 18 | TypeScript | xterm.js | node-pty | Tailwind CSS

## Architecture

```
┌─────────────────────────────────────────────┐
│  Main Process (Node.js)                     │
│  ~7 managers + IPC handlers + session pool  │
└──────────────────┬──────────────────────────┘
                   │ IPC (115 methods)
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

**IPC contract** (`src/shared/ipc-contract.ts`) is the single source of truth — 115 methods. The preload bridge and `ElectronAPI` type are auto-derived from it.

**Provider abstraction**: `IProvider` interface (`src/main/providers/`) decouples CLI specifics from session management. `CLIManager` delegates to the active provider for command building, environment variables, and model detection. Default provider is Claude.

**Launch mode picker**: Per-session launch mode for the Claude provider — `'default'` (`claude`), `'bypass-permissions'` (`claude --dangerously-skip-permissions`), or `'agents'` (`claude agents` — Claude Code 2.1.139+ TUI, see https://code.claude.com/docs/en/agent-view). The mode rides on `SessionCreateRequest.launchMode?: LaunchMode` from the renderer; `ClaudeProvider` switches on it to construct argv. There is no `bypassPermissions` runtime branch — the legacy `permissionMode === 'skip-permissions'` is only consulted as a fallback for callers that don't pass `launchMode`. `'agents'` is gated by an availability probe (see Agent View availability below); the `IProvider` surface is unchanged (Codex ignores the field).

## Domain Map

| Domain | Main (manager) | Renderer (hook + UI) | Shared types | IPC prefix |
|--------|---------------|---------------------|-------------|------------|
| Shell | — | `components/shell/` (RepoActivityBar, SessionRail, MainView, RightInspector, TerminalHost, Palette, RepoSwitcher, AddRepoSheet, NewSessionSheet, StatusBar, TitleBar, ContextMenu, PromptDialog, CloseSessionDialog, NonGitFolderDialog, P4Icon, SessionPane, SessionTile, shell-utils) | — | — |
| Sessions | session-manager, cli-manager, session-pool, session-persistence | useSessionManager, useSessionPreviews, Terminal, `terminal/` (kitty-keyboard, shell-key-rules) | ipc-types.ts (`SessionKind`, `SessionActivityState`, `SessionStateChangeEvent`) | `session:*` |
| Session state / Cockpit | session-state/ (classifier, alt-screen-tracker) | useAttentionQueue, `components/shell/` (CockpitPanel), SessionRail (mapTabStatus/attentionRank), StatusBar ("N need you" pill) | shared/session-state-types.ts, shared/state-detector, shared/line-reducer, ipc-types.ts (`SessionActivityState`) | `session:stateChanged` |
| Repos / Workspaces | settings-persistence | useRepos | ipc-types.ts | `workspace:*`, `fs:listGitRepos` |
| Git (worktree ops) | git-manager | — (backend only; useRepos calls git IPC) | types/git-types.ts | `git:*` |
| History | history-manager | — (backend/persistence only; no UI panel) | types/history-types.ts | `history:*` |
| Checkpoints | checkpoint-manager, checkpoint-persistence | — (backend/persistence only; no UI panel) | types/checkpoint-types.ts | `checkpoint:*` |
| Quota / Burn Rate | quota-service | useQuota | ipc-types.ts | `quota:*`, `burnRate:*` |
| Drag-Drop | file-dragdrop-handler, file-utils | — | ipc-types.ts | `dragdrop:*` |
| Settings | settings-persistence | — | ipc-types.ts | `settings:*` |
| Providers | provider-registry, claude-provider, codex-provider | useProvider | types/provider-types.ts | `provider:*` |
| Agent View | agent-view/availability, agent-view/availability-cache, agent-view/probe-version | useAgentViewAvailability | types/agent-view-types.ts | `agentView:availability`, `agentView:availabilityChanged` |
| Remote | remote/remote-access-server, remote/ws-router, remote/client-hub, remote/remote-auth, remote/web-bridge, remote/http-util, remote/tunnel-manager, remote/tunnel-controller, remote/cloudflared-install | useRemoteAccess, RemoteAccessPanel | ipc-types.ts (`RemoteAccessStatus`, `RemoteAccessSettings`) | `remote:*`, `session:scrollback` |
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
- **Agent teams CLI capability**: The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable is injected by `ClaudeProvider` (`claude-provider.ts:175`) when the setting is enabled, and also set directly in `cli-manager.ts:383`. This is independent of any team-visualization UI (which was removed). The env-var injection is the only surviving part of the agent-teams feature.
- **Remote access** (`src/main/remote/`): serves the built renderer + an IPC-over-WebSocket bridge so the same React UI runs in a browser. `RemoteAccessServer` binds **`127.0.0.1` only** (default port **8420**, configurable, **never 9876**) and is **off by default** — the user exposes it via a tunnel (Cloudflare/Tailscale/ngrok) and OmniDesk enforces its own token (`RemoteAuth`: cookie + WS-upgrade check, constant-time compare, rate limit). The browser bridge (`web-bridge.ts`, generated from `channels`+`contractKinds`) implements `window.electronAPI` over WS; `WsRouter` dispatches `invoke`/`send` frames to the same `IPCRegistry.invokeMethod`/`sendMethod` handlers Electron uses. Main→renderer events fan out to every client via `ClientHub` through the `IPCEmitter` broadcaster hook (`registerRemoteBroadcaster`). A bounded per-session scrollback ring buffer in `SessionManager` is replayed on attach via `getSessionScrollback` — the renderer calls it in `Terminal.tsx handleReady` **only when `window.__OMNIDESK_REMOTE__` is set** (cold web attach), so the desktop, which sees output live from creation, never double-writes. Controlled by `remote:*` IPC + the `RemoteAccessPanel` (activity-bar tunnel button, or Cmd+K → "Remote access…"). **Managed tunnel**: `TunnelController` (`tunnel-controller.ts`) composes cloudflared detection (`findCloudflared`), a consented one-click download (`cloudflared-install.ts` — fetches the platform binary into `<userData>/bin`, gated behind an explicit UI button), and a single-child `TunnelManager` (`tunnel-manager.ts`) that spawns `cloudflared tunnel --url http://localhost:<port>`, parses the `trycloudflare.com` URL, and stops exactly the one PID it spawned (never a bulk/port kill). `enableRemoteAccess` starts the server then best-effort starts the tunnel; the panel renders the public URL + a QR whose link embeds the token (`?token=` → cookie → clean URL) for one-scan phone sign-in. **PWA**: the remote UI is installable. The access token is **persisted** (`settings.remoteAccess.token`) and the auth cookie is `Max-Age`-persistent so an installed app / saved QR survives OmniDesk restarts (Regenerate rotates it). `RemoteAccessServer` serves an **auth-gated** `/manifest.webmanifest` (`buildManifest` in `http-util.ts`) whose `start_url` carries the token so the installed app re-authenticates on launch (works around iOS's separate standalone cookie jar). `injectRemoteHead` (replaces `injectBridgeScript`) adds the manifest link + apple-touch/`apple-mobile-web-app-*` meta to the served HTML (remote only — desktop untouched); the SW (`src/renderer/public/sw.js`, cache-first for hashed `/assets/*`, network-only for auth/nav/`__omnidesk`) is registered from `web-bridge.ts` (CSP-safe: external, remote-only). Icons come from `scripts/gen-pwa-icons.mjs` (`npm run gen:pwa-icons`, uses `sharp`) → `src/renderer/public/icons/`.
- **Attention cockpit / session-state classifier** (`src/main/session-state/`): the supervisory-cockpit layer classifies each session's live `SessionActivityState` (`initializing` / `working` / `awaiting-approval` / `awaiting-input` / `done` / `errored` / `idle` / `exited`, in `src/shared/ipc-types.ts`) and routes the user's attention. `SessionStateClassifier` (`classifier.ts`) fuses PTY-output patterns (`IProvider.getStateSignals()` + the pure `src/shared/state-detector.ts`), output-idle timing (a quiescence timer), alt-screen state (`alt-screen-tracker.ts`), and the authoritative exit code, with hysteresis. It's wired at `SessionManager`'s single output tap (`wireCliManager`) and broadcasts deltas via the `onSessionStateChanged` / `session:stateChanged` IPC event → `useSessionManager` folds it onto `TabData.activityState`. Renderer surfacing: `SessionRail.mapTabStatus`/`attentionRank` (rich rail chips incl. `needs-approval`), the `useAttentionQueue` hook + `CockpitPanel` overlay (⌘J / Ctrl+J — cross-repo "who needs you" list with Jump/Dismiss + backgrounded toasts), and the StatusBar "N need you" pill. **IMPORTANT — current limitation**: tail classification is **gated to shell sessions** (`SessionManager.setupClassifier`: `if (kind !== 'shell') return`). Agent CLIs (Claude Code, Codex) render as full-screen TUIs in the terminal's alternate-screen buffer and repaint continuously, which the output-tail/quiescence model can't classify. **Agent sessions instead use the terminal bell**: `BareBellDetector` (`session-state/bell-attention.ts`, escape-aware — BEL also terminates OSC/DCS strings and those never count) watches the same output tap; a bare BEL → `awaiting-input` (reason `'bell'`), cleared back to `working` when the user types into the session (`sendInput`). Verified live against Claude Code v2.1.x (`docs/experiments/2026-07-19-bell-attention-probe.md`): rings on turn completion and question prompts, silent while working — **but only when the CLI's bell channel is on** (Claude: `preferredNotifChannel: "terminal_bell"` in the profile's `settings.json`; zero bells otherwise). Errored/exited still come from `SessionMetadata.status`. Richer agent states (screen-content classification via headless emulator) remain deferred — see the callout at the top of `docs/design/2026-07-19-agentic-cockpit-design.md`.

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
