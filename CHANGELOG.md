# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.8.3] - 2026-02-03

### Added

#### Worktree Session Close Confirmation
- **CloseWorktreeDialog** component providing safe worktree management with three clear options:
  - **Keep worktree** (recommended) — Close session but preserve worktree directory for later resumption
  - **Delete worktree only** — Remove worktree directory, keep branch for checkout
  - **Delete worktree and branch** — Complete cleanup when feature work is done
- Smart context-aware warnings displaying:
  - Uncommitted changes with file count
  - Unpushed commits with commit count
  - Active PR information with PR number
  - Protected branch detection (main/master/develop)
  - Session running state blocking close
- Educational expandable section explaining worktree concepts and implications
- Full keyboard navigation (Tab, Arrow keys, Enter, Escape) and screen reader support with ARIA labels
- Color-coded radio options (green/amber/red) matching action severity
- Monospace fonts for technical details (paths, branches) with terminal-inspired styling
- Toast notifications confirming action taken after session close
- Promise-based async flow ensuring UI properly waits for dialog confirmation before completing close operation

#### Workflow Phase Enforcement
- Workflow phase tracking per session (prompt/review/ship) with phase change timestamps
- `WorkflowSettings` schema with configurable enforcement, default phase, auto-reset, and notification preferences
- Per-session workflow enforcement override capability
- Workflow phase synchronization via WebSocket broadcasts
- Settings UI for workflow configuration in System settings
- API endpoints: `GET /workspaces/:id/workflow`, `PATCH /workspaces/:id/workflow`

### Changed
- **Session close handler** (`MissionControl.tsx`) now checks `worktreeMode` and `ownsWorktree` before showing confirmation dialog
- Non-worktree sessions and borrowed worktrees close immediately without interruption (preserves original behavior)
- Dialog only appears for sessions that own their worktree, preventing accidental data loss

### Fixed
- **OAuth App access restrictions in ship-summary endpoint** (`terminal-routes.ts:3556-3712`) — When checking for existing PRs, the code now detects "no pull requests found" errors from `gh pr view` and skips GitHub API fallback. Previously, the API fallback always triggered even when `gh` CLI simply didn't find a PR (expected behavior), causing 403 errors for organizations with OAuth App access restrictions. The fix:
  - Added `noPRFound` flag detection for "no pull requests found" message (line 3584-3587)
  - Only attempts API fallback if `gh` CLI failed for reasons other than missing PR (line 3592)
  - Added improved error logging for OAuth restrictions (line 3706-3711)
- **OAuth error detection in PR creation** (`github-integration.ts:229-244`) — Updated `parseGitHubError` to recognize "oauth app access restrictions" message pattern and classify as `ORG_ACCESS_REQUIRED` error type. Previously, this specific error message wasn't detected, preventing proper fallback to `gh` CLI. Now enables automatic fallback chain: OAuth token → PAT (if configured) → `gh` CLI for organizations with OAuth restrictions.
- **Worktree session close async flow** — Fixed bug where clicking X to close a worktree session would cause the UI to think the close operation completed immediately, before the user made a choice in the dialog. The async `handleCloseSession` function now returns a Promise that resolves only when user confirms an option or cancels the dialog, ensuring:
  - RepoDock closing animation completes properly
  - UI correctly waits for dialog interaction
  - Session is only closed when user confirms (not when dialog opens)
  - Promise resolves on both confirm and cancel actions

## [3.8.2] - 2026-02-03

### Fixed
- **Budget Allocator Burn Rate Calculation** — Fixed burn rate displaying "Calculating... Need at least 2 data points" when sufficient historical data exists. The `getBurnRate()` function now requires a minimum 1-minute time delta between samples for reliable calculations and gracefully returns 0%/h (stable usage) instead of null when samples have identical values or insufficient time separation. The improved algorithm searches backwards through history to find samples with adequate time delta, preventing false "insufficient data" messages when usage is stable.

## [3.8.1] - 2026-02-03

### Fixed
- **Budget Allocator Cost Estimation** — Fixed inflated per-message cost estimates that were showing up to 22% for minimal conversations. The `estimateMessageCost()` function was incorrectly dividing total quota change (from recent history samples) by global API call count (all-time total), creating a mismatch between time windows. Now calculates average quota increase between consecutive utilization samples for accurate estimates. Each sample represents approximately one API call, providing proper per-message cost calculation based on recent usage patterns.

## [3.8.0] - 2026-02-03

### Added

#### GitHub Hybrid Authentication (PAT + OAuth)
- Personal Access Token (PAT) storage and management for GitHub organization repositories
- Secure token encryption using AES-256-GCM with machine-specific key derivation (PBKDF2)
- Automatic OAuth → PAT fallback when organization access is restricted
- GitHub API fallback for PR detection when `gh` CLI is not available
- Token validation and expiration tracking with visual indicators
- GitHubPATSettings component for configuring PATs per workspace in Settings → Integrations
- TokenInputField reusable component with masking, show/hide toggle, and clipboard support
- OrgAccessErrorModal providing clear guidance for organization access issues with dual options (PAT recommended, OAuth approval alternative)
- API endpoints: `POST /workspaces/:id/github-pat/test`, `POST /workspaces/:id/github-pat`, `GET /workspaces/:id/github-pat/status`, `DELETE /workspaces/:id/github-pat`
- Core module: `token-encryption.ts` for secure token storage with encryption/decryption utilities
- Extended workspace schema with `githubPAT` field (encryptedToken, username, scopes, expiresAt, createdAt)
- ShipPhase auto-displays organization access modal when OAuth lacks org permissions

#### Budget Allocator & Usage Management
- Budget allocation system for managing Claude API usage across terminal sessions
- BudgetAllocatorSettings component for configuring budget limits and degradation thresholds
- BudgetDashboard with real-time usage tracking and wallet gauge visualization
- BudgetLimitModal for setting session-specific budget caps
- DegradationBanner and DegradationPanel for graceful performance reduction when approaching limits
- PreSendCostIndicator showing estimated token costs before message submission
- QueueBudgetPanel for monitoring queued messages and budget impact
- WalletGauge component with color-coded budget utilization display
- Core module: `allocator-manager.ts` for centralized budget tracking and enforcement

#### Documentation & Visual Assets
- Added agent chaining workflow diagram (`docs/agents-chaining.jpg`) illustrating multi-agent collaboration patterns

### Changed
- Enhanced GitHub PR/MR detection with multi-layer fallback strategy: gh CLI → GitHub API (OAuth) → GitHub API (PAT)
- Updated `createPRWithToken()` to support `fallbackToPAT` parameter for automatic retry with PAT on org access errors
- Organization access errors now trigger modal UI with actionable next steps instead of inline error text
- Integrations settings screen dynamically shows PAT configuration for workspaces with GitHub OAuth connected

### Fixed
- Fix existing PR not showing in ShipPhase when `gh` CLI is unavailable — added GitHub API fallback that queries `/repos/:owner/:repo/pulls` endpoint with OAuth or PAT tokens
- Fix organization repository access failures with clear user guidance — OAuth apps require admin approval for org access, PAT provides immediate alternative

## [3.7.1] - 2026-02-02

### Added
- Context management for ideas — ideas now track token usage via the shared `contextManager`, with real-time context utilization gauge in the IdeaComposer and context-full warning banner above messages when utilization reaches 85%
- REST-based context state fetch for ideas — `IdeaView` fetches context via `GET /api/ideas/:id/context` on mount and when messages change, providing immediate context data without waiting for a WS push
- API endpoints: `GET /api/ideas/:id/context` (get context state), `POST /api/ideas/:id/context/summarize` (trigger Haiku summarization)
- `fetchContextState` action added to `ideaStore` for on-demand context state retrieval
- Refactored `ContextGauge` component to accept optional `contextState` and `onSummarize` props, enabling reuse across both session and idea views
- `promoted` status added to `IdeaStatus` type — ideas that graduate to projects are marked as promoted and excluded from the dock and idea panel

### Changed
- PromoteModal "Repository Location" field replaced from free-text directory input with a workspace dropdown selector — lists workspaces from `appStore.workspaces` by name and scan path, auto-selects first workspace, prevents "not under an allowed base path" validation errors
- Removed non-functional Browse button (FolderOpen icon) from PromoteModal

### Fixed
- Fix idea promotion not navigating to new session — after `promoteIdea()` succeeded, the `onPromote` callback only closed the modal without creating a session or switching views. Now reloads app data, closes the idea tab, and creates a terminal session for the promoted repo.
- Fix promoted idea tab persisting in dock — `clearActiveIdea()` only nulled the active pointer without removing the idea from `openIdeaIds`. Replaced with `closeIdea()`. Additionally, the dock filter `i.status === 'saved'` always showed promoted ideas; now excludes `status === 'promoted'` ideas from the dock.
- Fix idea chat history not transferring to promoted session — the backend built a `handoffSummary` from idea messages but never returned it. Now `promoteIdea()` returns `handoffSummary` in the API response, the frontend passes it through `createSession()`, and the terminal route sets it on the session object. The existing `buildPromptWithContext` handoff injection (for sessions with ≤2 messages) provides the context to Claude automatically.
- Fix idea chat using fixed `max-w-3xl` width instead of full-width layout — IdeaView messages area and composer now use `w-full` matching PromptPhase
- Fix idea messaging not working — `require()` call in ideaStore's `getWebSocket()` fails silently in Vite's ES module bundler, causing all WebSocket operations (send message, subscribe, cancel, set mode) to be no-ops. Replaced with explicit store reference pattern via `setTerminalStoreRef()`.
- Fix idea real-time updates not reflecting in UI — two root causes: (1) `registerIdeaWSHandlers` did not re-subscribe ideas on WebSocket reconnect, so `broadcastToSession` found zero subscribers and silently dropped messages; now wraps `ws.onopen` to re-subscribe all `openIdeaIds` on every (re)connect. (2) `useTerminal` connect effect had `isConnected` in its dependency array, causing a connect/disconnect oscillation loop that destroyed subscriptions; removed `isConnected` from deps since reconnection is already handled by `terminalStore`'s `onclose` retry.

## [3.7.0] - 2026-02-01

### Added

#### Idea Building (Repo-Free Ideation Sessions)
- First-class "Idea" concept — chat-first brainstorming spaces that don't require a repository, workspace, or git
- Ideas start ephemeral (memory only) and can be pinned/saved to `config/ideas.json` for persistence
- Purple accent color and lightbulb iconography distinguish ideas from terminal sessions
- IdeaView: pure chat interface with Claude for open-ended brainstorming
- IdeaTitleBar: inline title editing with Save, Attach, and Promote action buttons
- IdeaPanel: right sidebar (Ctrl+B) with search, filtering, and idea cards showing status badges
- RepoDock: idea pills appear alongside session pills with purple highlight, dropdown [+] menu for "New Idea" / "New Session"
- Repo attachment: link ideas to existing repos for read-only codebase context without modification
- Idea promotion: two-step modal to graduate ideas into full projects (git init + session creation with optional scaffold)
- Usage quota chips displayed on idea view headers
- Keyboard shortcuts: `Ctrl+Shift+I` (create new idea), `Ctrl+B` (toggle idea panel)
- Core module: `idea-manager.ts` singleton for idea lifecycle, Claude invocation, WebSocket handlers, and persistence
- REST API: 9 endpoints at `/api/ideas` (create, list, get, update, delete, save, cancel, promote, attach/detach)
- WebSocket events: `subscribe-idea`, `unsubscribe-idea`, `idea-message`, `idea-cancel`, `idea-set-mode`
- Zustand store: `ideaStore.ts` with `openIdeaIds` tracking for dock persistence across focus changes
- New types: `Idea`, `IdeaStatus`, `IdeaChatMessage`, `IdeaQueuedMessage`, `PromoteOptions`
- Empty state dual CTAs: "New Idea" and "New Session" buttons with keyboard hints
- Recent saved ideas displayed as quick-access cards on the empty state screen

## [3.6.0] - 2026-02-01

### Added

#### Smart Context Management
- Real-time token budget tracking with context utilization gauge in terminal composer
- Auto-summarization using Claude Haiku when context reaches 70% utilization (configurable)
- Session split suggestion banner when context reaches 85% utilization
- Parent/child session linking with handoff summaries for split sessions
- New `context` settings object with 6 configuration options (autoSummarize, thresholds, verbatimRecentCount, maxMessageLength, maxPromptTokens)
- Context Management settings UI panel in Settings > System with toggle, sliders, and number inputs for all context options
- Context gauge UI component with color-coded progress bar (green/yellow/orange/red), percentage display, and manual summarize button
- Context split banner with one-click session splitting and shared worktree support
- API endpoints: `GET /api/terminal/sessions/:id/context`, `GET /api/terminal/sessions/:id/context/summaries`, `POST /api/terminal/sessions/:id/context/summarize`, `POST /api/terminal/sessions/:id/context/split`
- Settings API endpoints: `GET /api/settings/context`, `PUT /api/settings/context`
- WebSocket events: `context_state_update`, `context_split_suggested`
- Core module: `context-manager.ts` for token estimation, summarization orchestration, and session context tracking
- `--model` flag support in `claude-invoker.ts` for model-specific invocations (used by Haiku summarization)

### Changed
- Improved Settings drawer performance with lazy-loaded tabs (`React.lazy` + `Suspense`)
- Removed `backdrop-blur-sm` from settings drawer backdrop to eliminate GPU overhead
- Settings tabs now stay mounted once visited (keep-mounted pattern) to avoid data re-fetching on tab switch
- Separated Docker API calls from fast settings loads in Integrations page for faster initial render
- Fixed `useState` antipattern in System settings (was executing API call during render instead of in `useEffect`)
- Renamed `interval` state variable in System.tsx to `checkInterval` to avoid shadowing global `setInterval`
- Rewrote `buildPromptWithContext()` with tiered context: summary prefix + recent verbatim messages + current request, with progressive trimming when over token budget
- Increased default `maxMessageLength` from 2000 to 4000 characters

## [3.5.0] - 2026-01-31

### Changed
- Worktree creation is now mandatory for all single-repo sessions (previously optional)
- Backend auto-generates worktree options when none provided for git repositories
- Removed worktree opt-in toggle from session creation modal

### Added
- Git initialization flow for non-git repositories
- "Initialize Git" button in session creation modal for repos without git
- `POST /api/terminal/repos/:repoId/git-init` endpoint to initialize git repositories
- `hasGit` property on auto-discovered repositories
- Workspace scan paths now included in repository path validation

### Fixed
- Flash of onboarding screen on cache clear (now checks `isLoadingAppData`)
- Git command errors on non-git or empty repositories (added guards for branches/worktrees endpoints)

### Removed
- `SessionCreationCard.tsx` component (from `home/` directory)
- `WorktreeOptions.tsx` component (from `home/` directory)

## [3.4.2] - 2026-01-31

### Fixed
- Review phase showing empty diffs for untracked directories in repositories with no commits
- Missing insertions/deletions statistics for files in git-status endpoint

### Changed
- git-status endpoint now expands directory entries (paths ending with `/`) into individual file listings with full stats
- file-diff endpoint now handles directory paths by generating combined diffs for all files within the directory

### Added
- Helper functions for directory enumeration, line counting, and file statistics computation
- Support for computing insertions/deletions for untracked files using line counts

## [3.4.1] - 2026-01-31

### Fixed
- Removed WebSocket token authentication. Connections to `/ws` no longer require a token via query parameter or `Sec-WebSocket-Protocol` header.
- Simplified `WSClient` interface by removing `token` field.

## [3.4.0] - 2026-01-30

### Added

#### Agent Management
- Full CRUD for custom agents: create, edit, and delete user-defined agents via UI and API (`POST /api/agents`, `PUT /api/agents/:agentId`, `DELETE /api/agents/:agentId`)
- Agent form modal with name, description, model selection, color picker, and system prompt editor
- Delete confirmation modal with safety check (built-in agents cannot be deleted)
- `GET /api/agents/:agentId/raw` endpoint to retrieve full agent markdown for editing
- Agent pinning for quick access to frequently used agents
- Agent usage tracking with `config/agent-usage.json` (auto-created)

#### Agent Chaining
- Sequential multi-agent chain execution (2–5 agents per chain)
- Chain builder UI with drag-to-reorder agent selection
- Real-time chain progress indicator showing current agent execution status
- Chained message rendering with per-segment output display
- WebSocket events: `chain-segment-start`, `chain-segment-complete`
- Each agent receives the previous agent's output as context (truncated to 100k chars)

#### Authentication Endpoints
- `GET /api/auth/session` — cookie-based session validation for PWA re-authentication
- `POST /api/auth/pin/generate` — generate 6-digit pairing PIN for device pairing
- `POST /api/auth/pin/validate` — validate PIN and return auth token (sets session cookie)
- `GET /api/auth/pin/status` — check active PIN status
- `DELETE /api/auth/pin` — invalidate current PIN

#### Documentation
- Added Authentication Endpoints section to README API Reference
- Added `VITE_DEV_PORT` and `CLAUDEDESK_TOKEN` to SETUP.md and README environment tables
- Fixed health endpoint documentation to include `update` object in response
- Fixed SETUP.md CLI flags (removed non-existent short flags `-p`, `-d`, `-h`, `-v`)

## [3.3.0] - 2026-01-30

### Added

#### CI/CD Pipeline Monitoring
- Automatic monitoring of GitHub Actions and GitLab CI pipelines after shipping code
- Real-time pipeline status via WebSocket (`pipeline:status`, `pipeline:complete`, `pipeline:stalled`, `pipeline:error`)
- Error categorization: test_failure, build_error, lint_error, type_error, timeout
- "Fix CI" prompt composition with log excerpts (last 200 lines)
- Exponential backoff polling (10s → 15s → 22s → 30s cap)
- Max 10 concurrent monitors, 90s stall detection
- Persistent state in `config/pipeline-monitors.json`
- Settings UI panel: Settings > CI/CD (auto-monitor toggle, poll interval, max duration, notifications)
- Token resolution: GitHub (`gh auth token`, `GITHUB_TOKEN`), GitLab (`glab auth token`, `GITLAB_TOKEN`, workspace OAuth)

#### System Management
- Auto-open browser on startup with `--no-open` flag to disable
- Update checker with configurable auto-check interval (default: 6 hours)
- `--check-update` CLI flag for manual version check
- `--update` CLI flag to install updates (auto for global npm, manual instructions for other methods)
- Cache management system with `--clear-cache [type]` CLI flag (sessions, artifacts, worktrees, usage, all)
- System API routes (`/api/system/*`) for update checking and cache management
- Cache management UI in Settings > System
- WebSocket `system:update-available` event for update notifications

### Fixed
- Newly created files showing "No changes" in Review phase instead of file content. The `file-diff` endpoint now falls back to `git diff --cached` and direct file read for untracked/new files, formatting content as a unified diff with all lines as additions.
- Removed redundant duplicate loading indicators (blue activity bar and bouncing dots) from PromptPhase — activity status is already shown inline in MessageItem.

## [3.1.0] - 2026-01-29

### Added
- Mobile responsive layout improvements for mission phases
- Updated favicon

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

[3.6.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.6.0
[3.5.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.5.0
[3.4.2]: https://github.com/carloluisito/claudedesk/releases/tag/v3.4.2
[3.4.1]: https://github.com/carloluisito/claudedesk/releases/tag/v3.4.1
[3.4.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.4.0
[3.3.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.3.0
[3.1.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.1.0
[3.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v3.0.0
[2.0.1]: https://github.com/carloluisito/claudedesk/releases/tag/v2.0.1
[2.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v2.0.0
[1.1.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.1.0
[1.0.9]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.9
[1.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.0
