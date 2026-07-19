# OmniDesk — Repository Index

~7 core managers (+ quota-service, providers/, agent-view/, remote/, session-state/) | 115 IPC methods | 19 channel-prefix domains | 670 tests across 70 files + 6 e2e specs

## Entrypoints

| File | Role |
|------|------|
| `src/main/index.ts` | Main process — creates window, initializes 7 managers, wires IPC, runs agent-view probe |
| `src/renderer/App.tsx` | Root React component — Phase 4 shell, composes all hooks and shell components |
| `src/shared/ipc-contract.ts` | IPC single source of truth — 115 methods, auto-derives preload bridge and types |

## IPC Infrastructure (cross-cutting)

| File | Layer | Role |
|------|-------|------|
| `src/shared/ipc-contract.ts` | Shared | Contract map: channel names, arg types, return types (115 entries) |
| `src/shared/ipc-types.ts` | Shared | All IPC payload/response types |
| `src/main/ipc-handlers.ts` | Main | Handler implementations wired from all surviving managers |
| `src/main/ipc-registry.ts` | Main | Typed `handle()` / `on()` wrappers for `ipcMain` |
| `src/main/ipc-emitter.ts` | Main | Typed `emit()` wrapper for `webContents.send()` |
| `src/preload/index.ts` | Preload | Auto-derived context bridge from contract |

## Phase 4 Shell

The renderer uses a flat repo→session model. The shell lives in `src/renderer/components/shell/`.

| File | Layer | Role |
|------|-------|------|
| `src/renderer/App.tsx` | Renderer | Root component — composes all shell components and hooks |
| `src/renderer/components/shell/index.ts` | Renderer | Barrel export for all shell components |
| `src/renderer/components/shell/RepoActivityBar.tsx` | Renderer | Left activity bar — repo/group list, drag-to-group |
| `src/renderer/components/shell/SessionRail.tsx` | Renderer | Per-repo session list — primary navigation |
| `src/renderer/components/shell/MainView.tsx` | Renderer | Focus/Grid mode toggle and stage — hosts SessionPane/SessionTile |
| `src/renderer/components/shell/SessionPane.tsx` | Renderer | Single-session full view (Focus mode) |
| `src/renderer/components/shell/SessionTile.tsx` | Renderer | Compact session card for Grid mode |
| `src/renderer/components/shell/TerminalHost.tsx` | Renderer | Off-screen terminal host — mounts all xterm instances |
| `src/renderer/components/shell/RightInspector.tsx` | Renderer | Collapsible right panel — per-session inspector |
| `src/renderer/components/shell/StatusBar.tsx` | Renderer | Bottom status bar |
| `src/renderer/components/shell/TitleBar.tsx` | Renderer | In-app title bar with traffic-light controls |
| `src/renderer/components/shell/Palette.tsx` | Renderer | Command/action palette overlay |
| `src/renderer/components/shell/RepoSwitcher.tsx` | Renderer | Repo quick-switch UI |
| `src/renderer/components/shell/AddRepoSheet.tsx` | Renderer | Sheet for adding a workspace/repo |
| `src/renderer/components/shell/NewSessionSheet.tsx` | Renderer | New session form — includes launch mode picker for Claude |
| `src/renderer/components/shell/PromptDialog.tsx` | Renderer | Generic text-input prompt dialog (used for group create/rename) |
| `src/renderer/components/shell/CloseSessionDialog.tsx` | Renderer | Confirm-before-close dialog for sessions |
| `src/renderer/components/shell/NonGitFolderDialog.tsx` | Renderer | Prompt to initialize git when adding a non-git folder |
| `src/renderer/components/shell/ContextMenu.tsx` | Renderer | Right-click context menu for shell elements |
| `src/renderer/components/shell/P4Icon.tsx` | Renderer | Phase 4 icon component |
| `src/renderer/components/shell/shell-utils.ts` | Renderer | Shared utilities: color helpers, `SessionStatus` + `STATUS_META` (incl. `needs-approval`), `isSessionStopped`, formatting |
| `src/renderer/components/shell/CockpitPanel.tsx` | Renderer | Attention cockpit overlay (⌘J) — cross-repo "who needs you" list |

## Sessions

IPC: `session:*`, `model:*`

| File | Layer | Role |
|------|-------|------|
| `src/main/session-manager.ts` | Main | Session CRUD, lifecycle, model change events |
| `src/main/cli-manager.ts` | Main | PTY spawning, output buffering (16ms), model detection |
| `src/shared/model-detector.ts` | Shared | Parse terminal output to detect model switches |
| `src/main/session-pool.ts` | Main | Pre-warmed shell pool for fast session creation |
| `src/main/session-persistence.ts` | Main | Session state save/load (JSON) |
| `src/renderer/hooks/useSessionManager.ts` | Renderer | Session CRUD hook, IPC event listeners |
| `src/renderer/hooks/useSessionPreviews.ts` | Renderer | Last-N-lines stdout snapshots + last-activity timestamps for Grid tiles |
| `src/renderer/components/Terminal.tsx` | Renderer | xterm.js wrapper, Ctrl+C intercept, Claude readiness detection |
| `src/renderer/terminal/kitty-keyboard.ts` | Renderer | Kitty keyboard protocol negotiation + key/modifier encoding |
| `src/renderer/terminal/shell-key-rules.ts` | Renderer | Plain-shell key mapping (incl. Ctrl+C pass-through) |

## Session state / Cockpit

IPC: `session:stateChanged`. Classifies each session's live `SessionActivityState` and routes attention. **Currently gated to shell sessions** (`SessionManager.setupClassifier`); agent-CLI live-state classification is deferred to a headless-emulator rewrite (see `docs/design/2026-07-19-agentic-cockpit-design.md`).

| File | Layer | Role |
|------|-------|------|
| `src/main/session-state/classifier.ts` | Main | Per-session state machine (output patterns + quiescence + alt-screen + exit code, with hysteresis) |
| `src/main/session-state/alt-screen-tracker.ts` | Main | Tracks alternate-screen buffer enter/exit (DECSET ?1049/1047/47) |
| `src/main/session-state/bell-attention.ts` | Main | Escape-aware bare-BEL detector: agent bell → 'awaiting-input' attention state (ignores OSC/DCS terminator BELs) |
| `src/main/session-state/bell-probe.ts` | Main | Debug instrumentation (OMNIDESK_DEBUG_BELL): logs every BEL with context; probe behind the bell-attention feature |
| `src/main/session-state/title-parser.ts` | Main | OSC 0/2 terminal-title parser + `extractTaskTitle` — powers session auto-rename from the CLI's task summary |
| `src/shared/state-detector.ts` | Shared | Pure detector: tail + provider signals → candidate state |
| `src/shared/line-reducer.ts` | Shared | Collapses CR/erase/cursor repaints into visible lines |
| `src/shared/session-state-types.ts` | Shared | `StateSignals`, `CandidateState`, `DetectContext` |
| `src/renderer/hooks/useAttentionQueue.ts` | Renderer | Cross-repo attention queue + acknowledge + backgrounded toasts |
| `src/renderer/components/shell/CockpitPanel.tsx` | Renderer | Attention cockpit overlay (⌘J) |

## Repos / Workspaces

IPC: `workspace:*`, `fs:listGitRepos`, `fs:listSubdirectories`, `fs:createDirectory`

| File | Layer | Role |
|------|-------|------|
| `src/main/settings-persistence.ts` | Main | Workspace list persistence, settings, session pool config |
| `src/renderer/hooks/useRepos.ts` | Renderer | Repo/workspace state — scans git subdirs, tracks open/active/grouped repos |

## Git (backend — worktree ops and repo scanning)

IPC: `git:*` (22 invoke + 4 events — worktree management and status used by useRepos/session creation; no Git panel UI in the current shell)

| File | Layer | Role |
|------|-------|------|
| `src/main/git-manager.ts` | Main | Git command execution, status parsing, AI commit messages, file watching, worktree ops |
| `src/shared/types/git-types.ts` | Shared | Git type definitions (status, branches, commits, diffs, operations, worktrees) |

## History (backend/persistence — no UI panel)

IPC: `history:*` (9 invoke methods)

`HistoryManager` is a load-bearing dependency of `SessionManager` and retains full IPC and persistence. The current shell has no history browsing UI.

| File | Layer | Role |
|------|-------|------|
| `src/main/history-manager.ts` | Main | Session history capture, search, export, cleanup |
| `src/shared/types/history-types.ts` | Shared | History entry and search result types |

## Checkpoints (backend/persistence — no UI panel)

IPC: `checkpoint:*` (7 invoke + 2 events)

`CheckpointManager` is a load-bearing dependency of `GitManager` and retains full IPC and persistence. The current shell has no checkpoint browsing UI.

| File | Layer | Role |
|------|-------|------|
| `src/main/checkpoint-manager.ts` | Main | Checkpoint CRUD, export (JSON/Markdown) |
| `src/main/checkpoint-persistence.ts` | Main | Checkpoint file storage |
| `src/shared/types/checkpoint-types.ts` | Shared | Checkpoint and export format types |

## Quota / Burn Rate

IPC: `quota:*`, `burnRate:*`

| File | Layer | Role |
|------|-------|------|
| `src/main/quota-service.ts` | Main | Anthropic API quota fetching, burn rate calculation (stateless service — called via direct imports in ipc-handlers.ts) |
| `src/renderer/hooks/useQuota.ts` | Renderer | Quota + burn rate polling |

## Drag-Drop (backend only)

IPC: `dragdrop:*`

| File | Layer | Role |
|------|-------|------|
| `src/main/file-dragdrop-handler.ts` | Main | File info resolution, content reading |
| `src/main/file-utils.ts` | Main | File type detection, size formatting |

## Providers

IPC: `provider:*` (3 invoke methods)

| File | Layer | Role |
|------|-------|------|
| `src/main/providers/provider.ts` | Main | `IProvider` interface (incl. `getStateSignals()` for the cockpit classifier) + `ProviderCommandOptions` type (incl. optional `launchMode`) |
| `src/main/providers/provider-registry.ts` | Main | `ProviderRegistry`: auto-registers Claude + Codex, `get()`, `list()`, `getAvailable()` |
| `src/main/providers/claude-provider.ts` | Main | Claude Code provider: command building (switch on `LaunchMode`), readiness patterns, model detection, env vars, defense-in-depth fallback for `'agents'` mode |
| `src/main/providers/codex-provider.ts` | Main | Codex CLI provider: approval-mode mapping, Codex-specific readiness + model patterns |
| `src/main/config-dir.ts` | Main | Centralized config dir path (`~/.omnidesk/`), migration from `~/.claudedesk/` |
| `src/shared/types/provider-types.ts` | Shared | `ProviderId`, `ProviderCapabilities`, `ProviderInfo` type definitions |
| `src/renderer/hooks/useProvider.ts` | Renderer | Provider state hook: `providers`, `availableProviders`, `getCapabilities()` |

## Launch Mode + Agent View

IPC: `agentView:availability` (1 invoke), `agentView:availabilityChanged` (1 event). Launch mode picker lives in `NewSessionSheet.tsx`.

| File | Layer | Role |
|------|-------|------|
| `src/shared/types/agent-view-types.ts` | Shared | `AgentViewAvailable` / `AgentViewUnavailable` / `AgentViewAvailability` discriminated union |
| `src/main/agent-view/availability.ts` | Main | `getAgentViewAvailability(cliVersion, env, settings)` pure precedence resolver |
| `src/main/agent-view/availability-cache.ts` | Main | Module-level cache + `getCachedAgentViewAvailability()` / `setCachedAgentViewAvailability()` |
| `src/main/agent-view/probe-version.ts` | Main | One-shot `claude --version` probe with 5s timeout |
| `src/main/index.ts` `agentViewDelayedInit()` | Main | Off-critical-path probe (`setTimeout(..., 2000)`), updates cache once per app lifetime |
| `src/renderer/hooks/useAgentViewAvailability.ts` | Renderer | One-shot fetch on mount + subscribes to `agentView:availabilityChanged` push event |
| `src/renderer/components/shell/NewSessionSheet.tsx` | Renderer | New session form including launch mode control (three options; agents option state-aware: checking/unavailable/available) |
| `src/shared/ipc-types.ts` `LaunchMode` | Shared | `'default' \| 'bypass-permissions' \| 'agents'` string-literal union; added as optional `launchMode?: LaunchMode` field on `SessionCreateRequest` |

External reference: https://code.claude.com/docs/en/agent-view (research-preview, requires Claude Code 2.1.139+).

## Remote Access

Serves the built renderer + an IPC-over-WebSocket bridge so the same React UI runs in a browser reached via a tunnel. Server binds `127.0.0.1` only (default port 8420, never 9876), off by default. IPC: `remote:getStatus` / `remote:enable` / `remote:disable` / `remote:regenerateToken` (4 invoke) + `session:scrollback` (1 invoke).

| File | Layer | Role |
|------|-------|------|
| `src/main/remote/remote-access-server.ts` | Main | HTTP server: static `dist/renderer`, injected web bridge, token auth endpoints, WS upgrade. `start()` / `stop()` / `isRunning()` / `getPort()` |
| `src/main/remote/ws-router.ts` | Main | `handleWsMessage()` — dispatches `invoke`/`send` frames to `IPCRegistry` |
| `src/main/remote/client-hub.ts` | Main | `ClientHub` — tracks WS clients, `broadcast(channel, payload)` |
| `src/main/remote/remote-auth.ts` | Main | `RemoteAuth` — token gen, constant-time verify, cookie, rate limit |
| `src/main/remote/web-bridge.ts` | Main | `generateWebBridgeScript(channels, kinds)` — browser `window.electronAPI` over WS; sets `window.__OMNIDESK_REMOTE__` |
| `src/main/remote/http-util.ts` | Main | `injectBridgeScript()`, `mimeFor()` pure helpers |
| `src/main/remote/tunnel-manager.ts` | Main | `TunnelManager` — spawns cloudflared, `parseTunnelUrl()`, single-PID stop; `findCloudflared()` |
| `src/main/remote/tunnel-controller.ts` | Main | Composes detect + download + one TunnelManager; `start`/`stop`/`status`/`install`/`isInstalled` |
| `src/main/remote/cloudflared-install.ts` | Main | `cloudflaredAssetName()` + consented `downloadCloudflared()` |
| `src/main/remote/http-util.ts` | Main | `injectRemoteHead()` (bridge + PWA head tags), `buildManifest()`, `mimeFor()` |
| `src/renderer/public/sw.js` | Renderer (static) | PWA service worker — cache-first hashed assets, network-only auth/nav |
| `src/renderer/public/icons/*.png` | Renderer (static) | PWA icons (192/512/maskable/apple-touch), generated |
| `scripts/gen-pwa-icons.mjs` | Build script | Generates PWA icons from `resources/icon.png` (`npm run gen:pwa-icons`) |

Remote also serves an **auth-gated** `/manifest.webmanifest` (token in `start_url`); the access token is persisted in `settings.remoteAccess.token` with a `Max-Age` cookie so installed PWAs survive restarts.
| `src/main/ipc-registry.ts` | Main | `invokeMethod()` / `sendMethod()` — direct handler dispatch for the WS router |
| `src/main/ipc-emitter.ts` | Main | `registerRemoteBroadcaster()` — fans emitted events to `ClientHub` |
| `src/main/session-manager.ts` | Main | Per-session scrollback ring buffer + `getSessionScrollback()` |
| `src/renderer/hooks/useRemoteAccess.ts` | Renderer | `status`/`enable`/`disable`/`regenerate`/`refresh` |
| `src/renderer/components/shell/RemoteAccessPanel.tsx` | Renderer | Toggle + URL/token/copy/regenerate + tunnel hint (Cmd+K → "Remote access…") |
| `src/shared/ipc-types.ts` `RemoteAccessStatus` / `RemoteAccessSettings` | Shared | Status DTO + persisted `{ enabled, port }` |

## Integrations (outbound event bus + connectors + GitHub actions)

Pushes session events out to Telegram / Slack / Discord / a generic HMAC-signed webhook, and drives GitHub ship-it + issue intake via the `gh` CLI. IPC: `integrations:testConnector` / `getDeliveryStatuses` / `sendDigestNow` / `githubPreflight` / `listIssues` / `getShipItPreview` / `createPR` (7 invoke) + `integrations:deliveryStatus` (1 event) + `session:seedPrompt` (1 send).

| File | Layer | Role |
|------|-------|------|
| `src/shared/integration-types.ts` | Shared | `IntegrationEvent`, `IntegrationsSettings` (+defaults/merge), connector configs, GitHub DTOs |
| `src/main/integrations/integration-manager.ts` | Main | The hub: state-tap subscriber, routing policy, deep-link builder, digest scheduler |
| `src/main/integrations/connector.ts` | Main | `IConnector` + HTTP→`SendOutcome` mapping (429 Retry-After, 4xx non-retryable) |
| `src/main/integrations/connector-registry.ts` | Main | Registry (mirrors ProviderRegistry) of the four built-in connectors |
| `src/main/integrations/connectors/*.ts` | Main | Telegram (Bot API, HTML), Slack (webhook), Discord (webhook), generic webhook (raw event JSON + HMAC) |
| `src/main/integrations/attention-policy.ts` | Main | Edge-triggered notify policy: arm/disarm + debounce per session |
| `src/main/integrations/delivery-queue.ts` | Main | Per-connector token bucket, backoff retries, bounded drop-oldest queue |
| `src/main/integrations/message-format.ts` | Main | Pure event→text (+Telegram HTML); agent copy never claims "approval" |
| `src/main/integrations/github-service.ts` | Main | `gh` wrapper (execFile + per-dir mutex): preflight, issues, ship-it preview, createPR (one PR per branch) |
| `src/main/session-manager.ts` `addStateListener` / `seedInitialPrompt` | Main | Main-process state fan-out; once-only initialPrompt typing at CLI readiness |
| `src/renderer/hooks/useIntegrations.ts` | Renderer | Settings section CRUD, test pings, live delivery statuses, gh preflight |
| `src/renderer/hooks/useRemoteDeepLink.ts` | Renderer | Remote PWA `?session=` one-shot focus (notification tap-through) |
| `src/renderer/components/shell/IntegrationsPanel.tsx` | Renderer | Connector cards + notify/digest/per-repo-mute config (Cmd+K → "Integrations…") |
| `src/renderer/components/shell/ShipItSheet.tsx` | Renderer | Diff preview → explicit Create PR/draft (cockpit done-items + session menu) |
| `src/renderer/components/shell/IssuePickerSheet.tsx` | Renderer | Issue list → prefilled NewSessionSheet (branch `feat/<n>-<slug>` + initialPrompt) |

## Window & UI Utilities

IPC: `window:*`, `dialog:*`, `shell:*`, `updates:*`, `app:*`

| File | Layer | Role |
|------|-------|------|
| `src/renderer/components/ui/ConfirmDialog.tsx` | UI | Reusable confirmation modal (used for Ctrl+C intercept) |
| `src/renderer/components/ui/ToastContainer.tsx` | UI | Toast notification container |
| `src/renderer/components/ui/Toast.tsx` | UI | Individual toast notification |
| `src/renderer/components/ui/Tab.tsx` | UI | Session tab data type + tab component (used by shell `SessionRail`) |
| `src/renderer/components/ui/CommitDialog.tsx` | UI | Commit message editor with AI generation (used by shell for git commit) |
| `src/renderer/components/ui/ShareIndicator.tsx` | UI | Circular observer-count badge |
| `src/renderer/components/ui/BrandMark.tsx` | UI | App logo mark |
| `src/renderer/components/ui/ProviderBadge.tsx` | UI | Provider identifier badge |
| `src/renderer/components/ui/StatusDot.tsx` | UI | Session status dot indicator |
| `src/renderer/components/ui/ClaudeReadinessProgress.tsx` | UI | Claude startup progress indicator |
| `src/renderer/components/ui/ProgressBar.tsx` | UI | Generic progress bar |
| `src/renderer/components/ui/FieldError.tsx` | UI | Form field error message |
| `src/renderer/components/ui/EmptyState.tsx` | UI | No-sessions welcome screen |
| `src/renderer/components/ui/FeatureShowcase.tsx` | UI | Feature highlight component |
| `src/renderer/components/ui/QuickActionCard.tsx` | UI | Quick action card for empty state |
| `src/renderer/components/ui/RecentSessionsList.tsx` | UI | Recent sessions list for empty/welcome state |
| `src/renderer/components/ui/WelcomeHero.tsx` | UI | Welcome hero for empty state |
| `src/renderer/components/ui/ContextMenu.tsx` | UI | Generic context menu (used by ui/ components) |
| `src/renderer/components/ui/NewSessionDialog.tsx` | UI | Legacy new-session dialog (retained; referenced by TabBar — currently not mounted in App.tsx) |
| `src/renderer/components/ui/TabBar.tsx` | UI | Legacy tab bar (retained; not mounted in App.tsx — shell uses SessionRail) |
| `src/renderer/hooks/useDrag.ts` | Renderer | Hand-rolled pointer-events drag-to-reorder hook (not currently wired to any active shell component) |

## Shared Utilities

| File | Layer | Role |
|------|-------|------|
| `src/shared/claude-detector.ts` | Shared | Detect Claude CLI readiness patterns + generic `isProviderReady()` / `findProviderOutputStart()` |
| `src/main/ansi-strip.ts` | Main | Strip ANSI escape codes from terminal output |
| `src/renderer/utils/variable-resolver.ts` | Renderer | Template variable resolution (`{{clipboard}}`, etc.) |
| `src/renderer/utils/fuzzy-search.ts` | Renderer | Fuzzy string matching |
| `src/renderer/utils/toast.ts` | Renderer | Toast notification utility |
| `src/renderer/utils/layout-tree.ts` | Renderer | Pure layout tree functions (countPanes, traverseTree, etc.) — retained from split-view era; still compiles and tested |
| `src/renderer/styles/globals.css` | Renderer | Global styles — imports tokens.css, animations.css, motion.css, prototype-shell.css then Tailwind layers |
| `src/renderer/styles/tokens.css` | Renderer | CSS custom properties (design tokens) |
| `src/renderer/styles/animations.css` | Renderer | Animation keyframes and utilities |
| `src/renderer/styles/motion.css` | Renderer | Wave 00 named motion gestures |
| `src/renderer/styles/prototype-shell.css` | Renderer | Phase 4 shell CSS |
| `src/renderer/main.tsx` | Renderer | React DOM entry point |

## Testing Infrastructure

### Config & Setup

| File | Role |
|------|------|
| `vitest.workspace.ts` | 3 workspace projects (shared/main/renderer) |
| `playwright.config.ts` | Playwright config for Electron E2E |
| `test/setup-main.ts` | Electron + node-pty mocks for main process tests |
| `test/setup-renderer.ts` | jest-dom + electronAPI reset for renderer tests |
| `test/helpers/electron-api-mock.ts` | Auto-derived electronAPI mock from IPC contract |

### Unit Tests

> Per-file counts below are indicative and drift as tests are added — run `npm test` for the current total (**670 tests across 70 files**).

| File | Tests | Covers |
|------|-------|--------|
| `src/main/session-state/classifier.test.ts` | 13 | State machine: leading-edge working, dwell→done/idle, approval, interrupt veto, exit fusion, alt-screen suppression, dispose |
| `src/main/session-state/alt-screen-tracker.test.ts` | 10 | DECSET ?1049/1047/47 enter/exit, combined params, multiple transitions, reset |
| `src/main/session-state/bell-attention.test.ts` | 12 | Bare vs OSC-terminator BELs, DCS/APC/PM/SOS strings, chunk-boundary splits |
| `src/main/session-state/bell-probe.test.ts` | 8 | BEL context capture, chunk-boundary carry, control-char escaping |
| `src/main/session-state/title-parser.test.ts` | 17 | OSC 0/2 extraction (BEL/ST terminators, splits, payload cap) + task-title extraction (glyph strip, junk rejection, sanitize) |
| `src/shared/state-detector.test.ts` | 26 | Priority order, tail-end anchoring, done-vs-idle bias, multi-line approval ordering |
| `src/shared/line-reducer.test.ts` | 22 | CR/erase/cursor repaint collapse incl. the answered-approval smear case |
| `src/renderer/hooks/useAttentionQueue.test.ts` | 11 | Sort/count, acknowledge + re-arm, cold-attach guard, backgrounded toast |
| `src/main/history-manager.test.ts` | 4 | Readiness gate: shell skip, 8KB give-up, bounded buffering, Claude-banner regression |
| `src/shared/model-detector.test.ts` | 15 | Initial/switch detection, ANSI stripping |
| `src/shared/types/provider-types.test.ts` | 7 | ProviderId, ProviderCapabilities, ProviderInfo structural tests |
| `src/renderer/utils/variable-resolver.test.ts` | 18 | resolveVariables, extractVariables, getMissingVariables |
| `src/renderer/utils/fuzzy-search.test.ts` | 14 | Score tiers, sorting, minScore, highlightMatches |
| `src/renderer/utils/layout-tree.test.ts` | 33 | countPanes, traverseTree, transformTree, pruneTree, grid nodes |
| `src/main/git-manager.test.ts` | 41 | Status parsing, branches, commit, generateMessage, detectErrorCode |
| `src/main/providers/provider-registry.test.ts` | 9 | Auto-registration, get/list/getAvailable, error handling |
| `src/main/providers/claude-provider.test.ts` | 31 | getId, getInfo, buildCommand permutations (incl. LaunchMode switch + agents-mode defense-in-depth), patterns, normalizeModel, env vars, `getStateSignals` false-positive locks |
| `src/main/providers/codex-provider.test.ts` | 16 | getId, getInfo, buildCommand with approval modes, readiness patterns, normalizeModel, launchMode-inertness, `getStateSignals` |
| `src/main/agent-view/availability.test.ts` | 35 | Precedence rules, reason variants, edge cases |
| `src/main/agent-view/probe-version.test.ts` | 6 | Successful version parse, missing binary, non-zero exit, parse-unsafe output, 5s timeout |
| `src/main/ipc-handlers.availability.test.ts` | 7 | Cached-and-return semantics, no-respawn on N calls, IPC wrapper, initial `'probing'` state |
| `src/main/quota-service.test.ts` | 13 | Quota fetching, burn rate calculation, cache |
| `src/main/cli-manager.test.ts` | 2 | PTY spawn wiring, agent-teams env var injection |
| `src/main/path-access.test.ts` | 6 | Home + workspace path allow-listing, Windows normalization |
| `src/shared/session-kind.test.ts` | 2 | `SessionKind` type-level guards (agent vs shell) |
| `src/renderer/components/shell/shell-utils.test.ts` | 8 | Color helpers, status metadata, `isSessionStopped`, formatting |
| `src/renderer/terminal/kitty-keyboard.test.ts` | 23 | Kitty protocol negotiation + key/modifier encoding |
| `src/renderer/terminal/shell-key-rules.test.ts` | 8 | Plain-shell key mapping incl. Ctrl+C pass-through |

### Integration Tests

| File | Tests | Covers |
|------|-------|--------|
| `src/renderer/hooks/useSessionManager.test.ts` | 8 | CRUD, events, output subscribers |
| `src/renderer/hooks/useAgentViewAvailability.test.tsx` | 6 | Initial null/loading state, stays loading when initial fetch returns `'probing'`, success path, rejection synthesizes `detection-failed`, subscribes to push event, unsubscribes on unmount |
| `src/main/session-persistence.test.ts` | 17 | Load/save/clear, validation, atomic write |
| `src/main/session-manager.test.ts` | 33 | Session lifecycle, model events, launchMode/model persistence + restart, spawn-failure gating, early map insert, stale-manager guard + crash status |
| `src/main/ipc-registry.test.ts` | 5 | handle(), on(), removeAll() |
| `src/main/ipc-emitter.test.ts` | 3 | emit(), destroyed window guard |
| `src/main/ipc-handlers.test.ts` | 4 | IPC handler integration |

### Component Tests

| File | Tests | Covers |
|------|-------|--------|
| `src/renderer/components/ui/TabBar.test.tsx` | 7 | Tabs render, active state, callbacks |
| `src/renderer/components/ui/EmptyState.test.tsx` | 5 | Welcome screen, quick actions |
| `src/renderer/components/shell/NewSessionSheet.test.tsx` | 1 | Shell-form submit passes kind=shell + repo path |
| `src/renderer/components/shell/NonGitFolderDialog.test.tsx` | 4 | Renders options, fires onInitGit on initialize-git click |
| `src/renderer/components/ui/CommitDialog.test.tsx` | 11 | Form, validation, commit flow, AI message generation |
| `src/renderer/components/ui/NewSessionDialog.test.tsx` | 8 | Launch-mode picker: three options render, default seeded from workspace, agents available/unavailable, submit-with-each-mode passes correct `launchMode` (uses `vi.hoisted` for stable mock refs) |
| `src/renderer/components/ui/ShareIndicator.test.tsx` | 8 | Renders, count display (0/1/5/9/10+), aria-label, "9+" clamp |

### E2E Tests (Playwright for Electron)

| File | Tests | Covers |
|------|-------|--------|
| `e2e/app-launch.spec.ts` | 4 | Window, title, dimensions, content |
| `e2e/session.spec.ts` | 3 | New session button, dialog |
| `e2e/split-view.spec.ts` | 2 | Single pane default |
| `e2e/keyboard-shortcuts.spec.ts` | 3 | Ctrl+T, Escape, settings |
| `e2e/launch-mode-picker.spec.ts` | 2 | Picker shows three options with agents enabled; picker shows agents disabled when `CLAUDE_CODE_DISABLE_AGENT_VIEW=1`. Evidence: `e2e/screenshots/launch-mode-picker/` |
| `e2e/redesign-journeys.spec.ts` | — | Phase 4 shell journeys: new-session affordance, palette open/close, no-legacy guard |
