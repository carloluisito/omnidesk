# ClaudeDesk Architecture

Technical architecture documentation for ClaudeDesk v3.2.0 - an AI-powered development platform with Claude terminal interface.

## Overview

ClaudeDesk is a local-first development platform that provides a web-based interface for interacting with Claude Code CLI. It consists of three main layers:

1. **Express Backend** - REST API + WebSocket server for real-time communication
2. **React Frontend** - Single-page application with Zustand state management
3. **Claude Code CLI** - Anthropic's official CLI spawned as child processes

The architecture enables developers to:
- Run Claude Code sessions against git repositories with isolated worktrees
- Stream Claude's responses and tool usage in real-time via WebSocket
- Manage multiple concurrent sessions with session persistence
- Run and preview applications with optional Cloudflare tunnels

## System Architecture Diagram

```
+------------------+                  +----------------------+
|                  |    WebSocket     |                      |
|   React UI       |<---------------->|   Express Server     |
|   (Vite + TS)    |    REST API      |   (Node.js)          |
|                  |                  |                      |
+------------------+                  +----------------------+
        |                                      |
        |                                      |
        v                                      v
+------------------+                  +----------------------+
|                  |                  |                      |
|  Zustand Stores  |                  |   Core Modules       |
|  - terminalStore |                  |   - terminal-session |
|  - appStore      |                  |   - claude-invoker   |
|  - runStore      |                  |   - git-sandbox      |
|                  |                  |   - app-manager      |
+------------------+                  +----------------------+
                                               |
                                               | spawn
                                               v
                                      +----------------------+
                                      |                      |
                                      |   Claude Code CLI    |
                                      |   (stream-json)      |
                                      |                      |
                                      +----------------------+
                                               |
                                               v
                                      +----------------------+
                                      |                      |
                                      |   Git Repositories   |
                                      |   (worktrees)        |
                                      |                      |
                                      +----------------------+
```

### Real-Time Communication Flow

```
User Message
     |
     v
+----+----+      WebSocket       +----------+      stdin      +-------------+
| Browser | ------------------> | Express  | --------------> | Claude CLI  |
+----+----+  type:'message'     | Server   |     prompt      | (spawned)   |
     ^                          +----+-----+                 +------+------+
     |                               |                              |
     |  type:'chunk'                 |  stream-json                 |
     |  type:'tool-start'            |  stdout parsing              |
     +-------------------------------+<-----------------------------+
```

## Backend Architecture

### Entry Point: `src/index.ts`

The server entry point initializes:
- Express application with JSON middleware
- Authentication and rate limiting middleware
- HTTP server for WebSocket upgrade
- WebSocket server via `ws-manager.ts`
- Graceful shutdown handlers for process cleanup

```
Port: 8787 (configurable via CLAUDEDESK_PORT)
WebSocket: ws://localhost:8787/ws
```

#### Dev Mode vs Production Mode

The server operates differently based on whether the client is built:

**Production Mode** (`hasBuiltClient = true`):
- Serves static files from `dist/client/`
- SPA fallback serves `index.html` for all non-API routes
- Used when running `npm run build && npm start`

**Development Mode** (`hasBuiltClient = false`):
- Proxies HTTP requests to Vite dev server on port 5173
- Proxies WebSocket upgrades to Vite for HMR (Hot Module Replacement)
- Shows helpful error page if Vite is not running
- Used when running `npm run dev` (both Express + Vite concurrently)

This dual-mode architecture enables Cloudflare tunnels to work in both environments:
- In production: Tunnel → Express → Static files
- In development: Tunnel → Express → Vite proxy → React app with HMR

### API Routes

| Router | Path | Purpose |
|--------|------|---------|
| `routes.ts` | `/api/*` | Main API - repos, health, settings, scan paths |
| `terminal-routes.ts` | `/api/terminal/*` | Session CRUD, git operations, file uploads |
| `app-routes.ts` | `/api/apps/*` | Running app lifecycle, logs, Docker/monorepo info |
| `workspace-routes.ts` | `/api/workspaces/*` | Workspace management, GitHub/GitLab OAuth |
| `settings-routes.ts` | `/api/settings/*` | User preferences, favorites, recent repos |
| `docker-routes.ts` | `/api/docker/*` | Shared Docker environment management |
| `skill-routes.ts` | `/api/skills/*` | Custom skill definitions and execution |
| `agent-routes.ts` | `/api/agents/*` | Agent management, detection, and usage tracking |
| `tunnel-routes.ts` | `/api/tunnel/*` | Remote tunnel control, QR code generation |
| `mcp-routes.ts` | `/api/mcp/*` | MCP server configuration and tool management |
| `system-routes.ts` | `/api/system/*` | Update checking and cache management |

### Core Modules

#### `terminal-session.ts` - Session State Machine

Manages the lifecycle of Claude terminal sessions:

```
States: idle -> running -> idle | error
```

Key responsibilities:
- Session creation with optional git worktree isolation
- Message queue management (messages sent while Claude is busy)
- WebSocket handler registration (subscribe, message, set-mode, cancel, etc.)
- Session persistence to `config/terminal-sessions.json`
- Process limits: MAX_TOTAL_SESSIONS=50, MAX_ACTIVE_PROCESSES=5

Session types:
- **Standard**: Works directly in repo directory
- **Worktree**: Creates isolated git worktree for changes (recommended)

**Message Queue Management:**
- MAX_QUEUE_SIZE: 10 messages (hardcoded limit)
- Messages sent while Claude is running are queued automatically
- Queue is FIFO (first-in, first-out)
- `wasRecentlyStopped` flag: Set to `true` when user cancels operation
  - Prevents automatic queue processing after cancellation
  - Enables resume controls in UI
  - Cleared when user sends new message or explicitly resumes queue
- Queue actions:
  - `clearQueue()` - Removes all queued messages, clears wasRecentlyStopped flag
  - `resumeQueue()` - Clears wasRecentlyStopped flag, triggers queue processing
  - `removeFromQueue(messageId)` - Removes specific message from queue
- WebSocket handlers: `clear-queue`, `resume-queue`, `remove-from-queue`

#### `claude-invoker.ts` - Claude CLI Integration

Spawns and communicates with Claude Code CLI:

```typescript
// CLI invocation
claude --dangerously-skip-permissions -p --output-format stream-json --verbose -
       ^-- skip prompts           ^-- print mode  ^-- JSON streaming    ^-- stdin
```

Stream-JSON event parsing:
- `message_start` - Captures model info
- `content_block_delta` - Text streaming chunks
- `content_block_start` - Tool use start (Read, Edit, Bash, etc.)
- `result` - Completion with session_id for resume, usage stats
- `error` - Error events

Features:
- Session resume via `--resume <session_id>` flag
- Git credential injection for OAuth-enabled workspaces
- Clean PATH to prevent dependency conflicts with spawned processes
- Prompt via stdin to avoid command-line escaping issues

#### `git-sandbox.ts` - Git Operations

Provides safe git operations with worktree support:

**Branch Operations:**
- `createSandbox()` - Create feature branch from main/master
- `getCurrentBranch()` / `branchExists()` - Branch queries
- `push()` - Commit and push changes

**Worktree Operations:**
- `createWorktree()` - Create isolated worktree for session
- `removeWorktree()` - Clean up worktree and optionally delete branch
- `pushWorktree()` - Commit changes and push or merge locally

**Conflict Handling:**
- `canMergeCleanly()` - Pre-check for merge conflicts
- `getConflictingFiles()` / `resolveConflict()` - Conflict resolution
- `startMergeForResolution()` / `completeMerge()` - Merge workflow

#### `ws-manager.ts` - WebSocket Server

Manages real-time client connections:

```typescript
interface WSClient {
  id: string;
  ws: WebSocket;
  token: string;
  subscribedSessions: Set<string>;
  isAlive: boolean;  // Heartbeat tracking
}
```

**Upgrade Request Routing:**

WebSocket upgrade requests are routed by pathname:
- `/ws` → ClaudeDesk WebSocket (authenticated, handled internally)
- Other paths → Delegated to `upgradeFallback` handler (if set)

```typescript
// Set fallback for non-/ws WebSocket upgrades (used for Vite HMR proxy)
wsManager.setUpgradeFallback((request, socket, head) => {
  // Proxy to Vite dev server for HMR support via tunnel
});
```

In dev mode, the fallback proxies WebSocket connections to Vite (port 5173) to enable Hot Module Replacement through Cloudflare tunnels.

**Message types:**
- `subscribe` / `unsubscribe` - Session subscription
- `message` - Send user message to Claude
- `set-mode` - Toggle plan/direct mode
- `cancel` - Cancel running operation
- `approve-plan` - Execute approved plan with answers

**Broadcasting:**
- `broadcastToSession()` - Send to all clients subscribed to a session
- `broadcastAll()` - Send to all connected clients

Authentication via `Sec-WebSocket-Protocol` header (preferred) or query param (deprecated).

#### `app-manager.ts` - Running App Lifecycle

Manages running application processes:

```typescript
interface RunningApp {
  id: string;
  repoId: string;
  status: 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED';
  localUrl?: string;
  tunnelUrl?: string;
  detectedPort?: number;
  logs: string[];
}
```

Features:
- Port detection from stdout patterns (e.g., "listening on port 3000")
- Log buffering (MAX_LOG_LINES=10000)
- Cloudflare tunnel integration via `tunnel-manager.ts`
- Monorepo service detection (pnpm workspaces, packages/, apps/)
- Docker configuration detection

#### `update-checker.ts` - Version Update System

Manages automatic version checking and updates:

Key responsibilities:
- Periodic polling of the npm registry for new versions
- Install method detection (global-npm, npx, docker, source)
- Auto-update via `npm install -g` for global npm installs
- Manual update instructions for other install methods
- WebSocket broadcast of `system:update-available` events
- Configurable check interval (default: 6 hours)

## Frontend Architecture

### Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Zustand** - State management
- **TailwindCSS** - Styling
- **Framer Motion** - Animations
- **react-router-dom** - Client-side routing

### Zustand Stores

#### `terminalStore.ts` - Terminal Session State

Primary store managing Claude terminal interactions:

```typescript
interface TerminalStore {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  isConnected: boolean;
  ws: WebSocket | null;
  pendingAttachments: Map<string, PendingAttachment[]>;
  // ... actions
}
```

Key actions:
- `createSession()` - Create new session (single or multi-repo)
- `sendMessage()` - Send message via WebSocket
- `cancelOperation()` - Cancel running Claude process
- `approvePlan()` - Approve plan mode output with answers
- `clearQueue()` - Clear all queued messages
- `resumeQueue()` - Resume queue processing after stop

WebSocket message handling:
- `session-state` - Full session sync (includes `wasRecentlyStopped` flag)
- `message` / `chunk` - Streaming message updates
- `tool-start` / `tool-complete` - Tool activity tracking
- `file-change` - File modification tracking
- `usage-update` - Token and cost tracking
- `queue-updated` - Queue state changes
- `cancelled` - Operation cancellation confirmed

#### `appStore.ts` - Application State

Global app state with persistence:

```typescript
interface AppState {
  token: string | null;
  repos: RepoConfig[];
  workspaces: Workspace[];
  // ... actions
}
```

Uses `zustand/middleware/persist` for token persistence in localStorage.

#### `runStore.ts` - Running Apps State

Manages running application state:

```typescript
interface RunStore {
  apps: RunningApp[];
  dockerStatus: DockerStatus | null;
  // ... actions
}
```

Key actions:
- `startApp()` / `stopApp()` / `restartApp()` - App lifecycle
- `getAppLogs()` - Fetch app logs
- `loadMonorepoInfo()` / `loadDockerInfo()` - Project detection
- `extractSignals()` - Parse warnings/errors from logs

#### `terminalUIStore.ts` - Terminal UI State

Centralized overlay and panel management, replacing 30+ individual useState hooks:

```typescript
interface TerminalUIState {
  activeOverlay: 'none' | 'command-palette' | 'settings' | 'export' | 'agents' | 'mcp-approval';
  expandedPanels: Set<'activity' | 'changes' | 'queue'>;
  mobileSheet: 'actions' | 'preview' | null;
  contextMenu: { x: number; y: number; items: MenuItem[] } | null;
  jumpMenu: { isOpen: boolean; filter: string };
  messageSearch: { isOpen: boolean; query: string; results: Message[] };
  splitView: { enabled: boolean; ratio: number };
}
```

Key actions:
- `openOverlay()` / `closeOverlay()` - Single overlay management (only one at a time)
- `togglePanel()` - Expand/collapse sidebar panels (multiple allowed)
- `setMobileSheet()` - Mobile bottom sheet control
- `openContextMenu()` / `closeContextMenu()` - Right-click menus
- `toggleJumpMenu()` / `toggleMessageSearch()` - Quick navigation

Benefits:
- Single source of truth for UI state
- Only one overlay active at a time (prevents stacking)
- Desktop: multiple panels can be expanded
- Mobile: uses sheet pattern instead of modals

### Design System

New unified design system at `src/ui/app/design-system/`:

```
design-system/
  tokens/
    colors.ts          # Semantic color palette (bg, surface, text, accent, status)
    spacing.ts         # 4px-based spacing scale, border radius scale
    typography.ts      # Font scales, text styles (headings, body, labels, code)
  primitives/
    Surface.tsx        # Base glass surface with variants (default, elevated, inset, outline)
    Stack.tsx          # Flex layout component (HStack, VStack exports)
    Text.tsx           # Typography component with semantic styling
  compounds/
    Panel.tsx          # Expandable/collapsible content sections
    Drawer.tsx         # Side drawer (inline, not modal)
    Stepper.tsx        # Multi-step flow with dot/number/full indicators
    InlineForm.tsx     # Form that expands in place
  patterns/
    CommandBar.tsx     # Unified command input pattern
    StatusStrip.tsx    # Mobile bottom status bar (replaces FAB)
```

**Import Path Alias:** The project uses `@/` as a TypeScript path alias mapping to `src/ui/app/`. All frontend imports use this convention.

Usage:
```typescript
import { Surface, Stack, Text } from '@/design-system/primitives';
import { Panel, Stepper } from '@/design-system/compounds';
// @/ resolves to src/ui/app/
```

### Screens

| Screen | Path | Purpose |
|--------|------|---------|
| `MissionControl.tsx` | `/` and `/mission` | Default landing page with phased workflow navigator |
| `Home.tsx` | `/home` | Repo selection and session launcher |
| `AuthV2.tsx` | `/auth` | Token/PIN authentication with stepper flow |
| `TerminalV2.tsx` | `/terminal` | Main terminal interface (modular architecture) |
| `ReviewChangesV2.tsx` | `/review-changes` | Git diff review with Shiki syntax highlighting |
| `PreShipReviewV2.tsx` | `/pre-ship` | Pre-push review with safety checklist and PR preview |
| `RunPage.tsx` | `/run` | App runner with logs |
| `Settings.tsx` | `/settings/*` | Configuration pages with tabbed navigation |
| `settings/System.tsx` | `/settings/system` | Update settings and cache management |
| `SessionDashboard.tsx` | - | Session management (not currently routed) |
| `Launcher.tsx` | - | Alternative launcher interface (not currently routed) |

**Note:** Original v1 screens (Auth.tsx, Terminal.tsx, ReviewChanges.tsx, PreShipReview.tsx) were removed. Only current implementations exist.

### Ship Workflow Architecture

The ship workflow allows users to commit, push, and create PRs directly from the terminal interface.

#### Component Hierarchy

```
TerminalV2.tsx
  └── SidePanel.tsx (tabbed: Activity | Changes)
        └── ChangesPanel.tsx (orchestrator)
              ├── ChangesCard.tsx (stats display)
              ├── changes/ (file list components)
              └── Ship modal integration
```

#### State Machine

```
┌───────────┐    Ship Click    ┌───────────┐
│ collapsed │ ───────────────> │ expanded  │
│ (default) │                  │ (form)    │
└───────────┘                  └─────┬─────┘
      ^                              │
      │                         Ship Submit
      │                              │
      │                              v
      │    Done            ┌────────────────┐
      └─────────────────── │    success     │
      │                    └────────────────┘
      │
      │    Dismiss/Retry   ┌────────────────┐
      └─────────────────── │     error      │
                           └────────────────┘
```

#### Smart Routing

ChangesPanel automatically routes to full-screen review (`/pre-ship`) for:
- More than 10 changed files
- Security-sensitive files matching patterns:
  - `auth`, `login`, `password`, `security`, `crypto`
  - `token`, `.env`, `secrets`, `credentials`, `key`

#### File Approval Workflow

The `/review` route provides a full-screen interface for reviewing and approving changes before shipping.

**Visual Design:**
- Status dots indicate file change type:
  - Green = created/added
  - Yellow = modified
  - Red = deleted
  - Blue = renamed
- Full file paths displayed in natural order (directory/filename)
- Progress bar shows approval completion percentage

**Approval Flow:**
1. User navigates to Review Changes screen
2. Each file must be approved before shipping
3. Approval options:
   - Click "Approve" button in diff viewer header (per-file)
   - Click approval badge in file list (per-file)
   - Click "Approve All Files" in summary panel (bulk)
4. "Proceed to Ship" button enables when all files approved

**State Management:**
- Approval state is client-side only (React useState)
- Not persisted to backend - resets if user navigates away
- Progress tracked as: approved count / total files

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/terminal/sessions/:id/ship-summary` | GET | Get files, branches, PR status |
| `/api/terminal/sessions/:id/generate-pr-content` | POST | AI-generate PR title/description |
| `/api/terminal/sessions/:id/ship` | POST | Commit, push, create PR |

All endpoints support `repoId` parameter for multi-repo sessions.

### Component Organization

```
src/ui/app/
+-- design-system/          # Unified Design System
|   +-- tokens/             # Design tokens
|   |   +-- colors.ts       # Semantic color palette
|   |   +-- spacing.ts      # Spacing and border radius scales
|   |   +-- typography.ts   # Font scales and text styles
|   +-- primitives/         # Base building blocks
|   |   +-- Surface.tsx     # Glassmorphism card component
|   |   +-- Stack.tsx       # Flex layout (HStack, VStack)
|   |   +-- Text.tsx        # Typography component
|   +-- compounds/          # Composed UI patterns
|   |   +-- Panel.tsx       # Expandable sections
|   |   +-- Drawer.tsx      # Side drawer
|   |   +-- Stepper.tsx     # Multi-step flows
|   |   +-- InlineForm.tsx  # Inline expandable forms
|   +-- patterns/           # App-specific patterns
|       +-- CommandBar.tsx  # Command input
|       +-- StatusStrip.tsx # Mobile bottom bar
+-- components/
|   +-- layout/             # Shell, Header, Navigation
|   +-- mission/            # MissionControl landing page
|   |   +-- MissionControl.tsx     # Phased workflow navigator (default route)
|   |   +-- PhaseNavigator.tsx     # Phase selection UI
|   |   +-- OnboardingFlow.tsx     # First-time user flow
|   |   +-- RepoDock.tsx           # Repository dock
|   |   +-- SettingsDrawer.tsx     # Inline settings drawer
|   |   +-- Logo.tsx               # Brand logo component
|   |   +-- phases/                # Phase-specific components
|   |       +-- PromptPhase.tsx    # Prompt/chat phase
|   |       +-- ReviewPhase.tsx    # Review phase
|   |       +-- ShipPhase.tsx      # Ship phase
|   +-- auth/               # Auth components
|   |   +-- AuthStepper.tsx       # Stepper flow orchestrator
|   |   +-- AuthMethodPicker.tsx  # Token vs PIN selection
|   |   +-- TokenAuthForm.tsx     # Token input form
|   |   +-- PinAuthForm.tsx       # PIN entry form
|   |   +-- PWAInstallPrompt.tsx  # Non-blocking PWA prompt
|   |   +-- AuthSuccess.tsx       # Success state
|   +-- terminal/           # Terminal-specific components
|   |   +-- layout/         # Layout components
|   |   |   +-- TerminalLayout.tsx     # Main grid structure
|   |   |   +-- ConversationArea.tsx   # Messages + composer
|   |   |   +-- SidebarArea.tsx        # Activity + changes
|   |   |   +-- MobileStatusStrip.tsx  # Mobile bottom bar
|   |   +-- overlays/       # Overlay components
|   |   |   +-- OverlayManager.tsx     # Renders active overlay
|   |   +-- v2/             # Feature components
|   |   |   +-- changes/    # Ship workflow
|   |   |   +-- ChangesPanel.tsx
|   |   |   +-- SidePanel.tsx
|   +-- review/             # Review components
|   |   +-- DiffViewerV2.tsx      # Shiki syntax highlighting
|   |   +-- FileTree.tsx          # Collapsible file tree
|   |   +-- ReviewLayout.tsx      # 3-column responsive layout
|   |   +-- ApprovalSummary.tsx   # Approval progress panel
|   |   +-- ReviewTopBar.tsx      # Header navigation
|   +-- ship/                     # Ship components
|   |   +-- SafetyChecklist.tsx   # Warning severity system
|   |   +-- BranchCompare.tsx     # Source→target visual
|   |   +-- PRPreview.tsx         # Live PR preview
|   +-- settings/           # Settings components
|   |   +-- SettingsLayout.tsx    # Tabbed navigation
|   |   +-- CacheManagement.tsx   # Cache size display and clearing
|   |   +-- UpdateSettings.tsx    # Auto-update toggle and interval config
|   +-- ui/                 # Reusable UI primitives
+-- hooks/                  # Custom React hooks
+-- lib/                    # Utilities (api, cn, haptics, request-cache, sanitize)
+-- screens/                # Page components (V2 versions active)
+-- store/                  # Zustand stores
|   +-- terminalStore.ts    # Session state
|   +-- terminalUIStore.ts  # UI overlay/panel state
|   +-- appStore.ts         # Global app state
|   +-- runStore.ts         # Running apps state
|   +-- themeStore.ts       # Theme preferences
|   +-- cacheStore.ts       # Cache statistics and management
|   +-- updateStore.ts      # Update checker state
+-- types/                  # TypeScript definitions
```

## Claude Code Integration

### Invocation

Claude Code is invoked via `child_process.spawn()`:

```bash
claude --dangerously-skip-permissions -p --output-format stream-json --verbose - [--resume <session_id>]
```

Flags:
- `--dangerously-skip-permissions` - Skip tool approval prompts (must be first)
- `-p` - Print mode (non-interactive)
- `--output-format stream-json` - JSON streaming output
- `--verbose` - Required for stream-json format
- `-` - Read prompt from stdin
- `--resume <id>` - Resume existing conversation

### Stream-JSON Parsing

Claude Code outputs JSON objects line-by-line:

```json
{"type":"message_start","message":{"model":"claude-sonnet-4-20250514"}}
{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}
{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read","input":{"file_path":"/foo.ts"}}}
{"type":"result","session_id":"abc123","usage":{"input_tokens":1000,"output_tokens":500},"cost_usd":0.01}
```

The `claude-invoker.ts` parses these into typed events and broadcasts them via WebSocket.

### Session Resume

Each Claude conversation has a `session_id` returned in the `result` event. This ID is:
1. Persisted in terminal session data
2. Passed via `--resume` flag on subsequent messages
3. Enables context continuity across user messages

## Data Flow

### User Sends Message

```
1. User types message in React UI
2. terminalStore.sendMessage() sends via WebSocket
3. wsManager receives 'message' type
4. terminalSessionManager.sendMessage() called
5. claude-invoker spawns/resumes Claude CLI
6. Prompt written to stdin
7. stdout parsed line-by-line for stream-json events
8. Events broadcast to subscribed WebSocket clients
9. terminalStore updates UI via WebSocket handlers
10. React re-renders with new content
```

### Tool Activity Tracking

```
1. Claude emits tool_use event (e.g., Read, Edit, Bash)
2. claude-invoker parses and formats activity
3. 'tool-start' broadcast via WebSocket
4. terminalStore.toolActivities updated
5. UI shows activity in timeline
6. Claude emits completion
7. 'tool-complete' broadcast
8. UI updates activity status
```

## Key Technical Decisions

### WebSocket for Real-Time Updates

**Why:** Claude Code can stream responses for 30+ seconds. HTTP long-polling would be inefficient and have scaling issues. WebSocket provides:
- Bidirectional communication
- Low latency streaming
- Efficient connection reuse
- Native browser support

### Git Worktrees for Isolation

**Why:** Running multiple Claude sessions on the same repo could cause conflicts. Git worktrees provide:
- Isolated working directories per session
- Shared object database (space efficient)
- Independent branches per worktree
- Safe concurrent modifications

Convention: `<repo-parent>/.claudedesk-terminal-worktrees/<repoId>/<sessionId>/`

### Local-First Architecture

**Why:** Developer tools should work offline and protect code privacy:
- No cloud dependency (Claude API calls are direct)
- Code never leaves local machine (except Claude API)
- Session data persisted locally in JSON
- Optional tunnels for sharing (user-initiated only)

### Stream-JSON Output Format

**Why:** Claude Code's `stream-json` format provides:
- Structured event parsing (vs raw text)
- Tool use visibility (Read, Edit, Bash)
- Usage/cost tracking per message
- Session ID for conversation resume

### Process Limits

**Why:** Prevent resource exhaustion:
- MAX_TOTAL_SESSIONS = 50
- MAX_ACTIVE_CLAUDE_PROCESSES = 5

### Graceful Shutdown

The server handles SIGINT/SIGTERM with ordered cleanup:
1. Close WebSocket connections
2. Stop all running apps
3. Stop Cloudflare tunnels
4. Clean up terminal sessions (kill Claude processes)
5. Stop Docker services (if auto-started)
6. Close HTTP server

## Security Considerations

- **Token Authentication:** All API/WebSocket requests require valid token
- **Rate Limiting:** Prevents API abuse
- **WebSocket Auth:** Secure protocol header or query param
- **No Credential Storage:** OAuth tokens stored in workspace config (local only)
- **Git Credential Helper:** Temporary credential injection, cleaned up after use
- **Forbidden Ports:** Claude warned not to kill ports 8787/5173 (ClaudeDesk's ports)

## Configuration Files

| File | Purpose |
|------|---------|
| `config/repos.json` | Registered repositories |
| `config/terminal-sessions.json` | Persisted session data |
| `config/settings.json` | User preferences |
| `config/workspaces.json` | Workspace OAuth tokens |
| `config/mcp-servers.json` | MCP server configurations |
| `config/skills/*.md` | Custom skill definitions |

## Ports and Services

| Service | Default Port | Configurable |
|---------|-------------|--------------|
| ClaudeDesk API | 8787 | CLAUDEDESK_PORT |
| Vite Dev Server | 5173 | vite.config.ts |
| PostgreSQL (Docker) | 5432 | docker-compose.yml |
| Redis (Docker) | 6379 | docker-compose.yml |
