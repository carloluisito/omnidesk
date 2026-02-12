# Changelog

All notable changes to ClaudeDesk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Screenshot capture for README documentation
- Automated tests with Jest/Vitest
- Homebrew/Chocolatey packaging for easier installation
- Development dependency security updates (electron v40+, vite v7+)

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

ClaudeDesk follows [Semantic Versioning](https://semver.org/):
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

[Unreleased]: https://github.com/carloluisito/claudedesk/compare/v4.4.1...HEAD
[4.4.1]: https://github.com/carloluisito/claudedesk/compare/v4.3.1...v4.4.1
[4.3.1]: https://github.com/carloluisito/claudedesk/compare/v4.3.0...v4.3.1
[4.3.0]: https://github.com/carloluisito/claudedesk/compare/v4.1.1...v4.3.0
[4.1.1]: https://github.com/carloluisito/claudedesk/compare/v4.1.0...v4.1.1
[4.1.0]: https://github.com/carloluisito/claudedesk/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v4.0.0
