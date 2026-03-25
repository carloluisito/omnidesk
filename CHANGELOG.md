# Changelog

All notable changes to OmniDesk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Homebrew/Chocolatey packaging for easier installation
- Development dependency security updates (electron v40+, vite v7+)

---

## [1.1.3] - 2026-03-26

### Fixed
- Ctrl+Shift+C now copies selected text from the terminal (was incorrectly opening the Checkpoint panel)
- Checkpoint panel shortcut reassigned to Ctrl+Shift+K
- Added Checkpoints entry to keyboard shortcuts panel under Panels section

---

## [1.1.2] - 2026-03-25

### Added
- Auto-update support via electron-updater with GitHub Releases integration
- "Check for Updates" button in About dialog now functional with status feedback

### Changed
- App icon updated from old "C" letter to new BrandMark hexagon (installer, taskbar, all platforms)
- "View on GitHub" in About dialog now opens in system browser instead of Electron window
- Icon generation script updated to use BrandMark SVG with built-in ICO builder (no external deps)

---

## [1.1.1] - 2026-03-25

### Added
- Newline insertion in terminal via Ctrl+Enter, Shift+Enter, Alt+Enter, or Cmd+Enter
- `/preflight` command — runs CI-equivalent checks locally before pushing
- `/ship` command — full workflow: branch, preflight, commit, push

### Changed
- Disabled LaunchTunnel and session sharing features (commented out, pending LaunchTunnel service fixes)
- Removed non-functional kebab menu (3 dots) from PaneHeader in split view
- Hidden "Join Session" card from empty state when sharing is unavailable
- `/release` command now auto-checkouts to `main` and pulls latest instead of blocking
- Removed proof PNGs from repository and gitignored them

### Fixed
- Unused `IPCEmitter` and `extractDeepLinkCode` imports causing CI type check failures

---

## [1.1.0] - 2026-03-23

### Added
- Clickable terminal URLs now open in the system browser via `shell.openExternal`
- Home-directory path validation on `writeFile`, `listSubdirectories`, and `createDirectory` IPC handlers (security hardening)
- 6 new Obsidian design tokens in `tokens.css`

### Changed
- Complete design system migration from Tokyo Night to Obsidian palette across the entire UI (~1,275 updated occurrences)
  - Replaced bare hex values, old-palette references, and `var()` fallback hex values
  - Migrated xterm.js terminal theme to Obsidian colors
  - Fixed WCAG AA contrast on ShortcutsPanel category headers
  - Removed dead CSS classes from `App.tsx`
- CI/CD pipelines switched from npm to bun, added type checks, gated packaging on tests, added code signing env vars

---

## [1.0.5] - 2026-03-11

### Fixed
- **CI Electron download 403** — Electron's `install.js` downloads binaries from GitHub and was getting rate-limited (403 Forbidden) without authentication. Added `GITHUB_TOKEN` env to `npm ci` steps in the release workflow.

---

## [1.0.4] - 2026-03-11

### Fixed
- **Windows .exe missing from releases** — Release workflow artifact upload and GitHub Release globs used `*Setup*.exe` which didn't match the custom `artifactName` template (`${productName}-${version}-${arch}.${ext}`). Changed to `*.exe` so the NSIS installer is correctly uploaded and published.

---

## [1.0.3] - 2026-02-28

### Fixed
- **Share panel sync on stop/start** — `SharingManager.stopShare()` now emits `onShareStopped` and `startShare()` emits `onShareStarted`, keeping all `useSessionSharing` hook instances in sync. `ShareSessionDialog` hydrates from main process on open. New `ShareStartedEvent` type + `sharing:shareStarted` IPC event.
- **Git status cross-panel leak** — `GitManager` now populates `workDir` on status-change events; `useGit` filters `onGitStatusChanged` by `projectPath`; `GitPanel` cleans up watcher on unmount/projectPath change. New `workDir?` field on `GitStatus` type.

### Changed
- **IPC contract** — Expanded from ~191 to ~192 methods (added `sharing:shareStarted` event)
- **Test count** — 483 → 487 tests across 33 test files
- **Documentation screenshots** — Updated 5 screenshots (create-session, fuel-status-side-panel, main-screen, settings-workspace, work-space-layout)

---

## [1.0.2] - 2026-02-27

### Fixed
- **Linux build failure** — electron-builder derived `.deb` output path from scoped npm name, creating non-existent `release/@carloluisito/` directory. Added `artifactName` template and `linux.executableName` to fix artifact paths and desktop integration naming.

---

## [1.0.1] - 2026-02-27

### Fixed
- **npm package name** — switched to scoped `@carloluisito/omnidesk` (unscoped `omnidesk` was taken)
- **npm repo link** — added `repository` field to `package.json` for GitHub sidebar linking

### Changed
- **Release artifacts** — renamed from `claudedesk-*` to `omnidesk-*`

---

## [1.0.0] - 2026-02-27

Version reset to 1.0.0 — marks the official start of OmniDesk as an independent product. The GitHub repository has been renamed from `carloluisito/claudedesk` to `carloluisito/omnidesk`. This release consolidates all changes from v5.0.0 and v5.0.1 under the new versioning.

### Added
- **Multi-provider abstraction** — Pluggable provider layer decoupling CLI specifics from session management
  - `IProvider` interface (`src/main/providers/provider.ts`) defining command building, env vars, model detection
  - `ProviderRegistry` with auto-registration of built-in providers
  - `ClaudeProvider` (default) and `CodexProvider` (OpenAI Codex CLI)
  - Provider selector dropdown in NewSessionDialog (shown when >1 provider available)
  - `[CX]` tab badge for Codex sessions
  - `useProvider` hook with conditional UI (hides Claude-only features for non-Claude providers)
  - 3 IPC methods (`provider:*`): list, available, capabilities
  - `src/shared/types/provider-types.ts`: `ProviderId`, `ProviderCapabilities`, `ProviderInfo`
- **OmniDesk rebrand** — Renamed ClaudeDesk → OmniDesk across all branding, config, UI
  - Config directory migrated from `~/.claudedesk/` to `~/.omnidesk/` with automatic migration
  - Centralized `config-dir.ts` with `CONFIG_DIR`, `ensureConfigDir()`, `migrateFromLegacy()`
  - `managedByClaudeDesk` → `managedByOmniDesk` (backward compat read on existing worktrees)
- **Real-time session sharing** — Share live terminal sessions with remote teammates via LaunchTunnel relay
  - `SharingManager` managing host and observer WebSocket lifecycles (`wss://relay.launchtunnel.dev/share/<id>`)
  - Binary frame protocol with 12 frame types (`0x10`–`0x1B`): TerminalData, TerminalInput, Metadata, ScrollbackBuffer, ControlRequest/Grant/Revoke, ObserverAnnounce/List, ShareClose, Ping/Pong
  - Share via tab right-click context menu; generates share code + URL
  - Observers join read-only with scrollback buffer (5000 lines, gzip-compressed)
  - Control request/grant/revoke flow for observer input
  - Metadata broadcast (2s interval), keepalive ping/pong, automatic reconnect
  - Deep link support: `omnidesk://join/<code>` via `app.on('second-instance')` (Windows) and `app.on('open-url')` (macOS)
  - Sharing gated behind LaunchTunnel Pro subscription
  - Observer Ctrl+C (`\x03`) stripped from TerminalInput frames (same safety rule as local sessions)
  - `ShareSessionDialog`, `JoinSessionDialog`, `ObserverToolbar`, `ObserverMetadataSidebar`
  - `ShareManagementPanel`, `ShareIndicator`, `ControlRequestDialog`
  - `useSessionSharing` hook
  - `src/shared/types/sharing-types.ts` with full type definitions
  - 22 IPC methods (`sharing:*`)
- **UI redesign** — Tokyo Night design token system and new component library
  - `ActivityBar` (left sidebar navigation), `StatusBar` (bottom status strip), `SidePanel` (collapsible side panels)
  - New component library: `Button`, `Toast`, `ToastContainer`, `Tooltip`, `ProgressBar`, `StatusDot`, `BrandMark`, `ProviderBadge`
  - `tokens.css` (design token definitions), `animations.css` (shared animation keyframes)
- **`cleanupStaleShares()`** — New method that lists server-side share rooms (`GET /v1/shares`) and deletes any not tracked locally (orphan recovery from crashes or unclean shutdowns)

### Fixed
- **Orphaned share rooms** — `cleanupHostShare()` now sends a fire-and-forget `DELETE /v1/shares/{id}` to the server on all cleanup paths (app shutdown, unexpected WebSocket close, keepalive pong timeout), preventing orphaned share rooms that exhausted the concurrent room limit
- **TIER_LIMIT_EXCEEDED recovery** — `startShare()` now catches `TIER_LIMIT_EXCEEDED` errors, attempts to clean up stale server-side share rooms via `cleanupStaleShares()`, and retries the create if orphans were found
- **Test mock format** — Fixed all 16 sharing-manager test fetch mocks to match the actual API response wrapper format (`{ share: { id, share_code, ... } }`)

### Changed
- **IPC contract** — Expanded from ~166 to ~191 methods (16 domains)
- **Project scale** — ~160 source files, ~51,000 LOC, 16 domains, 16 managers, 483 tests across 33 test files
- **Version reset** — Repository renamed from `claudedesk` to `omnidesk`; version reset from 5.0.1 to 1.0.0

---

## [4.6.0] - 2026-02-19

### Added
- **LaunchTunnel integration** — Expose local ports to the internet via LaunchTunnel (14th domain)
  - `TunnelManager` with hybrid REST API + CLI (`lt preview`) process management
  - API key management with validation, stored in `~/.claudedesk/tunnel-settings.json`
  - Tunnel list with 30s cache, status mapping (API snake_case → camelCase)
  - Account info section (email, plan badge, status)
  - Request log viewer with method/path/status/duration/size columns
  - TunnelPanel (4 views: setup/main/settings/logs), TunnelCreateDialog, TunnelRequestLogs
  - CLI auto-detection via `where`/`which`, `shell: true` for cross-platform spawn
  - Ctrl+Shift+U keyboard shortcut, ToolsDropdown entry with active count badge
  - 17 IPC methods (`tunnel:*`): 13 invoke + 4 events

### Fixed
- **Tunnel spawn ENOENT** — Use `shell: true` in spawn for cross-platform `.cmd` shim compatibility
- **Tunnel status mapping** — API returns `"active"` not `"connected"`; added to `mapApiStatus`
- **Tunnel CLI subcommand** — Fixed `lt preview --port` (was missing `preview` subcommand)
- **Tunnel URL parsing** — Match `URL:` output format from LaunchTunnel CLI (not `your url is:`)
- **API snake_case mapping** — Map `created_at`, `status_code`, `duration_ms` etc. to camelCase
- **Account response unwrapping** — API returns `{"user": {...}}` wrapper; now unwrapped correctly
- **Request logs endpoint** — Reverted from `/requests` back to correct `/logs` path

### Changed
- **IPC contract** — Expanded from 149 to ~166 methods (added 17 tunnel methods)
- **Project scale** — ~150 source files, ~49,000 LOC, 14 domains, 14 managers

---

## [4.5.0] - 2026-02-17

### Added
- **Testing infrastructure** — Vitest 4 + @testing-library/react + Playwright for Electron
  - 250 tests across 20 test files, 3 workspace projects (shared/main/renderer)
  - Auto-derived electronAPI mock from IPC contract
  - E2E tests with Playwright for Electron (app launch, sessions, split view, keyboard shortcuts)
  - CI workflow with coverage artifacts
- **Git integration** — Full Git panel with staging, commits, branches, and real-time status
  - `GitManager` with `child_process.execFile` (shell injection safe), per-directory mutex, `.git` fs.watch()
  - File staging/unstaging (individual + bulk), branch display, commit history log
  - AI commit message generation (heuristic-based conventional commits format)
  - Optional checkpoint creation on commit
  - Ctrl+Shift+G keyboard shortcut, ToolsDropdown entry with staged count badge
  - 30 IPC methods (`git:*`): 26 invoke + 4 events
- **Diff viewer** — Full-screen diff overlay with syntax-highlighted unified diffs
  - Categorized file navigation (staged/unstaged/untracked/conflicted)
  - Dual gutter line numbers, colored add/remove/context lines
  - Keyboard navigation (J/K between files), stage/unstage/discard actions from diff view
  - Unified diff parser (`diff-parser.ts`) with old/new line number tracking
- **Git worktrees** — Worktree management panel with create, remove, and prune operations
  - `WorktreePanel` for listing and managing worktrees
  - `WorktreeCleanupDialog` for cleanup prompts when closing managed worktree sessions
- **Session playbooks** — Automated multi-step prompt sequences (13th domain)
  - `PlaybookManager` (CRUD + persistence), `PlaybookExecutor` (execution engine)
  - 5 built-in playbooks: API endpoint, bug investigation, code review, component creation, refactor
  - Silence-based step completion (3s no output = done), confirmation gates between steps
  - Dynamic parameter forms (text/multiline/select/filepath), variable interpolation
  - PlaybookPicker (fuzzy search), PlaybookEditor (3-tab slide-in), PlaybookProgressPanel (bottom-docked)
  - Import/export playbooks as JSON, library browser for built-in + custom playbooks
  - Persistence: `~/.claudedesk/playbooks.json`
  - Ctrl+Shift+B keyboard shortcut, ToolsDropdown entry
  - 15 IPC methods (`playbook:*`): 12 invoke + 3 events
- **Repository Atlas Engine (RAE)** — Automated CLAUDE.md + repo-index.md generation
  - File enumeration via `git ls-files`, regex import analysis, 3-tier domain inference
  - AtlasPanel UI with idle/scanning/preview states
  - 6 IPC methods (`atlas:*`)

### Fixed
- **Git generate button** — Action bar Generate now auto-opens CommitDialog with the generated message
- **CommitDialog generate button** — Directly sets title from return value instead of relying on fragile useEffect prop chain
- **Silent null guard in useGit** — `generateMessage()` now shows error toast when no project directory is available instead of silently returning
- **Stale generated message** — Generated commit message state is cleared after successful commit

### Changed
- **IPC contract** — Expanded from 102 to 149 methods (118 invoke + 8 send + 23 event)
- **Project scale** — 138 source files, ~45,800 LOC, 13 domains, 13 managers

---

## [4.4.1] - 2026-02-13

### Fixed
- **Burn rate calculation** — Now filters out samples from before quota resets; negative rates clamped to 0

### Added
- **Quota service tests** — Unit tests for `quota-service.ts` covering burn rate calculation, quota reset handling, and edge cases

### Changed
- **Documentation cleanup** — Removed deleted documentation files (agent teams guides, git integration specs, atlas evaluation, atlas UI prototype) and cleaned up dead references in CLAUDE.md and README.md

---

## [4.3.1] - 2026-02-10

### Fixed
- **Documentation updates** - Removed all references to deprecated directory locking and PowerShell features
  - Updated `CLAUDE.md` to reflect simplified shell setup (cmd.exe on Windows, user shell on Unix)
  - Updated `SESSION_POOLING_IMPLEMENTATION.md` to remove directory locking references
  - Updated `CHANGELOG.md` to accurately describe current shell implementation
  - Updated `docs/repo-index.md`

### Changed
- **Shell implementation** - Simplified to use cmd.exe on Windows and user's default shell on Unix
  - Removed directory locking mechanism (CLAUDEDESK_LOCKED_DIR)
  - Removed PowerShell wrapper and line ending conversions
  - Improved session spawning reliability and reduced complexity

---

## [4.1.1] - 2026-02-09

### Changed
- **IPC Abstraction Layer** - Refactored IPC architecture to define each method once and auto-derive everything else
  - New `ipc-contract.ts` — single source of truth for all IPC channels, args, and return types
  - New `ipc-registry.ts` — typed handler registration with automatic cleanup
  - New `ipc-emitter.ts` — type-safe main→renderer push events
  - Reduced `ipc-handlers.ts` from 602 to ~290 lines
  - Reduced `preload/index.ts` from 367 to ~55 lines (auto-generated bridge)
  - Adding a new IPC method now requires changes to 2 files instead of 5

### Removed
- **Legacy terminal API** — Removed deprecated `sendTerminalInput`, `onTerminalOutput`, `resizeTerminal`, `terminalReady` methods
- **Dead IPC channels** — Removed unused `TERMINAL_INPUT`, `TERMINAL_OUTPUT`, `TERMINAL_RESIZE`, `TERMINAL_READY`, `CHECKPOINT_CLEANUP_SESSION` channels
- **Manual cleanup bugs** — 3 handlers that were missing from `removeIPCHandlers()` are now auto-cleaned by the registry

### Fixed
- **IPC handler cleanup** — All registered handlers and listeners are now properly removed on window close (previously 3 handlers were leaked)

---

## [4.1.0] - 2026-02-08

### Added
- **Full 4-pane split view support** - Users can now split panes individually up to 4 total panes
  - Added horizontal split button (⬌) to each pane header - splits pane left/right
  - Added vertical split button (⬍) to each pane header - splits pane top/bottom
  - Split buttons only appear when paneCount < 4
  - Blue hover effect distinguishes split buttons from close button
  - Enables complex layouts: 2x2 grids, 3-pane L-shapes, etc.

### Fixed
- **Split view limitation** - Previously, the toggle split button only supported switching between 1 and 2 panes. While the backend supported 4 panes, there was no UI to access this. Now users can create 3-4 pane layouts by splitting individual panes.

---

## [4.0.0] - 2026-02-08

### 🚨 BREAKING CHANGES

**Complete rewrite**: ClaudeDesk has been rebuilt from the ground up as an Electron desktop application.

**Previous versions (v3.x and below)** were a Docker-based web application. Version 4.0.0 is a **completely different product**:
- **Old (v3.8.6)**: Docker web app running on port 8787
- **New (v4.0.0)**: Electron desktop application with multi-session terminal

**Migration**: There is no migration path. This is a new application. If you need the old Docker version, install `claudedesk@3.8.6`.

### Added - Electron Desktop App

#### Core Features
- **Multi-session management** - Run multiple Claude Code sessions in tabbed interface
- **Split-view terminal** - Up to 4 terminal panes with flexible layouts
- **Simplified shell setup** - Uses `cmd.exe` on Windows and user's default shell on Unix for reliable cross-platform PTY spawning
- **Session persistence** - Automatic save/restore of session state across app restarts
- **xterm.js integration** - Full-featured terminal emulation with rich text support

#### Prompt Templates
- **Command palette** (Ctrl/Cmd+Shift+P) for quick access to prompt templates
- **Built-in templates** - Common tasks like code review, debugging, documentation
- **Custom templates** - Create and edit your own reusable prompts
- **Variable substitution** - Support for `{{clipboard}}`, `{{currentDir}}`, `{{selection}}`, `{{sessionName}}`
- **Fuzzy search** - Quick template filtering in command palette
- **Template editor** - In-app WYSIWYG template management

#### Workspace Management
- **Workspace system** - Save favorite directories for quick session creation
- **Per-session working directories** - Each session maintains its own cwd
- **Default permission modes** - Set preferred Claude access level per workspace

#### API Quota & Monitoring
- **Real-time quota display** - Integration with Claude API to show usage
- **Burn rate tracking** - Monitor spending over time
- **Budget settings** - Set custom budget limits and alerts
- **Session-level tracking** - Optional per-session quota monitoring

#### Session Features
- **Named sessions** - Organize sessions with custom names
- **Session history** - Searchable conversation logs
- **Session export** - Export conversations to markdown
- **Checkpoints** - Save and restore session states
- **Ctrl+C handling** - Graceful termination with confirmation dialog
- **Permission modes** - Ask, Auto-approve, or Auto-deny per session

#### UI/UX
- **Dark theme** - Tokyo Night inspired color scheme optimized for terminal use
- **JetBrains Mono font** - Monospace font for optimal code readability
- **Clickable links** - Automatic URL detection in terminal output
- **Copy/paste support** - Standard keyboard shortcuts
- **Terminal search** - Find text in terminal output
- **Loading indicators** - Clean session initialization with pattern detection
- **Responsive layout** - Adapts to window resizing

#### Settings & Customization
- **Settings dialog** - Centralized app configuration
- **Theme customization** - Adjust colors and terminal appearance
- **Keyboard shortcuts** - Configurable hotkeys
- **Auto-update settings** - Control update preferences

#### Technical
- **Electron 28** - Modern desktop app framework
- **React 18 + TypeScript** - Type-safe, maintainable UI code
- **node-pty** - Cross-platform PTY for shell spawning
- **IPC buffering** - Optimized terminal output with 16ms batching
- **State persistence** - Automatic saving of sessions and settings
- **Context bridge** - Secure renderer-main process communication

#### Platform Support
- **Windows** - cmd.exe integration for reliable session spawning
- **macOS** - Bash/Zsh support with PROMPT_COMMAND hooks
- **Linux** - Full compatibility with major distributions

### Security
- **Local-first architecture** - All data stored on user's machine
- **No telemetry** - Zero usage tracking or data collection
- **HTTPS-only API calls** - Secure communication with Anthropic API
- **Credential privacy** - Reads Claude CLI credentials locally, never logs or transmits them
- **Security policy** - Comprehensive SECURITY.md with vulnerability reporting guidelines

### Documentation
- **Comprehensive README** - Installation, features, quick start, and usage guide
- **LICENSE** - MIT license with full text
- **SECURITY.md** - Security policy and vulnerability reporting
- **CHANGELOG.md** - This file!

### Known Issues
- Development dependency vulnerabilities (electron, vite, electron-builder) - affects dev/build only, not distributed app
- Screenshot placeholders in README - to be added post-release
- No automated tests yet - planned for v1.1.0

---

## Version History

### Versioning Strategy

OmniDesk follows [Semantic Versioning](https://semver.org/):
- **Major (x.0.0)**: Breaking changes, major features, architectural changes
- **Minor (1.x.0)**: New features, non-breaking improvements
- **Patch (1.0.x)**: Bug fixes, security patches, minor tweaks

### Release Process

1. Update CHANGELOG.md with changes
2. Bump version in package.json
3. Create git tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
4. Build packages: `npm run package`
5. Create GitHub Release with binaries and changelog
6. Announce on relevant communities

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on suggesting changes and additions to this changelog.

---

[Unreleased]: https://github.com/carloluisito/omnidesk/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/carloluisito/omnidesk/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/carloluisito/omnidesk/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/carloluisito/omnidesk/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/carloluisito/omnidesk/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/carloluisito/omnidesk/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/carloluisito/omnidesk/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/carloluisito/omnidesk/compare/v4.6.0...v1.0.0
[4.6.0]: https://github.com/carloluisito/omnidesk/compare/v4.5.0...v4.6.0
[4.5.0]: https://github.com/carloluisito/omnidesk/compare/v4.4.1...v4.5.0
[4.4.1]: https://github.com/carloluisito/omnidesk/compare/v4.3.1...v4.4.1
[4.3.1]: https://github.com/carloluisito/omnidesk/compare/v4.3.0...v4.3.1
[4.3.0]: https://github.com/carloluisito/omnidesk/compare/v4.1.1...v4.3.0
[4.1.1]: https://github.com/carloluisito/omnidesk/compare/v4.1.0...v4.1.1
[4.1.0]: https://github.com/carloluisito/omnidesk/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/carloluisito/omnidesk/releases/tag/v4.0.0
