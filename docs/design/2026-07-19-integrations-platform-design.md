# Outbound Integrations Platform — Design Spec

**Date:** 2026-07-19
**Status:** Approved (user pre-approved Approach A + generic webhook connector; policy defaults adopted from requirements analysis)
**Branch:** `feat/integrations-platform`

## 1. Problem & Goal

A solo dev supervising multiple AI-CLI sessions can't watch OmniDesk continuously. The supervisory cockpit classifies who-needs-you *inside* the app; this feature extends that attention routing *beyond* the desktop and closes the loop with the tools people already live in.

Four jobs, one platform:

1. **Attention push** — needs-you states (awaiting-input / awaiting-approval / errored / done) pushed to Telegram / Slack / Discord.
2. **Ship-it flow** — when a session finishes, offer a diff summary + one-tap PR creation via GitHub.
3. **Work intake** — pick a GitHub issue, spawn a worktree session pre-seeded with the issue context.
4. **Status broadcasting** — periodic fleet digests to a channel (default off).

**Audience:** solo devs. Setup = paste a token/webhook in Settings → Integrations, test ping, done.

**Two-way model:** notifications deep-link into the existing remote-access PWA (`?session=<id>` — net-new renderer capability, in scope). No input injection over chat APIs — chat platforms never enter the code-execution path.

## 2. Architecture

New domain following the 3-layer pattern: `IntegrationManager` (main) → `useIntegrations` (renderer) → `IntegrationsPanel` + feature surfaces.

```
SessionManager state tap ──► IntegrationManager ──► DeliveryQueue ──► IConnector.deliver()
 (activity states, exits)      │  edge-trigger dedup     (token bucket,      ├ TelegramConnector
                               │  routing policy          retry/backoff,     ├ SlackConnector
 Digest scheduler ────────────►│  deep-link builder       bounded)           ├ DiscordConnector
                               │                                             └ WebhookConnector
 GitHubService (gh CLI) ◄──── ship-it / intake IPC   (actions, not messaging — separate from connectors)
```

**Key boundary decision:** message connectors implement `IConnector` (`deliver`, `test`); GitHub is *not* a message connector — it's `GitHubService`, an action provider wrapping the `gh` CLI (execFile + per-directory mutex, copying `GitManager`'s pattern). Forcing PR creation through a `deliver()` interface would be contrived. The Settings panel still lists GitHub alongside connectors, showing preflight status (installed / authenticated).

### 2.1 Files

**Shared** (`src/shared/integration-types.ts`): `ConnectorId`, `IntegrationEvent`, `IntegrationsSettings`, `ConnectorTestResult`, `DeliveryStatus`, `GitHubPreflight`, `GitHubIssue`, `ShipItPreview`, `CreatePRRequest/Result`.

**Main** (`src/main/integrations/`):
- `connector.ts` — `IConnector` interface: `id`, `displayName`, `isConfigured(cfg)`, `test(cfg)`, `deliver(cfg, msg)`. Stateless; config passed per call (settings are the single source of truth).
- `connector-registry.ts` — mirrors `ProviderRegistry` (register/get/list).
- `connectors/telegram-connector.ts` — Bot API `sendMessage` (HTML parse mode), `test` = `getMe` + test message.
- `connectors/slack-connector.ts` — incoming webhook POST (mrkdwn text).
- `connectors/discord-connector.ts` — webhook POST (content, no embeds in v1).
- `connectors/webhook-connector.ts` — generic POST of the raw `IntegrationEvent` JSON; optional `X-OmniDesk-Signature` HMAC-SHA256 when a secret is set.
- `message-format.ts` — pure: `IntegrationEvent` → per-connector text. Agent-session copy never says "awaiting approval" (bell only yields awaiting-input).
- `attention-policy.ts` — pure: edge-trigger + debounce state machine (per-session).
- `delivery-queue.ts` — per-connector token bucket (20 msg/min), retries with exponential backoff honoring `Retry-After` (max 3), bounded queue (50, drop-oldest), per-connector last-status.
- `integration-manager.ts` — the hub: subscribes to SessionManager's state tap, applies routing + policy, builds deep links from live remote status, runs the digest scheduler, exposes test/status/sendDigestNow, and notifies channels when a PR is created.
- `github-service.ts` — `gh` wrapper: `preflight(dir)` (binary found + `gh auth status` + remote check), `listIssues(dir)`, `createPR(dir, {title, body, draft, baseBranch})`, all execFile + per-directory mutex, 10 MB maxBuffer, `GIT_TERMINAL_PROMPT=0`-style non-interactive env (`GH_PROMPT_DISABLED=1`, `GH_NO_UPDATE_NOTIFIER=1`).

**Renderer:**
- `hooks/useIntegrations.ts` — settings read/patch (via existing `settings:get/set`), `testConnector`, delivery statuses (event-subscribed), GitHub preflight.
- `components/shell/IntegrationsPanel.tsx` — panel (RemoteAccessPanel precedent): connector cards (paste token/webhook → Test → enable), event toggles, digest config, per-repo mute, GitHub status + fix-it hints. Opened via Cmd+K palette ("Integrations…") and an activity-bar button.
- `components/shell/ShipItSheet.tsx` — diff summary (branch, base, files/±lines, commits), editable PR title/body, `[Create PR]` / `[Create draft PR]`. Surfaced from CockpitPanel items and the session context menu.
- `components/shell/IssuePickerSheet.tsx` — work intake: list open issues for the active repo → selecting one prefills `NewSessionSheet` (name, worktree branch, seeded prompt).
- `App.tsx` — remote deep-link handling: on load with `?session=<id>`, once sessions are hydrated, activate that session's repo + focus the session (one-shot, remote mode only).
- `Terminal.tsx` — `initialPrompt` seeding: when a session was created with `initialPrompt`, type it into the terminal at CLI readiness **without submitting** (no `\r`) — the user reviews and hits Enter. Never auto-submits.

### 2.2 Event source (main-process tap)

`SessionManager` gains `addStateListener(cb)` — a plain listener array invoked from `emitActivityState` (and from exit handling), enriched with `SessionMetadata` context (name, kind, workingDirectory, providerId, worktree branch). `IntegrationManager` is the only v1 subscriber. No IPC round-trip; this is main-process fan-out at the same tap the renderer event uses.

Known constraint (verified live): tail classification is shell-only; agent sessions signal via the terminal bell → `awaiting-input` only, and only when the CLI's bell channel is on. Notification copy respects this; the panel shows a one-time hint to enable `preferredNotifChannel: "terminal_bell"` for Claude.

### 2.3 IPC (all `integrations:*`, contract-driven as usual)

| Method | Kind | Purpose |
|---|---|---|
| `integrations:testConnector` | invoke | `(connectorId, candidateConfig)` → `ConnectorTestResult` (probe with unsaved config) |
| `integrations:getDeliveryStatuses` | invoke | per-connector last delivery result for panel badges |
| `integrations:sendDigestNow` | invoke | on-demand fleet digest |
| `integrations:githubPreflight` | invoke | `(dir)` → `{ installed, authenticated, hasRemote, error? }` |
| `integrations:listIssues` | invoke | `(dir)` → `GitHubIssue[]` (number, title, labels, url, body) |
| `integrations:getShipItPreview` | invoke | `(sessionId)` → branch/base, files changed, ±lines, commits |
| `integrations:createPR` | invoke | `(sessionId, {title, body, draft})` → `{ url }`; idempotent guard per branch |
| `integrations:deliveryStatus` | event | push per-connector status changes to the panel |

Settings ride the existing `settings:get/set` (new `integrations` section in `AppSettings`). `SessionCreateRequest` gains `initialPrompt?: string`.

### 2.4 Settings schema (`AppSettings.integrations`)

```ts
interface IntegrationsSettings {
  connectors: {
    telegram?: { enabled: boolean; botToken: string; chatId: string };
    slack?:    { enabled: boolean; webhookUrl: string };
    discord?:  { enabled: boolean; webhookUrl: string };
    webhook?:  { enabled: boolean; url: string; secret?: string };
  };
  notify: { attention: boolean; done: boolean; errored: boolean; debounceSeconds: number }; // defaults: true/true/true/15
  digest: { enabled: boolean; intervalMinutes: number };  // default: off / 60
  perRepo: Record<string, { muted: boolean }>;            // keyed by repo path; global default + per-repo mute (v1)
  shipit: { notifyOnPR: boolean };                        // default: true
}
```

Tokens are stored plaintext in `settings.json` — same posture as the existing remote-access token. `safeStorage` keychain migration is an explicit fast-follow, noted in the panel. Tokens are never logged.

## 3. Behavior policies (adopted defaults)

- **Edge-triggered alerts:** notify on *entering* an attention state (awaiting-input / awaiting-approval / errored / done), debounced 15s per session; no re-alert until the session leaves the attention state and re-enters. Digests are snapshots, exempt from dedup.
- **No tunnel → no dead links:** notifications always send; when the tunnel is up, they carry `"<tunnel-url>/?token=<t>&session=<id>"`, otherwise a plain "remote is offline — open OmniDesk" line. Never a stale/404 link.
- **Delivery failure is never fatal:** retries exhausted → event dropped + connector badge shows the error in the panel. Never crashes main, never blocks a session.
- **Ship-it offers, never auto-creates:** trigger is the done/exited edge; the notification/cockpit surfaces the offer; PR creation is always an explicit user action in `ShipItSheet`. Duplicate-guard: one PR per branch (preflight `gh pr view` check).
- **Work intake follows the repo's worktree law:** `git fetch` → worktree from `origin/main`, branch `feat/<issue-number>-<slug>` (collision → `-2` suffix), issue title+body seeded as `initialPrompt` (typed, not submitted).
- **Digest:** default off; presets (30m/1h/daily); skip-send when the whole fleet is idle; "Send now" button.

## 4. Error handling

- Connector HTTP failures: classify 429 (honor `Retry-After`) vs 4xx (config error → badge, no retry) vs 5xx/network (backoff retry ×3).
- `gh` missing/unauthenticated: GitHub-dependent buttons disabled with a fix-it hint (`winget install GitHub.cli` / `gh auth login`); IPC methods return typed preflight failures, never throw opaquely.
- Malformed settings section: fall back to defaults (same tolerance as other settings sections).
- Deep-link to a dead session id: PWA falls back to normal root view silently.

## 5. Testing

- **Pure logic (main/shared, node env):** `attention-policy` (edge/debounce/re-arm), `message-format` (per-connector copy, agent-vs-shell wording, no-link fallback), `delivery-queue` (token bucket, Retry-After, drop-oldest), HMAC signing.
- **Connectors:** mocked `fetch` — payload shape per service, test-ping contract.
- **`github-service`:** mocked `execFile` — preflight branches, issue parsing, PR create/duplicate-guard.
- **`integration-manager`:** mocked SessionManager tap + connectors — routing, per-repo mute, digest skip-when-idle.
- **Renderer (jsdom):** `useIntegrations` (contract-derived electronAPI mock), panel connect/test flow, deep-link focusing in App, initialPrompt seeding gate in Terminal (no `\r` sent).
- E2E: not in scope (user preference: manual testing for UI).

## 6. Out of scope (explicitly)

- Input injection / approve-buttons in chat apps.
- Team/multi-user routing, identity.
- GitLab (the `IConnector`/service seams leave room; not built now).
- Keychain token storage (fast-follow).
- Per-session routing granularity (schema leaves room).
