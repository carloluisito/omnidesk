# TunnelPanel — UI Specification

LaunchTunnel integration for ClaudeDesk. 14th domain. Slide-in panel with 4 sub-views: Setup, Main, Logs, Settings.

---

## 1. Design System

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-panel` | `#1a1b26` | Panel background |
| `--bg-card` | `#16161e` | Tunnel cards, form sections |
| `--bg-input` | `#0d0e14` | Text inputs, dropdowns |
| `--accent-blue` | `#7aa2f7` | Primary actions, HTTP badge, links |
| `--accent-green` | `#9ece6a` | Active status, GET badge, 2xx codes |
| `--accent-yellow` | `#e0af68` | Creating status, PUT badge, 4xx codes, slow duration |
| `--accent-red` | `#f7768e` | Error status, Stop button, DELETE badge, 5xx codes |
| `--accent-purple` | `#9d7cd8` | TCP protocol badge |
| `--text-primary` | `#c0caf5` | Main text |
| `--text-secondary` | `#a9b1d6` | Labels, metadata |
| `--text-muted` | `#565f89` | Placeholders, timestamps, disabled |
| `--border` | `#292e42` | All borders |
| `--hover` | `#1f2335` | Row hover backgrounds |

### Typography

| Element | Family | Size | Weight | Color | Letter-spacing |
|---------|--------|------|--------|-------|---------------|
| Panel title "LAUNCHTUNNEL" | JetBrains Mono | 11px | 700 | `#c0caf5` | 0.15em |
| Section labels | JetBrains Mono | 10px | 600 | `#565f89` | 0.12em |
| Tunnel name | JetBrains Mono | 13px | 600 | `#c0caf5` | 0 |
| Tunnel URL | JetBrains Mono | 11px | 400 | `#7aa2f7` | 0 |
| Card metadata (port, time) | JetBrains Mono | 10px | 400 | `#565f89` | 0 |
| Protocol badge | JetBrains Mono | 9px | 700 | (per badge) | 0.08em |
| Status badge | JetBrains Mono | 9px | 600 | (per badge) | 0.08em |
| Button labels | system-ui | 12px | 500 | (per button) | 0 |
| Input labels | system-ui | 11px | 500 | `#a9b1d6` | 0 |
| Input values | JetBrains Mono | 12px | 400 | `#c0caf5` | 0 |
| Log METHOD badge | JetBrains Mono | 9px | 700 | (per method) | 0.06em |
| Log path | JetBrains Mono | 11px | 400 | `#c0caf5` | 0 |
| Log status code | JetBrains Mono | 11px | 600 | (per range) | 0 |
| Intro/help text | system-ui | 13px | 400 | `#a9b1d6` | 0 |

### Spacing & Sizing

| Component | Value |
|-----------|-------|
| Panel padding | 16px |
| Card padding | 12px |
| Card border-radius | 6px |
| Card left accent border | 3px solid (status color) |
| Card gap | 8px |
| Section gap | 16px |
| Input height | 32px |
| Input padding | 8px 10px |
| Input border-radius | 4px |
| Button height (primary) | 32px |
| Button height (small) | 24px |
| Button padding (primary) | 0 16px |
| Button padding (small) | 0 8px |
| Button border-radius | 4px |
| Badge padding | 2px 6px |
| Badge border-radius | 3px |
| Header height | 44px |
| Status dot size | 8px |
| Pulse ring max scale | 2.0 |
| Skeleton shimmer height | 72px |

### Responsive Breakpoints

| Viewport width | Panel width |
|---------------|-------------|
| > 900px | 420px |
| 750px – 900px | 380px |
| 650px – 750px | calc(100vw - 20px) |
| < 650px | 100vw |

---

## 2. Panel Shell

The panel renders as a fixed overlay on the right side of the viewport, above all other content.

```
┌─────────────────────────────────────────────────┐
│  Backdrop (rgba(0,0,0,0.5), full viewport)      │
│  ┌───────────────────────────────────────────┐  │
│  │  TunnelPanel (420px wide, full height)    │  │
│  │  [Header always present]                  │  │
│  │  [Active sub-view content]                │  │
│  │  [Footer — sync timestamp]                │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Clicking the backdrop closes the panel. ESC key closes the panel.

### Panel Header (all views)

```
┌────────────────────────────────────────────────┐
│ 🌐  LAUNCHTUNNEL  [3]    [↻]  [⚙]  [×]        │
└────────────────────────────────────────────────┘
```

- Globe icon (Lucide `Globe`, 14px, `#7aa2f7`)
- "LAUNCHTUNNEL" label (typography: panel title)
- Active count badge: `[N]` — blue pill, hidden when 0
- Refresh button: `↻` icon (Lucide `RefreshCw`, 14px), spins during refresh, tooltip "Refresh tunnels"
- Settings gear: `⚙` icon (Lucide `Settings`, 14px), navigates to Settings sub-view, hidden in Setup view
- Close button: `×` (Lucide `X`, 16px), closes panel

In Settings and Logs sub-views, the header leading section changes to a back arrow:

```
┌────────────────────────────────────────────────┐
│ ←  SETTINGS                        [×]         │
└────────────────────────────────────────────────┘
```

---

## 3. View 1: Setup View

Shown when `isConfigured` is false (no API key saved).

### ASCII Mockup

```
┌────────────────────────────────────────────────┐
│ 🌐  LAUNCHTUNNEL                      [×]      │
├────────────────────────────────────────────────┤
│                                                │
│   Expose localhost to the internet with        │
│   shareable HTTPS URLs. Connect your           │
│   LaunchTunnel account to get started.         │
│                                                │
│   ─────────────────────────────────────────    │
│                                                │
│   API Key                                      │
│   ┌──────────────────────────────────────┐     │
│   │ ••••••••••••••••••••••••••••   [👁]  │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   ┌──────────────────────────────────────┐     │
│   │         Validate & Save              │     │
│   └──────────────────────────────────────┘     │
│                                                │
│   ⚠ Invalid API key. Please try again.        │  ← error state only
│                                                │
│   Get your API key at                          │
│   app.launchtunnel.dev →                       │
│                                                │
└────────────────────────────────────────────────┘
```

### Component: SetupView

Props: `onValidated: () => void`

State:
- `apiKeyInput: string` — raw input value
- `showKey: boolean` — toggle masking
- `isValidating: boolean` — button loading state
- `error: string | null` — validation error

Elements:

**Intro paragraph**
- Text: "Expose localhost to the internet with shareable HTTPS URLs. Connect your LaunchTunnel account to get started."
- Style: body text, `#a9b1d6`, 13px, line-height 1.6

**API Key input group**
- Label: "API Key" (11px, `#a9b1d6`)
- Input: `type="password"` when `showKey=false`, `type="text"` when true
- Placeholder: `lt_••••••••••••••••` (muted)
- Eye toggle button: Lucide `Eye` / `EyeOff`, 14px, right-inset in input

**Validate & Save button**
- Default: "Validate & Save" — blue fill (`#7aa2f7` bg, `#1a1b26` text)
- Loading: spinner + "Validating…" — disabled, opacity 0.7
- Success: checkmark + "Saved!" — green fill (`#9ece6a` bg) — transitions to Main view after 600ms
- Error: reverts to default state, error message shown below input

**Error message**
- Icon: Lucide `AlertTriangle`, 12px, `#f7768e`
- Text: (see microcopy table)
- Style: 11px, `#f7768e`, inline below button

**Link**
- Text: "Get your API key at app.launchtunnel.dev →"
- Style: `#7aa2f7`, 12px, underline on hover
- Opens external browser

---

## 4. View 2: Main Panel View

Shown when `isConfigured` is true.

### ASCII Mockup

```
┌────────────────────────────────────────────────┐
│ 🌐  LAUNCHTUNNEL  [2]    [↻]  [⚙]  [×]        │
├────────────────────────────────────────────────┤
│                                                │
│ ┌──────────────────────────────────────────┐   │  ← CLI warning (conditional)
│ │ ⚠ lt CLI not found. Install with:       │   │
│ │   npm install -g @launchtunnel/cli  [×]  │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│ ACTIVE TUNNELS ─────────────────────────────   │
│                                                │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │  ← skeleton (loading)
│   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░      │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                │
│ ┌╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐    │  ← tunnel card (active)
│ ┃ my-app  [HTTP]  [● ACTIVE]               │   │
│ ┃ https://abc123.launchtunnel.dev  [copy]  │   │
│ ┃ Port 3000  ·  2m ago  ·  Expires 1h     │   │
│ ┃ [Stop]  [Delete]  [View Logs]            │   │
│ └────────────────────────────────────────── ┘  │
│                                                │
│ ┌────────────────────────────────────────────┐ │  ← tunnel card (creating)
│ ┃ api-server  [TCP]  [◌ CREATING]           │ │
│ ┃ —                                         │ │
│ ┃ Port 8080  ·  just now                    │ │
│ ┃ [Stop]  [Delete]                          │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ ▶ CREATE TUNNEL ─────────────────────────────  │  ← collapsible
│   Port: [3000      ]  Name: [optional ]        │
│   Protocol: [HTTP] [TCP]                       │
│   Expires:  [1 hour ▾]                         │
│   ▶ Advanced                                   │
│   [  Create Tunnel  ]                          │
│                                                │
│ ▶ ACCOUNT ───────────────────────────────────  │  ← collapsible
│   plan: [PRO]  2 / 10 tunnels active           │
│                                                │
├────────────────────────────────────────────────┤
│ Last synced 12s ago                            │
└────────────────────────────────────────────────┘
```

### Component: TunnelCard

Props:
```typescript
interface TunnelCardProps {
  tunnel: TunnelInfo;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onViewLogs: (tunnel: TunnelInfo) => void;
  animationDelay?: number; // ms, for stagger
}
```

**Left accent border color by status:**
| Status | Border color |
|--------|-------------|
| `active` | `#9ece6a` |
| `creating` | `#e0af68` |
| `error` | `#f7768e` |
| `stopped` | `#565f89` |

**Status dot:**
| Status | Color | Animation |
|--------|-------|-----------|
| `active` | `#9ece6a` | Pulse ring, 1.5s infinite |
| `creating` | `#e0af68` | Slow blink, 1s infinite |
| `error` | `#f7768e` | None |
| `stopped` | `#565f89` | None |

**Protocol badge:**
| Protocol | Background | Text color |
|----------|-----------|------------|
| HTTP | `rgba(122,162,247,0.15)` | `#7aa2f7` |
| TCP | `rgba(157,124,216,0.15)` | `#9d7cd8` |

**Actions:**
- Stop: `#f7768e` text, hover background `rgba(247,118,142,0.1)`, Lucide `Square` icon
- Delete: `#565f89` text, hover `#a9b1d6`, Lucide `Trash2` icon
- View Logs: `#7aa2f7` text, hover `rgba(122,162,247,0.1)`, Lucide `ScrollText` icon — only shown when tunnel has `inspect: true`

**Stopping state** (when Stop pressed):
- All action buttons disabled
- Spinner replaces Stop icon
- Label: "Stopping…"

**Card appear animation:**
```css
@keyframes tunnel-card-appear {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Each card: animation-delay = index * 50ms */
```

### Component: CLIWarningBanner

Shown when `settings.ltBinaryPath` is null (CLI not found on startup).

```
┌──────────────────────────────────────────────────┐
│ ⚠ lt CLI not found. Install:                     │
│   npm install -g @launchtunnel/cli          [×]  │
└──────────────────────────────────────────────────┘
```

- Background: `rgba(224,175,104,0.1)`
- Border: 1px solid `rgba(224,175,104,0.3)`
- Text: `#e0af68`, 11px
- Dismiss button: `×` (Lucide `X`, 12px) — hides banner for session only
- Note: REST API operations still work; only CLI-based tunnel creation is unavailable

### Component: CreateTunnelSection (collapsible)

Collapsed header: `▶ CREATE TUNNEL` — chevron rotates 90° on expand.

Expanded form fields:

| Field | Type | Validation | Default |
|-------|------|-----------|---------|
| Port | number input | 1–65535, required | — |
| Name | text input | optional, max 50 chars | — |
| Protocol | two-segment toggle | HTTP or TCP | from settings |
| Expires | select dropdown | None / 30m / 1h / 2h / 4h / 8h / 24h | from settings |

Advanced section (collapsed by default):

| Field | Type | Notes |
|-------|------|-------|
| Subdomain | text input | PRO badge shown beside label |
| Auth | checkbox + password input | password visible only when checked |
| Inspect | checkbox | Enables request logging; required for View Logs |

**Create Tunnel button:**
- Default: blue fill
- Loading: spinner + "Creating…", disabled
- Limit reached: disabled, muted text "Tunnel limit reached — upgrade at app.launchtunnel.dev"

**CLI output mini-terminal** (visible after creation starts):
- Height: 80px, overflow scroll
- Background: `#0d0e14`
- Font: JetBrains Mono, 10px, `#a9b1d6`
- Scrolls to bottom as lines arrive

### Component: AccountInfoSection (collapsible)

```
ACCOUNT ────────────────────────────────────
plan: [FREE]   0 / 3 tunnels active
email: user@example.com
```

Plan badge colors:
| Plan | Background | Text |
|------|-----------|------|
| FREE | `rgba(86,95,137,0.3)` | `#a9b1d6` |
| PRO | `rgba(122,162,247,0.2)` | `#7aa2f7` |
| TEAM | `rgba(157,124,216,0.2)` | `#9d7cd8` |

### Skeleton Loading State

Two shimmer cards shown while initial list loads:

```css
@keyframes tunnel-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.tunnel-skeleton-card {
  background: linear-gradient(
    90deg,
    #16161e 0%,
    #1f2335 50%,
    #16161e 100%
  );
  background-size: 800px 100%;
  animation: tunnel-shimmer 1.5s infinite linear;
  height: 72px;
  border-radius: 6px;
}
```

### Empty State

Shown when `isLoading=false` and `tunnels.length === 0`:

```
        🌐
  No active tunnels

  Create one below to expose a
  local port to the internet.
```

- Icon: Lucide `Globe`, 32px, `#292e42`
- Title: 13px, `#565f89`
- Subtitle: 11px, `#565f89`

---

## 5. View 3: Logs Sub-view

Navigated to from a tunnel card's "View Logs" button. Only available for tunnels with `inspect: true`.

### ASCII Mockup

```
┌────────────────────────────────────────────────┐
│ ←  REQUEST LOGS                       [×]      │
├────────────────────────────────────────────────┤
│                                                │
│  https://abc123.launchtunnel.dev  [copy]       │
│                                    [● LIVE]    │
│                                                │
│ ┌──────────────────────────────────────────┐   │
│ │ METHOD  PATH            STATUS  DUR   TIME│   │
│ ├──────────────────────────────────────────┤   │
│ │[GET ]  /api/users       [200]  45ms  2s  │   │
│ │[POST]  /api/sessions    [201]  112ms 5s  │   │
│ │[GET ]  /health          [200]  8ms   8s  │   │
│ │[DEL ]  /api/items/42    [404]  23ms  12s │   │
│ │[POST]  /api/data        [500]  891ms 1m  │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│                                                │
│  ── 500-row limit reached. Oldest rows         │
│     removed. ─────────────────────────────     │
│                                                │
├────────────────────────────────────────────────┤
│ Auto-refresh [ON ●]   [Pause]                  │
└────────────────────────────────────────────────┘
```

### Component: TunnelRequestLogs

Props:
```typescript
interface TunnelRequestLogsProps {
  tunnel: TunnelInfo;
  logs: TunnelRequestLog[];
  isLive: boolean;
  onToggleLive: () => void;
  onBack: () => void;
}
```

**URL bar:**
- Full tunnel URL in monospace, `#7aa2f7`
- Copy button: Lucide `Copy`, 12px — shows "Copied!" tooltip for 2s after click
- LIVE/PAUSED indicator: pill badge, green with pulsing dot when live, muted when paused

**Table columns:**

| Column | Width | Alignment |
|--------|-------|-----------|
| METHOD | 48px | center |
| PATH | flex | left |
| STATUS | 48px | center |
| DURATION | 52px | right |
| TIME | 40px | right |

**METHOD badge colors:**
| Method | Background | Text |
|--------|-----------|------|
| GET | `rgba(158,206,106,0.2)` | `#9ece6a` |
| POST | `rgba(122,162,247,0.2)` | `#7aa2f7` |
| PUT | `rgba(224,175,104,0.2)` | `#e0af68` |
| PATCH | `rgba(224,175,104,0.15)` | `#e0af68` |
| DELETE | `rgba(247,118,142,0.2)` | `#f7768e` |
| HEAD | `rgba(86,95,137,0.2)` | `#a9b1d6` |
| OPTIONS | `rgba(86,95,137,0.2)` | `#a9b1d6` |

**STATUS code colors:**
| Range | Color |
|-------|-------|
| 2xx | `#9ece6a` |
| 3xx | `#7aa2f7` |
| 4xx | `#e0af68` |
| 5xx | `#f7768e` |

**DURATION colors:**
| Threshold | Color |
|-----------|-------|
| < 100ms | `#9ece6a` |
| 100–999ms | `#c0caf5` |
| >= 1000ms | `#e0af68` |

**Row animation (new rows prepended):**
```css
@keyframes tunnel-log-appear {
  from { opacity: 0; background-color: rgba(122,162,247,0.08); }
  to   { opacity: 1; background-color: transparent; }
}
/* Duration: 400ms, ease-out */
```

**500-row cap notice:**
- Text: "500-row limit reached. Oldest entries removed automatically."
- Style: 10px, `#565f89`, centered, border-top `#292e42`

**Empty state:**
```
  No requests logged yet.
  Make a request to your tunnel URL
  to see logs here.
```

**Footer:**
- Auto-refresh toggle: shows ON (green dot, "Pause" button) or OFF (gray, "Resume" button)
- Refresh interval: 5s when live

---

## 6. View 4: Settings Sub-view

Navigated to from the header settings gear icon.

### ASCII Mockup

```
┌────────────────────────────────────────────────┐
│ ←  SETTINGS                           [×]      │
├────────────────────────────────────────────────┤
│                                                │
│ API KEY                                        │
│ ┌──────────────────────────────────────────┐   │
│ │  lt_••••••••••••                [Change] │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│ DEFAULT PROTOCOL                               │
│   [HTTP]  [TCP]                                │
│                                                │
│ DEFAULT EXPIRATION                             │
│   [1 hour ▾]                                   │
│                                                │
│ AUTO-REFRESH INTERVAL                          │
│   [30 seconds ▾]                               │
│                                                │
│ CLI BINARY PATH                                │
│ ┌──────────────────────────────────────────┐   │
│ │  /usr/local/bin/lt (auto-detected)       │   │
│ └──────────────────────────────────────────┘   │
│   Detected: /usr/local/bin/lt                  │
│                                                │
│ ──────────────────────────────────────────     │
│                                                │
│  [  Disconnect Account  ]                      │
│                                                │
│  Are you sure? This removes your API key.      │
│  [Cancel]  [Yes, Disconnect]                   │  ← inline confirm (conditional)
│                                                │
└────────────────────────────────────────────────┘
```

### Component: TunnelSettings

Props:
```typescript
interface TunnelSettingsProps {
  settings: TunnelSettings;
  onUpdate: (partial: Partial<TunnelSettings>) => Promise<void>;
  onDisconnect: () => void;
  onBack: () => void;
}
```

**API Key row:**
- Displays: `lt_` + `•` × (key.length - 3), max 20 bullets
- "Change" button: navigates back to Setup view (clears current key from form)

**Default Protocol toggle:**
- Two-segment selector: HTTP | TCP
- Saves immediately on change

**Default Expiration dropdown:**
Options: None, 30 minutes, 1 hour, 2 hours, 4 hours, 8 hours, 24 hours

**Auto-Refresh Interval dropdown:**
Options: Off, 15 seconds, 30 seconds, 1 minute, 5 minutes

**CLI Binary Path input:**
- Editable text input
- Below: auto-detected path shown in muted text (or "Not found" in `#f7768e`)

**Disconnect button:**
- Default: `#f7768e` text, transparent background, border `rgba(247,118,142,0.3)`
- On click: shows inline confirmation below button
- Confirm: "Are you sure? This removes your API key and stops all active tunnels."
- Buttons: [Cancel] (muted) | [Yes, Disconnect] (red fill)
- On confirm: clears settings, emits disconnect, returns to Setup view

---

## 7. CSS Class Naming Convention

All classes use the `.tunnel-` prefix to avoid collision with other panel styles.

```
.tunnel-panel            Panel root container
.tunnel-panel-backdrop   Semi-transparent overlay
.tunnel-header           Top header bar
.tunnel-header-title     "LAUNCHTUNNEL" text
.tunnel-header-badge     Active count pill
.tunnel-header-actions   Right-side icon buttons
.tunnel-body             Scrollable content area
.tunnel-footer           Bottom sync timestamp bar

.tunnel-setup            Setup view root
.tunnel-setup-intro      Intro paragraph
.tunnel-setup-link       External link to site

.tunnel-warning-banner   CLI not found warning
.tunnel-error-banner     Network error warning

.tunnel-section-label    Section header (ACTIVE TUNNELS, etc.)
.tunnel-empty-state      No-tunnels empty state

.tunnel-card             Individual tunnel card
.tunnel-card--active     Status modifier
.tunnel-card--creating   Status modifier
.tunnel-card--error      Status modifier
.tunnel-card--stopped    Status modifier
.tunnel-card-header      Name + badges row
.tunnel-card-url         URL + copy row
.tunnel-card-meta        Port / time / expires row
.tunnel-card-actions     Stop / Delete / Logs row
.tunnel-status-dot       Animated status indicator dot
.tunnel-status-dot--pulse Pulse animation modifier

.tunnel-protocol-badge   HTTP/TCP badge
.tunnel-protocol-badge--http
.tunnel-protocol-badge--tcp
.tunnel-status-badge     ACTIVE/CREATING/etc. badge

.tunnel-create-section   Create tunnel collapsible
.tunnel-create-form      Form inside create section
.tunnel-create-advanced  Advanced sub-section
.tunnel-create-output    CLI output mini-terminal
.tunnel-pro-badge        PRO label on subdomain field

.tunnel-account-section  Account info collapsible
.tunnel-plan-badge       Plan pill (FREE/PRO/TEAM)

.tunnel-skeleton-card    Shimmer loading placeholder

.tunnel-logs-url-bar     URL + LIVE indicator in logs view
.tunnel-logs-live-badge  LIVE/PAUSED indicator
.tunnel-logs-table       Request log table
.tunnel-logs-row         Individual log row
.tunnel-logs-cap-notice  500-row limit notice
.tunnel-method-badge     METHOD column badge
.tunnel-method-badge--get
.tunnel-method-badge--post
.tunnel-method-badge--put
.tunnel-method-badge--delete
.tunnel-method-badge--patch

.tunnel-settings         Settings sub-view root
.tunnel-settings-section A labeled settings group
.tunnel-disconnect-btn   Disconnect button
.tunnel-disconnect-confirm Inline confirmation area

.tunnel-input            Styled text/number input
.tunnel-select           Styled dropdown
.tunnel-protocol-toggle  HTTP/TCP two-segment control
.tunnel-toggle-segment   Each segment of the toggle
.tunnel-toggle-segment--active Active segment
```

---

## 8. Animation Specifications

All animations respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  .tunnel-panel { animation: none; }
  .tunnel-card { animation: none; }
  .tunnel-status-dot--pulse { animation: none; }
  .tunnel-skeleton-card { animation: none; }
  .tunnel-logs-row { animation: none; }
}
```

### Panel Slide-in

```css
@keyframes tunnel-panel-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);   opacity: 1; }
}
.tunnel-panel {
  animation: tunnel-panel-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

### Card Appear (staggered)

```css
@keyframes tunnel-card-appear {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tunnel-card:nth-child(1) { animation: tunnel-card-appear 180ms 0ms ease-out both; }
.tunnel-card:nth-child(2) { animation: tunnel-card-appear 180ms 50ms ease-out both; }
.tunnel-card:nth-child(3) { animation: tunnel-card-appear 180ms 100ms ease-out both; }
/* etc. */
```

### Status Dot Pulse (active only)

```css
@keyframes tunnel-dot-pulse {
  0%   { transform: scale(1); opacity: 1; }
  60%  { transform: scale(2); opacity: 0; }
  100% { transform: scale(1); opacity: 0; }
}
.tunnel-status-dot--pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  animation: tunnel-dot-pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### Skeleton Shimmer

```css
@keyframes tunnel-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
.tunnel-skeleton-card {
  background: linear-gradient(
    90deg,
    #16161e 0%, #1f2335 50%, #16161e 100%
  );
  background-size: 800px 100%;
  animation: tunnel-shimmer 1.5s linear infinite;
}
```

### Log Row Appear

```css
@keyframes tunnel-log-appear {
  from { opacity: 0; background-color: rgba(122,162,247,0.08); }
  to   { opacity: 1; background-color: transparent; }
}
.tunnel-logs-row--new {
  animation: tunnel-log-appear 400ms ease-out both;
}
```

### Copy Tooltip Fade

```css
@keyframes tunnel-tooltip-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tunnel-copy-tooltip {
  animation: tunnel-tooltip-in 150ms ease-out both;
}
/* Auto-hidden after 2000ms */
```

---

## 9. Microcopy Reference

### Button Labels

| Element | Label |
|---------|-------|
| Validate button (default) | "Validate & Save" |
| Validate button (loading) | "Validating…" |
| Validate button (success) | "Saved!" |
| Create button (default) | "Create Tunnel" |
| Create button (loading) | "Creating…" |
| Stop button | "Stop" |
| Delete button | "Delete" |
| View Logs button | "View Logs" |
| Refresh button tooltip | "Refresh tunnels" |
| Settings button tooltip | "Tunnel settings" |
| Copy button | (icon only) |
| Copy tooltip | "Copied!" |
| Disconnect button | "Disconnect Account" |
| Disconnect confirm | "Yes, Disconnect" |
| Cancel disconnect | "Cancel" |
| Collapse/expand | "▶" / "▼" (chevron rotation) |
| Auto-refresh on | "Pause" |
| Auto-refresh off | "Resume" |
| CLI warning dismiss | "×" (icon only) |
| Change API key | "Change" |
| Back button | "←" (icon only) |

### Error Messages

| Trigger | Message |
|---------|---------|
| API key blank on submit | "Please enter your API key." |
| API key validation 401 | "Invalid API key. Please check and try again." |
| API key validation network | "Could not reach LaunchTunnel servers. Check your connection." |
| API key validation other | "Validation failed. Please try again." |
| Create tunnel — port blank | "Port is required." |
| Create tunnel — port out of range | "Port must be between 1 and 65535." |
| Create tunnel — name too long | "Name must be 50 characters or fewer." |
| Create tunnel — limit reached | "Tunnel limit reached. Upgrade at app.launchtunnel.dev" |
| Create tunnel — CLI not found | "lt CLI not installed. Cannot create tunnel." |
| Stop tunnel — error | "Failed to stop tunnel. Try again." |
| Delete tunnel — error | "Failed to delete tunnel. Try again." |
| Network error banner | "Could not reach LaunchTunnel. Check your connection. [Retry]" |

### Empty States

| Context | Primary text | Secondary text |
|---------|-------------|---------------|
| Main view — no tunnels | "No active tunnels" | "Create one below to expose a local port to the internet." |
| Logs view — no requests | "No requests logged yet." | "Make a request to your tunnel URL to see logs here." |

### Status Labels

| Status | Badge text |
|--------|-----------|
| `active` | "ACTIVE" |
| `creating` | "CREATING" |
| `error` | "ERROR" |
| `stopped` | "STOPPED" |

### Tooltips

| Element | Tooltip |
|---------|---------|
| Refresh button | "Refresh tunnels (R)" |
| Settings button | "Tunnel settings" |
| Stop button | "Stop tunnel and terminate connection" |
| Delete button | "Delete tunnel from LaunchTunnel" |
| View Logs button | "View HTTP request logs" |
| Active count badge | "{N} active tunnel(s)" |
| Subdomain PRO badge | "Custom subdomains require a PRO plan" |
| Copy URL button | "Copy tunnel URL" |
| LIVE indicator | "Auto-refreshing every 5 seconds" |
| PAUSED indicator | "Auto-refresh paused" |

### Placeholders

| Input | Placeholder |
|-------|------------|
| API key input | `lt_••••••••••••••••` |
| Port input | `3000` |
| Name input | `optional` |
| Subdomain input | `my-app` |
| Auth password input | `password` |
| CLI binary path | `/usr/local/bin/lt` |

---

## 10. Accessibility

### ARIA Roles and Labels

```html
<!-- Panel -->
<aside role="complementary" aria-label="LaunchTunnel Panel">

<!-- Close button -->
<button aria-label="Close LaunchTunnel panel">

<!-- Header refresh -->
<button aria-label="Refresh tunnels" aria-busy={isRefreshing}>

<!-- Header settings -->
<button aria-label="Open tunnel settings">

<!-- API key input -->
<label for="tunnel-api-key">API Key</label>
<input id="tunnel-api-key" type="password" aria-describedby="tunnel-api-key-error">
<div id="tunnel-api-key-error" role="alert" aria-live="assertive">

<!-- Eye toggle -->
<button aria-label="Show API key" aria-pressed={showKey}>

<!-- Tunnel card -->
<article aria-label="Tunnel: {name}" aria-describedby="tunnel-{id}-status">
<span id="tunnel-{id}-status">{statusLabel}</span>

<!-- Status dot -->
<span role="img" aria-label="{statusLabel} status indicator">

<!-- Copy URL button -->
<button aria-label="Copy tunnel URL to clipboard">

<!-- Stop button -->
<button aria-label="Stop tunnel {name}">

<!-- Delete button -->
<button aria-label="Delete tunnel {name}">

<!-- View Logs button -->
<button aria-label="View request logs for {name}">

<!-- Create section toggle -->
<button aria-expanded={isOpen} aria-controls="tunnel-create-form">

<!-- Log table -->
<table role="table" aria-label="Request logs for {tunnelUrl}">
<caption class="sr-only">HTTP request log. {count} entries.</caption>

<!-- Live badge -->
<span role="status" aria-live="polite" aria-label={isLive ? 'Live, auto-refreshing' : 'Paused'}>

<!-- Disconnect confirm -->
<div role="alertdialog" aria-modal="false" aria-labelledby="disconnect-confirm-title">
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Escape` | Close panel (from any sub-view) |
| `R` | Refresh tunnels (Main view, not when input focused) |
| `Tab` | Navigate interactive elements forward |
| `Shift+Tab` | Navigate interactive elements backward |
| `Enter` / `Space` | Activate focused button |
| `Arrow keys` | Navigate within protocol toggle, plan badges |

### Focus Management

- On panel open: focus moves to the first focusable element (API key input in Setup view, or first tunnel card Stop button in Main view)
- On sub-view navigate (Logs, Settings): focus moves to the back arrow button
- On sub-view close (back): focus returns to the element that triggered navigation
- On tunnel delete: focus moves to the next card, or to the Create Tunnel button if last card
- On disconnect: focus returns to the setup API key input
- Panel uses `focus-trap` pattern: Tab cycles within panel only while open

### Contrast Ratios

| Foreground | Background | Ratio | WCAG Level |
|-----------|-----------|-------|-----------|
| `#c0caf5` (text-primary) | `#1a1b26` (bg-panel) | 10.5:1 | AAA |
| `#a9b1d6` (text-secondary) | `#1a1b26` | 7.8:1 | AAA |
| `#7aa2f7` (accent-blue) | `#1a1b26` | 5.2:1 | AA |
| `#9ece6a` (accent-green) | `#16161e` (bg-card) | 5.8:1 | AA |
| `#f7768e` (accent-red) | `#16161e` | 4.6:1 | AA |
| `#e0af68` (accent-yellow) | `#16161e` | 5.4:1 | AA |
| `#565f89` (text-muted) | `#1a1b26` | 3.1:1 | AA Large |

### `prefers-reduced-motion`

When `prefers-reduced-motion: reduce` is active:
- Panel slide-in: instant (no animation)
- Card appear: instant
- Status dot pulse: hidden (static dot only)
- Skeleton shimmer: static color block
- Log row appear: instant
- Copy tooltip: instant appear/hide

---

## 11. Acceptance Criteria

### AC-1: Panel opens and closes
- [ ] `Ctrl+Shift+U` opens the panel
- [ ] ESC closes the panel from any sub-view
- [ ] Clicking the backdrop closes the panel
- [ ] Close button (×) in header closes the panel
- [ ] Panel slides in from the right (200ms, cubic-bezier)

### AC-2: Setup View (no API key)
- [ ] Setup view shown when no API key is stored
- [ ] API key input is masked by default
- [ ] Eye toggle shows/hides the API key
- [ ] "Validate & Save" button is disabled when input is empty
- [ ] Button shows "Validating…" with spinner while checking
- [ ] Valid key: button shows "Saved!" then transitions to Main view
- [ ] Invalid key (401): error message shown below input
- [ ] Network error: network-specific error message shown
- [ ] "Get your API key" link opens external browser
- [ ] Settings gear hidden in Setup view

### AC-3: Main Panel View (configured)
- [ ] Main view shown when API key is stored
- [ ] Loading state: 2 shimmer skeleton cards shown
- [ ] Tunnel list renders one card per tunnel
- [ ] Active count badge in header matches active tunnel count
- [ ] Badge hidden when count is 0
- [ ] Refresh button triggers list reload with spinner
- [ ] Empty state shown when no tunnels and not loading
- [ ] Footer shows "Last synced N ago" timestamp

### AC-4: CLI Warning Banner
- [ ] Banner shown when `lt` binary not detected
- [ ] Banner not shown when `lt` binary found
- [ ] Dismiss (×) hides banner for current session
- [ ] REST API operations still functional without CLI

### AC-5: Tunnel Cards
- [ ] Each card shows: name, protocol badge, status badge, status dot
- [ ] Each card shows: URL (or dash if creating), copy button, port, times
- [ ] Card left border color matches status (green/yellow/red/gray)
- [ ] Active dot pulses with ring animation
- [ ] Copy button copies URL to clipboard
- [ ] "Copied!" tooltip appears for 2 seconds after copy
- [ ] HTTP badge is blue, TCP badge is purple
- [ ] Stop button triggers stop flow with "Stopping…" state
- [ ] Delete button triggers delete (no confirmation — immediate)
- [ ] View Logs button only shown when tunnel has `inspect: true`
- [ ] Cards appear with staggered fade+slide animation (50ms offset each)

### AC-6: Create Tunnel Form
- [ ] Create section toggles with chevron rotation
- [ ] Port field: required, accepts 1–65535, shows error for out-of-range
- [ ] Name field: optional, max 50 chars
- [ ] Protocol toggle: switches between HTTP and TCP
- [ ] Expires dropdown: 7 options including "None"
- [ ] Advanced section collapses/expands independently
- [ ] Subdomain field shows "PRO" badge
- [ ] Auth checkbox reveals password input when checked
- [ ] Inspect checkbox enables request logging
- [ ] Create button disabled and shows limit message when at tunnel limit
- [ ] Create button shows "Creating…" with spinner while spawning
- [ ] CLI output area appears during creation with streaming text
- [ ] New card appears in list when tunnel URL confirmed

### AC-7: Account Info Section
- [ ] Account section collapses/expands
- [ ] Shows plan badge with correct color
- [ ] Shows active tunnel count vs limit

### AC-8: Logs Sub-view
- [ ] "View Logs" button navigates to Logs sub-view
- [ ] Header shows back arrow and "REQUEST LOGS"
- [ ] URL bar shows tunnel URL with copy button
- [ ] LIVE indicator shows with green dot when auto-refreshing
- [ ] PAUSED indicator shows when auto-refresh off
- [ ] Log table shows METHOD, PATH, STATUS, DURATION, TIME columns
- [ ] METHOD badges are color-coded per method
- [ ] STATUS codes are color-coded by range
- [ ] DURATION is color-coded (green < 100ms, yellow >= 1000ms)
- [ ] New rows prepend with fade-in highlight animation
- [ ] 500-row cap notice shown when limit reached
- [ ] Empty state shown when no logs
- [ ] Back arrow returns to Main view, restoring scroll position

### AC-9: Settings Sub-view
- [ ] Settings gear navigates to Settings sub-view
- [ ] Header shows back arrow and "SETTINGS"
- [ ] API key shown masked with "Change" button
- [ ] "Change" button returns to Setup view
- [ ] Protocol toggle saves immediately on change
- [ ] Expiration dropdown saves immediately on change
- [ ] Auto-refresh interval dropdown saves immediately on change
- [ ] CLI path input editable, auto-detected value shown
- [ ] "Disconnect Account" button shows inline confirm before acting
- [ ] Confirming disconnect clears key, stops tunnels, returns to Setup
- [ ] Cancelling disconnect restores button to default state

### AC-10: Responsive Layout
- [ ] Panel is 420px wide on viewports > 900px
- [ ] Panel is 380px wide on 750–900px viewports
- [ ] Panel is calc(100vw - 20px) on 650–750px viewports
- [ ] Panel is 100vw on viewports < 650px

### AC-11: Accessibility
- [ ] All interactive elements reachable by Tab
- [ ] Escape closes panel from any sub-view
- [ ] R key refreshes when panel focused and no input active
- [ ] Error messages use `role="alert"` and `aria-live="assertive"`
- [ ] Live status uses `aria-live="polite"`
- [ ] Focus trapped within panel while open
- [ ] Focus moves to correct element on sub-view transitions
- [ ] All icon-only buttons have `aria-label`
- [ ] Contrast ratios meet WCAG AA for all text elements

### AC-12: Reduced Motion
- [ ] All animations disabled when `prefers-reduced-motion: reduce`
- [ ] Pulse dot replaced with static dot
- [ ] Skeleton is static color block
- [ ] Panel appears instantly (no slide animation)

---

## 12. Component Inventory

| Component | File | Props summary |
|-----------|------|--------------|
| `TunnelPanel` | `TunnelPanel.tsx` | `isOpen, onClose` |
| `SetupView` | (internal) | `onValidated` |
| `MainView` | (internal) | `tunnels, isLoading, settings, account, onStop, onDelete, onViewLogs, onCreateTunnel` |
| `TunnelCard` | (internal or extracted) | `tunnel, onStop, onDelete, onViewLogs, animationDelay` |
| `CLIWarningBanner` | (internal) | `onDismiss` |
| `NetworkErrorBanner` | (internal) | `onRetry` |
| `CreateTunnelSection` | (internal) | `settings, onSubmit, isSubmitting, output, limitReached` |
| `AccountInfoSection` | (internal) | `account, isLoading` |
| `SkeletonCard` | (internal) | — |
| `EmptyState` | (internal) | — |
| `TunnelRequestLogs` | `TunnelRequestLogs.tsx` | `tunnel, logs, isLive, onToggleLive, onBack` |
| `TunnelSettingsView` | (internal to `TunnelPanel.tsx`) | `settings, onUpdate, onDisconnect, onBack` |
| `ProtocolToggle` | (internal) | `value, onChange` |
| `ExpiresSelect` | (internal) | `value, onChange` |
| `StatusDot` | (internal) | `status` |
| `ProtocolBadge` | (internal) | `protocol` |
| `StatusBadge` | (internal) | `status` |
| `PlanBadge` | (internal) | `plan` |
| `CopyButton` | (internal) | `text, aria-label` |
| `CollapsibleSection` | (internal) | `label, defaultOpen, children` |
