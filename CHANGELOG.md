# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-01-29

### Major Release

- Major version bump to v3.0.0
- MissionControl as default landing page with phased workflow navigator
- New mission components: PhaseNavigator, OnboardingFlow, RepoDock, SettingsDrawer
- Phase-specific views: PromptPhase, ReviewPhase, ShipPhase
- Documentation overhaul: added Agent and Tunnel API docs, fixed all drift from v2.0 redesign
- Removed all v1 screen remnants (Auth.tsx, Terminal.tsx, ReviewChanges.tsx, PreShipReview.tsx)
- Removed unused hooks: useApi, useAudioAnalyzer, useFavorites, useNotifications, useVirtualKeyboard, useVoice
- Removed unused utilities: design-system.ts, formatters.ts, sounds.ts
- Removed voiceStore

## [2.0.1] - 2026-01-28

### Fixed

#### Remote Tunnel Access in Development Mode
- Fixed tunnel access showing "UI not built" error when running in dev mode
- HTTP requests now proxy to Vite dev server (port 5173) when client is not built
- WebSocket upgrade requests proxy to Vite for HMR (Hot Module Replacement) support via tunnel
- Added helpful error page when Vite dev server is not running, with clear instructions
- New `setUpgradeFallback()` method in ws-manager for WebSocket proxy routing

### Technical Details
- `src/index.ts`: Added `hasBuiltClient` detection and Vite proxy fallback (lines 85-193)
- `src/core/ws-manager.ts`: Added `setUpgradeFallback()` for non-`/ws` WebSocket handling

## [2.0.0] - 2026-01-28

### Major Redesign

Complete UI/UX redesign focused on reducing modal fatigue, improving code maintainability, and enhancing the review/ship workflow.

### Added

#### Unified Design System
- New design system at `src/ui/app/design-system/` with consistent tokens, primitives, and patterns
- **Tokens**: Semantic color palette (`colors.ts`), spacing scale (`spacing.ts`), typography (`typography.ts`)
- **Primitives**: `Surface` (glassmorphism cards), `Stack` (flex layouts), `Text` (typography component)
- **Compounds**: `Panel` (expandable sections), `Drawer` (side panels), `Stepper` (multi-step flows), `InlineForm`
- **Patterns**: `CommandBar` (unified command input), `StatusStrip` (mobile bottom bar)

#### Terminal UI Store (`terminalUIStore.ts`)
- Centralized overlay management replacing 30+ individual modal states
- Single `activeOverlay` state: `'none' | 'command-palette' | 'settings' | 'export' | 'agents' | 'mcp-approval'`
- Expandable panels management for Activity, Changes, Queue
- Mobile sheet state for responsive bottom sheets
- Context menu, jump menu, and message search state management

#### TerminalV2 - Modular Architecture
- Refactored from 1668 lines to ~300 lines with modular components
- `TerminalLayout.tsx` - Responsive grid/layout structure
- `ConversationArea.tsx` - Messages, composer, search bar
- `SidebarArea.tsx` - Activity feed, changes drawer
- `MobileStatusStrip.tsx` - Mobile bottom bar replacing FAB
- `OverlayManager.tsx` - Renders active overlay based on store state

#### AuthV2 - Stepper Flow
- Single-page stepper pattern with visual progress indicator (1-2-3 dots)
- `AuthStepper.tsx` - Orchestrates the authentication flow
- `AuthMethodPicker.tsx` - Token vs PIN selection with card-style options
- `TokenAuthForm.tsx` - Token input with show/hide toggle
- `PinAuthForm.tsx` - PIN entry component
- `PWAInstallPrompt.tsx` - Non-blocking PWA install prompt after auth
- `AuthSuccess.tsx` - Success state with animation before redirect

#### ReviewV2 - Enhanced Diff Viewer
- `DiffViewerV2.tsx` - Shiki-powered syntax highlighting for 40+ languages
- `FileTree.tsx` - Collapsible directory tree with approval workflow
- `ReviewLayout.tsx` - Responsive 3-column layout (File List | Diff | Summary)
- `ApprovalSummary.tsx` - Approval progress tracking with quick actions
- Toggle between unified and side-by-side diff views
- Line numbers with proper old/new alignment

#### PreShipV2 - Enhanced Safety Workflow
- `SafetyChecklist.tsx` - Warning severity system (critical/warning/info)
- `BranchCompare.tsx` - Visual source→target branch display with ahead/behind counts
- `PRPreview.tsx` - Live PR preview with edit/preview toggle and AI generation
- Expandable warning details with affected files and code snippets
- Blocking warnings prevent shipping until resolved

#### Settings Redesign
- `SettingsLayout.tsx` - Tabbed navigation replacing collapsible sections
- Tabs: Source Control | Services | Remote Access | MCP Servers | Claude Behavior

### Changed

- App.tsx now imports V2 screens (AuthV2, TerminalV2, ReviewChangesV2, PreShipReviewV2)
- Mobile navigation uses StatusStrip pattern instead of FAB (Floating Action Button)
- Overlay management centralized in Zustand store instead of scattered useState hooks

### Technical Details

- Installed `shiki` for syntax highlighting in diff viewer
- Design system uses glassmorphism aesthetic (bg-white/5, ring-1 ring-white/10)
- All V2 components support `useReducedMotion()` for accessibility
- Original v1 screens removed in favor of V2 implementations (Auth.tsx, Terminal.tsx, ReviewChanges.tsx, PreShipReview.tsx)

## [1.1.0] - 2026-01-28

### Added

#### File Review & Approval UI
- Full-screen file review interface at `/review` route for approving changes before shipping
- Individual file approval with prominent "Approve" button in diff viewer header
- "Approve All Files" bulk action for quick approval of all changes
- Progress bar showing approval completion percentage (X% complete)
- Color-coded status dots replacing icons (green=created, yellow=modified, red=deleted, blue=renamed)
- Full file path display in natural order (directory/filename)
- New files now display complete content as additions (previously showed "No changes to display")
- Help text explaining the approval workflow requirement
- Visual feedback: approved files show green tint and "Approved" badge

#### MCP Server Integration
- Full Model Context Protocol (MCP) support for connecting Claude to external tools
- MCP server configuration management (add, edit, delete, enable/disable)
- Support for two transport types: stdio (command-based) and SSE (HTTP-based)
- Automatic tool discovery from connected MCP servers
- Connection status tracking with real-time updates

#### MCP Server Catalog
- Built-in catalog of 15 pre-configured MCP servers
- Catalog browser with category filtering and search
- Server detail sheets with prerequisites and configuration requirements
- 4-step setup wizard for guided server configuration
- Platform-specific prerequisite detection (Windows, macOS, Linux)

#### Catalog Servers Included
- **Development**: GitHub, GitLab
- **Database**: PostgreSQL, MySQL, SQLite, Redis, MongoDB
- **Communication**: Slack
- **Productivity**: Notion, Linear
- **Design**: Figma
- **Monitoring**: Sentry
- **Automation**: Puppeteer
- **Utilities**: Filesystem, Memory

#### MCP API Endpoints
- `GET /api/mcp/servers` - List all configured servers
- `POST /api/mcp/servers` - Create new server
- `PUT /api/mcp/servers/:id` - Update server configuration
- `DELETE /api/mcp/servers/:id` - Delete server
- `GET /api/mcp/servers/:id/status` - Get connection status
- `POST /api/mcp/servers/:id/connect` - Connect to server
- `POST /api/mcp/servers/:id/disconnect` - Disconnect from server
- `GET /api/mcp/tools` - List all available tools
- `GET /api/mcp/settings` - Get global MCP settings
- `PUT /api/mcp/settings` - Update MCP settings
- `GET /api/mcp/catalog` - Get predefined server templates

### Known Limitations
- **MCP tools are not yet available to Claude during terminal sessions.** This release includes MCP server configuration, connection management, and tool discovery. Integration with Claude Code CLI for autonomous tool usage in conversations is planned for a future release.

### Fixed
- Terminal session preservation across app restarts

## [1.0.9] - 2025-01-28

### Added

#### Message Queue Display
- Queue indicator badge shows above Composer when messages are queued during Claude processing
- Expandable Queue Manager Panel with full queue visibility
- Each queued message shows: position number, content preview (60 chars), timestamp, remove button
- "Clear All" action to remove all queued messages at once
- Maximum queue limit of 10 messages with visual feedback when full
- Queue persists across page refreshes

#### Stop/Cancel Running Prompt
- Stop button (red, Square icon) replaces Send button during generation
- Escape key keyboard shortcut to stop Claude mid-generation
- "Press Esc to stop" hint displayed below button during generation
- Partial responses preserved with "[Cancelled by user]" marker appended
- Clean process termination using tree-kill

#### Resume Queue After Stop
- Amber warning controls appear when stopped with queued messages
- "Resume Queue" button to continue processing queued messages
- "Clear Queue" button to discard all pending messages
- Queue does NOT auto-process after stop (requires explicit user action)
- `wasRecentlyStopped` flag tracks manual cancellation state

### Changed
- Queue no longer auto-processes after user cancellation (explicit resume required)
- Send button disabled when queue reaches 10 message limit

## [1.0.0] - 2025-01-27

### Initial Public Release

#### Added
- Web interface for Claude Code CLI with visual tool timeline
- Session persistence and resume capability
- Git worktree isolation for experimental branches
- Guided ship workflow (review, commit, push, PR)
- Multi-repository workspace management
- GitHub and GitLab OAuth integration
- Mobile access via Cloudflare tunnels
- Docker deployment support
- CLI entry point with npm package distribution
- Usage tracking and quota monitoring
- Plan mode with approval workflow
- Cross-platform support (Windows, macOS, Linux)

#### Documentation
- README with installation and usage instructions
- SETUP guide for quick start
- CONTRIBUTING guidelines for developers
- SECURITY policy for vulnerability reporting
- ARCHITECTURE overview

[3.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.0.0
[2.0.1]: https://github.com/carloluisito/claudedesk/releases/tag/v2.0.1
[2.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v2.0.0
[1.1.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.1.0
[1.0.9]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.9
[1.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.0
