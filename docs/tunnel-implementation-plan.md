# LaunchTunnel Integration — Implementation Plan

## Context

LaunchTunnel is a tunneling service that exposes localhost to the internet with shareable HTTPS URLs. This integrates it as ClaudeDesk's 14th domain using a **hybrid approach**: REST API for CRUD/metadata, `lt` CLI for long-lived tunnel connections. API key manually entered in settings, stored in `~/.claudedesk/`.

---

## Phase 1: Shared Types & IPC Contract

- [x] **1.1** Create `src/shared/types/tunnel-types.ts`
  - [x] Define `TunnelStatus`, `TunnelProtocol` union types
  - [x] Define `TunnelInfo` interface (id, name, port, protocol, url, status, createdAt, expiresAt, subdomain, pid, isLocal)
  - [x] Define `TunnelCreateRequest` interface (port, name, protocol, expires, auth, subdomain, inspect)
  - [x] Define `TunnelSettings` interface (apiKey, autoRefreshIntervalMs, defaultProtocol, defaultExpires, ltBinaryPath)
  - [x] Define `TunnelAccountInfo` interface (email, plan, tunnelLimit, tunnelsActive)
  - [x] Define `TunnelRequestLog` interface (id, method, path, statusCode, timestamp, duration, size)
  - [x] Define `TunnelOperationResult` interface (success, message, errorCode)
  - [x] Define `TunnelErrorCode` union type
  - [x] Define event interfaces: `TunnelCreatedEvent`, `TunnelStoppedEvent`, `TunnelErrorEvent`, `TunnelOutputEvent`

- [x] **1.2** Modify `src/shared/ipc-contract.ts` — add 17 `tunnel:*` methods
  - [x] Import tunnel types at top of file
  - [x] Add 13 invoke contracts (createTunnel, listTunnels, getTunnel, stopTunnel, deleteTunnel, getTunnelRequests, getTunnelAccount, getTunnelUsage, getTunnelSettings, updateTunnelSettings, validateTunnelApiKey, refreshTunnels, getTunnelOutput)
  - [x] Add 4 event contracts (onTunnelCreated, onTunnelStopped, onTunnelError, onTunnelOutput)

- [x] **1.3** Modify `src/shared/ipc-types.ts` — re-export tunnel types

## Phase 2: Main Process — TunnelManager

- [x] **2.1** Create `src/main/tunnel-manager.ts`
  - [x] Class skeleton with constructor, destroy(), setMainWindow()
  - [x] Settings persistence (load/save from `~/.claudedesk/tunnel-settings.json`, atomic writes)
  - [x] `detectLtBinary()` — `which`/`where` via `execFile` (pattern from `git-manager.ts`)
  - [x] `apiRequest(method, path, body?)` — internal fetch helper with Bearer auth
  - [x] `validateApiKey(key)` — `GET /v1/account/me`
  - [x] `getSettings()` / `updateSettings(partial)`
  - [x] REST API: `listTunnelsFromApi()` — `GET /v1/tunnels` with 30s cache
  - [x] REST API: `getTunnel(id)` — `GET /v1/tunnels/:id`
  - [x] REST API: `deleteTunnel(id)` — `DELETE /v1/tunnels/:id`
  - [x] REST API: `stopTunnelViaApi(id)` — `POST /v1/tunnels/:id/stop`
  - [x] REST API: `getRequestLogs(id)` — `GET /v1/tunnels/:id/logs`
  - [x] REST API: `getAccountInfo()` — `GET /v1/account/me`
  - [x] REST API: `getUsageStats()` — `GET /v1/account/usage`
  - [x] CLI: `createTunnel(request)` — `spawn('lt', ['preview', '--port', N, '--json', ...])` with `LT_API_KEY` env var
  - [x] CLI: stdout line-by-line parsing for JSON `{ url, id }`
  - [x] CLI: output buffer (capped 500 lines) per tunnel process
  - [x] CLI: process tracking via `Map<string, TunnelProcess>`
  - [x] `stopTunnel(id)` — kill process + API stop + emit event
  - [x] Windows process kill fallback (`taskkill /pid N /f`)
  - [x] `listTunnels()` — merge local process state with API listing
  - [x] `getTunnelOutput(id)` — return buffered output
  - [x] IPCEmitter events: emit `onTunnelCreated`, `onTunnelStopped`, `onTunnelError`, `onTunnelOutput`
  - [x] `destroy()` — kill all spawned processes, clear timers

## Phase 3: IPC Handler Wiring

- [x] **3.1** Modify `src/main/ipc-handlers.ts`
  - [x] Add `TunnelManager` as 16th parameter to `setupIPCHandlers()`
  - [x] Register `registry.handle('createTunnel', ...)`
  - [x] Register `registry.handle('listTunnels', ...)`
  - [x] Register `registry.handle('getTunnel', ...)`
  - [x] Register `registry.handle('stopTunnel', ...)`
  - [x] Register `registry.handle('deleteTunnel', ...)`
  - [x] Register `registry.handle('getTunnelRequests', ...)`
  - [x] Register `registry.handle('getTunnelAccount', ...)`
  - [x] Register `registry.handle('getTunnelUsage', ...)`
  - [x] Register `registry.handle('getTunnelSettings', ...)`
  - [x] Register `registry.handle('updateTunnelSettings', ...)`
  - [x] Register `registry.handle('validateTunnelApiKey', ...)`
  - [x] Register `registry.handle('refreshTunnels', ...)`
  - [x] Register `registry.handle('getTunnelOutput', ...)`

- [x] **3.2** Modify `src/main/index.ts`
  - [x] Import `TunnelManager`
  - [x] Add `let tunnelManager: TunnelManager | null = null;` declaration
  - [x] Instantiate `tunnelManager = new TunnelManager()` after playbookManager
  - [x] Call `tunnelManager.setMainWindow(mainWindow)`
  - [x] Pass `tunnelManager` to `setupIPCHandlers()` as 16th arg
  - [x] Add `tunnelManager.destroy(); tunnelManager = null;` in `closed` handler

## Phase 4: Renderer Hook

- [x] **4.1** Create `src/renderer/hooks/useTunnel.ts`
  - [x] State: tunnels[], settings, account, selectedTunnel, requestLogs[], isLoading, error, isConfigured
  - [x] `useEffect` mount: load settings, check isConfigured (API key present)
  - [x] `useEffect` event subscriptions: onTunnelCreated, onTunnelStopped, onTunnelError, onTunnelOutput
  - [x] `useEffect` auto-refresh interval (default 30s)
  - [x] `useCallback`: createTunnel(request)
  - [x] `useCallback`: stopTunnel(id)
  - [x] `useCallback`: deleteTunnel(id)
  - [x] `useCallback`: refreshTunnels()
  - [x] `useCallback`: loadRequestLogs(tunnelId)
  - [x] `useCallback`: selectTunnel(tunnel)
  - [x] `useCallback`: updateSettings(partial)
  - [x] `useCallback`: validateApiKey(key)
  - [x] `useCallback`: loadAccount()
  - [x] Return typed hook result

## Phase 5: UI Components

- [x] **5.1** Create `src/renderer/components/TunnelPanel.tsx` — Main panel
  - [x] Panel shell: backdrop overlay, slide-in animation, responsive width (420px/380px/100vw)
  - [x] View router: Setup / Main / Logs / Settings sub-views
  - [x] Header: globe icon + "LAUNCHTUNNEL" + active count badge + refresh + settings gear + ESC
  - [x] Keyboard handlers: ESC close, R refresh
  - [x] **Setup View** (!isConfigured)
    - [x] Intro text explaining LaunchTunnel
    - [x] API key masked input with eye toggle (show/hide)
    - [x] "Validate & Save" button with loading/success/error states
    - [x] Error message display
    - [x] "Get your API key at app.launchtunnel.dev" link
  - [x] **Main Panel View** (configured)
    - [x] CLI warning banner (when `lt` binary not found) with dismiss
    - [x] Network error banner with retry
    - [x] Active Tunnels section label
    - [x] Empty state ("No active tunnels")
    - [x] Tunnel cards list (see 5.2)
    - [x] Create Tunnel collapsible section (see 5.3)
    - [x] Account Info collapsible section (plan badge, tunnel count)
    - [x] Skeleton loading state (2 shimmer cards)
  - [x] **Settings Sub-view**
    - [x] Back arrow navigation
    - [x] API key display (masked) + "Change" button
    - [x] Default protocol toggle (HTTP/TCP)
    - [x] Default expiration dropdown
    - [x] Auto-refresh interval dropdown
    - [x] CLI binary path input (auto-detected)
    - [x] "Disconnect" button with inline confirmation
  - [x] Footer: sync timestamp
  - [x] All CSS styles (Tokyo Night, JetBrains Mono, responsive breakpoints)
  - [x] `prefers-reduced-motion` support

- [x] **5.2** Tunnel Card sub-component (inside TunnelPanel or extracted)
  - [x] Left accent border colored by status (green/yellow/red/gray)
  - [x] Top row: name + protocol badge (HTTP blue / TCP purple) + status badge + status dot
  - [x] URL row: monospace URL + copy button with "Copied!" tooltip (2s)
  - [x] Details row: port, created time (relative), expires time
  - [x] Actions row: Stop (red), Delete (muted), View Logs (if inspect)
  - [x] Active status dot pulse animation
  - [x] Stopping state: buttons disabled, "Stopping..." with spinner
  - [x] Card appear animation (fade-in + slide-up, staggered 50ms)

- [x] **5.3** Create `src/renderer/components/TunnelCreateDialog.tsx` — Create form
  - [x] Port input (number, required, 1-65535 validation)
  - [x] Name input (optional)
  - [x] Protocol toggle (HTTP | TCP two-segment selector)
  - [x] Expires dropdown (None, 30m, 1h, 2h, 4h, 8h, 24h)
  - [x] Advanced collapsible section
    - [x] Subdomain input (with "PRO" badge)
    - [x] Auth checkbox + password input
    - [x] Inspect checkbox ("Enable request logging")
  - [x] "Create Tunnel" primary button with loading state
  - [x] CLI output mini-terminal area (streaming output)
  - [x] Form validation + inline error messages
  - [x] Tunnel limit reached state (disabled button + upgrade message)

- [x] **5.4** Create `src/renderer/components/TunnelRequestLogs.tsx` — Logs sub-view
  - [x] Back arrow to return to main panel
  - [x] Tunnel URL bar with copy button + LIVE/PAUSED indicator
  - [x] Column headers: METHOD, PATH, STATUS, DURATION, TIME
  - [x] Log rows with color-coded method badges (GET green, POST blue, PUT yellow, DELETE red)
  - [x] Status codes color-coded (2xx green, 3xx blue, 4xx yellow, 5xx red)
  - [x] Duration color-coding (< 100ms green, > 1000ms yellow)
  - [x] Relative timestamps
  - [x] New row prepend animation (fade-in)
  - [x] Auto-refresh toggle in footer
  - [x] Empty state ("No requests logged yet")
  - [x] 500-row cap with notice

## Phase 6: App Integration

- [x] **6.1** Modify `src/renderer/components/ui/ToolsDropdown.tsx`
  - [x] Add `onOpenTunnels?: () => void` prop
  - [x] Add `activeTunnelCount?: number` prop
  - [x] Add tunnel menu item: globe icon, "LaunchTunnel" label, `Ctrl+Shift+U` shortcut, active count badge

- [x] **6.2** Modify `src/renderer/components/ui/TabBar.tsx`
  - [x] Pass `onOpenTunnels` prop through to ToolsDropdown
  - [x] Pass `activeTunnelCount` prop through to ToolsDropdown

- [x] **6.3** Modify `src/renderer/App.tsx`
  - [x] Import `TunnelPanel` and `useTunnel`
  - [x] Add `showTunnelPanel` state
  - [x] Add `Ctrl+Shift+U` keyboard shortcut handler
  - [x] Pass `onOpenTunnels` + `activeTunnelCount` through TabBar
  - [x] Render `<TunnelPanel>` alongside existing panels
  - [x] Wire panel open/close logic (mutual exclusion with other panels)

## Phase 7: Documentation

- [x] **7.1** Create `docs/tunnel-ui-spec.md` — full UI specification
  - [x] 4 view specs with ASCII mockups (Setup, Main, Logs, Settings)
  - [x] Component inventory (20+ components with props)
  - [x] All microcopy (button labels, error messages, empty states, tooltips)
  - [x] Status system (colors, dots, badges, accent borders)
  - [x] CSS class naming convention
  - [x] Animation specs
  - [x] Typography reference table
  - [x] Spacing/sizing reference table
  - [x] Responsive breakpoints
  - [x] Accessibility requirements (ARIA, keyboard nav, focus management, contrast)
  - [x] 44 acceptance criteria

- [x] **7.2** Create `docs/tunnel-implementation-plan.md` — this checklist

- [x] **7.3** Update `docs/repo-index.md` — add LaunchTunnel domain section

- [x] **7.4** Update `CLAUDE.md`
  - [x] Add Tunnels row to domain map table
  - [x] Update IPC method count (~166)
  - [x] Update project stats (14 domains, ~148 source files)

## Phase 8: Verification

- [x] **8.1** Build check: `npx tsc --noEmit` — no TypeScript errors
- [x] **8.2** Test check: `npm test` — 250/250 existing tests pass
- [ ] **8.3** Manual: Tools dropdown shows "LaunchTunnel" entry with globe icon
- [ ] **8.4** Manual: `Ctrl+Shift+U` toggles the tunnel panel
- [ ] **8.5** Manual: Panel shows API key setup when no key configured
- [ ] **8.6** Manual: Enter valid `lt_*` API key → validates → saves → transitions to main view
- [ ] **8.7** Manual: Create tunnel (port 3000) → spawns `lt preview` → URL appears in card
- [ ] **8.8** Manual: Tunnel card shows active status with green pulse dot + copyable URL
- [ ] **8.9** Manual: Stop tunnel → process killed → card updates to stopped
- [ ] **8.10** Manual: List shows tunnels created outside ClaudeDesk (via API)
- [ ] **8.11** Manual: Close app → all spawned tunnel processes cleaned up
- [ ] **8.12** Manual: Panel shows "CLI not found" banner when `lt` binary missing
- [ ] **8.13** Manual: REST API CRUD still works without CLI installed

---

## Key References

| Pattern | Source File |
|---------|-----------|
| REST API + fetch + cache | `src/main/quota-service.ts` |
| Binary detection | `src/main/git-manager.ts` → `detectGitBinary()` |
| Process spawn + buffering | `src/main/cli-manager.ts` |
| IPCEmitter push events | `src/main/git-manager.ts` → `setMainWindow()` |
| Settings persistence | `src/main/playbook-manager.ts` → atomic writes |
| Slide-in panel UI | `src/renderer/components/ui/BudgetPanel.tsx` |
| Hook with events | `src/renderer/hooks/useGit.ts` |
| ToolsDropdown entry | `src/renderer/components/ui/ToolsDropdown.tsx` |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keyboard shortcut | `Ctrl+Shift+U` | `Ctrl+Shift+T` taken by Agent Teams |
| API base URL | `https://api.launchtunnel.dev` | Production, configurable in settings |
| Process spawning | `spawn` not `execFile` | Tunnels are long-lived |
| API key storage | Plaintext `~/.claudedesk/tunnel-settings.json` | Matches existing OAuth token pattern |
| Windows kill | `process.kill()` + `taskkill` fallback | `SIGTERM` unreliable on Windows |
| Cache TTL | 30s | Balance freshness vs API rate limits |
| CLI auth | `LT_API_KEY` env var on spawn | CLI reads it automatically |
