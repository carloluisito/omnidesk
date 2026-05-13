# Launch Mode Picker — Spec

**Created:** 2026-05-13
**Status:** approved
**Author:** carloluisito
**Baseline ref:** 367df9bcd5e7dc85e3e66956aeb8824a39fbeeb5 (main)

## Problem
OmniDesk currently hard-codes the choice between `claude` and `claude --dangerously-skip-permissions` via a single global "bypass permissions" setting. The branching lives at `src/main/cli-manager.ts:353` and `src/main/providers/claude-provider.ts:38` and is a binary toggle on app-wide state. Two consequences:

1. **No per-session choice.** A user who normally wants the default mode but occasionally wants the bypass mode (or vice versa) has to flip the global setting before each launch — easy to forget and easy to leak across sessions.
2. **No way to launch `claude agents`.** Claude Code v2.1.139+ ships a `claude agents` TUI that manages background sessions (dispatch, monitor, attach, stop). It's a normal CLI invocation; it would run perfectly inside an OmniDesk PTY pane. But there's no path to launch it from session creation today — the user has to spawn a default `claude` session, then drop to a shell prompt and type `claude agents`, which defeats the point.

We want: a **launch-mode picker at session-creation time** with at least three options — `claude` (default), `claude --dangerously-skip-permissions`, `claude agents`. Per-session. The TUI does its own UI inside the PTY; we don't reimplement it.

A previous feature-flow (`plans/abandoned/agent-view.{spec,plan}.md`) tried to build a parallel panel UI for Agent View; it was aborted on 2026-05-13 when the right architecture surfaced: host the TUI in a PTY, don't rebuild it. That work produced one keeper artifact — the **availability detector** at `src/main/agent-view/availability.ts` — which this spec reuses to gate the `claude agents` option.

## Goals
- Add a **per-session launch-mode picker** to OmniDesk's session-creation flow with at least three modes:
  - `claude` — default (current default behavior).
  - `claude --dangerously-skip-permissions` — current "bypass permissions" mode.
  - `claude agents` — Claude Code v2.1.139+ background-session TUI.
- The selected mode flows through `CLIManager` / `ClaudeProvider` to the actual command spawned in the PTY.
- The `claude agents` option is **gated on availability** (`getAgentViewAvailability(...)` from the kept item-#2 work). Unavailable → option hidden or disabled with a clear tooltip explaining the reason.
- The existing global "bypass permissions" setting **becomes the default selection** in the picker — back-compat preserved. The setting UI in the SettingsDialog stays; it just maps to the picker's default rather than being a runtime branch in CLIManager.
- No new IPC surface needed: the launch mode is passed through the existing `SessionCreateRequest` shape (a new optional field) into the existing `createSession` IPC method.
- No leak into the `IProvider` interface for non-Claude providers (Codex etc.) — launch-mode is Claude-specific and lives in `ClaudeProvider` / `CLIManager`'s Claude path only.

## Non-goals
- A parallel panel UI for background-session monitoring. The TUI is the UI.
- Re-implementing `claude agents` actions (dispatch / attach / stop / respawn / remove) outside the TUI. These happen inside the PTY.
- Modes for non-Claude providers (Codex etc.). They have their own provider; this feature touches only the Claude path.
- Multi-tenant / per-workspace launch defaults — could be a future setting; not in this slice.
- A first-class `--bg` invocation for dispatching individual background sessions from outside the TUI. The TUI handles this; an out-of-TUI dispatcher is a future feature if needed.
- Persisting per-session launch-mode preference across app restarts (the picker's default comes from the global setting; per-session choice is ephemeral).
- Anything platform-specific beyond reusing OmniDesk's existing cross-platform PTY layer.

## Constraints
- **Reuse existing UI components** (per `CLAUDE.md` "Pitfalls"). The picker should use existing select/radio components from `src/renderer/components/ui/`.
- **Match existing dialog style.** The picker lives inside the existing `NewSessionDialog` (`src/renderer/components/ui/NewSessionDialog.tsx`). Don't add a separate dialog.
- **`IProvider` interface stays clean.** Launch modes are Claude-specific. The new field on `SessionCreateRequest` is optional and only consumed by `ClaudeProvider`; other providers ignore it.
- **Availability detector reused as-is.** Don't rewrite item #2's `availability.ts` or the trimmed `agent-view-types.ts`.
- **Probe + availability resolution lives on the main process.** Renderer receives `AgentViewAvailability` over IPC (one new method: `agentView:availability` or — to keep IPC surface minimal — fold into the same probe used by the picker; see open question #4).
- **No shell injection.** Launch mode → command line construction must not allow user-controlled string interpolation. Each mode maps to a fixed argv array.
- **Probe `claude --version` once, with `timeout: 5000`, off the synchronous startup critical path.** Same lesson the previous feature-flow's review surfaced.
- **No global state library.** React hooks only (per `CLAUDE.md`).

## Assumptions & unknowns
- **E2E project location:** `e2e/` at repo root (confirmed — `e2e/app-launch.spec.ts`, `e2e/session.spec.ts`, etc. all live here).
- **Evidence path:** `e2e/screenshots/launch-mode-picker/` (to be created during execute).
- **Open questions:**
  1. **NewSessionDialog UX.** Does the current dialog have room for a labeled select / segmented control? Or does the picker live as a small "Advanced" affordance? Pick the simplest visible option; defer to UI judgment in `plan`.
  2. **Picker UI element.** Segmented control? Dropdown? Radio group? Recommend dropdown for ≥3 options that may grow; revisit if only 3 forever.
  3. **`bypassPermissions` setting fate.** Keep as the default-selection signal for the picker. The runtime branches in `cli-manager.ts:353` and `claude-provider.ts:38` are *replaced* by the new request-driven mode. The setting in `SettingsDialog` stays visible and labeled as "Default launch mode" (or similar) — its semantics shift from "always bypass" to "default selection in the picker".
  4. **Availability IPC surface.** The renderer needs to know if `claude agents` is available to enable/disable the option. Two options:
     - **(a)** Add an `agentView:availability` IPC invoke method (minimal — one method). The dialog fetches it once when opened.
     - **(b)** Add a broader `getLaunchModeAvailability()` method that returns availability for every mode in one shot, designed to grow as modes are added.
     Recommend (a) — minimum surface, mode-availability is per-mode anyway.
  5. **`claude agents` extra args.** Per docs, just `claude agents` with no flags. Honour `CLAUDE_CONFIG_DIR` if the user has it set (the PTY will inherit env). Confirm during plan.
  6. **Default-mode UX detail.** When the global `bypassPermissions` setting is `true`, should `claude agents` be a special-case override (some users may want both bypass on by default AND `claude agents` available as an option)? Recommend yes — the picker shows three independent options regardless of the bypass-permissions default; the default is just the *initial* selection.
  7. **Backwards compatibility for keyboard shortcut / quick session creation.** OmniDesk has some "new session" shortcuts that don't go through the dialog (e.g., default workspace, fast path). Do those need to expose mode selection? Recommend: no — fast paths use the default mode (driven by `bypassPermissions` setting); the picker is dialog-only.

## Acceptance criteria
- [ ] `NewSessionDialog` shows a "Launch mode" picker with three options visible: `claude`, `claude --dangerously-skip-permissions`, `claude agents`.
- [ ] Default selection matches the user's current `bypassPermissions` setting (`false` → `claude`, `true` → `claude --dangerously-skip-permissions`).
- [ ] `claude agents` option is disabled (with a tooltip explaining the reason) when `getAgentViewAvailability(...)` returns `{ status: 'unavailable', ... }`. Tooltip surfaces the `detail` string.
- [ ] Creating a session with each of the three modes spawns the corresponding command (`claude`, `claude --dangerously-skip-permissions`, `claude agents`) in the OmniDesk PTY.
- [ ] Existing global `bypassPermissions` setting still affects the picker's *default*; the setting UI in `SettingsDialog` is relabeled to clarify the new semantics ("Default launch mode" or similar wording).
- [ ] The runtime branches at `cli-manager.ts:353` and `claude-provider.ts:38` are removed and replaced by a single source of truth: the launch mode passed in `SessionCreateRequest`.
- [ ] The `IProvider` interface is not modified. Launch modes live inside `ClaudeProvider` / `CLIManager`'s Claude path; Codex sessions still work unchanged.
- [ ] One new IPC method (`agentView:availability` or equivalent) returns `AgentViewAvailability` to the renderer.
- [ ] Probe of `claude --version` runs ONCE at app start (cached for the app lifetime), with `timeout: 5000`, off the `createWindow` synchronous critical path (delayed-init block).
- [ ] E2E screenshot evidence: picker visible with three options + the `claude agents` disabled-state shown.
- [ ] No regressions in existing session creation, Codex provider, settings, or split view.
- [ ] `docs/repo-index.md` and the domain table in `CLAUDE.md` updated to reflect the new launch-mode-picker concept (and to remove any stale assumptions about the bypass-permissions runtime branch).

## Out-of-band notes
- **Predecessor:** `plans/abandoned/agent-view.{spec,plan}.md` (aborted 2026-05-13 after the design pivot was identified at item #5 dispatch time). The kept-from-predecessor work is:
  - `src/main/agent-view/availability.ts` — pure function `getAgentViewAvailability(cliVersion, env, settings)` returning a typed `AgentViewAvailability`.
  - `src/main/agent-view/availability.test.ts` — 35 tests covering the precedence rules.
  - `src/shared/types/agent-view-types.ts` — trimmed to only the `AgentViewAvailable` / `AgentViewUnavailable` / `AgentViewAvailability` interfaces.
- **Source doc for `claude agents`:** https://code.claude.com/docs/en/agent-view (fetched 2026-05-13). Research-preview status; minimum CLI version 2.1.139.
- **Kill switches** (gating the `claude agents` mode):
  - Setting `disableAgentView: true` in `~/.claude/settings.json`
  - Env var `CLAUDE_CODE_DISABLE_AGENT_VIEW` set to a non-empty, non-`0`, non-`false` value
- **Working tree at baseline (`367df9bc`):** clean for tracked files; untracked files present (omniagency files, `CUSTOM_COMMANDS_TESTING.md`, `SECURITY_TESTS_SUMMARY.md`, `TEST_RESULTS.md`, `docs/CUSTOM_COMMANDS_QA_PLAN.md`, `omniagency.json`, `specs/`, the kept item-#2 files, `plans/abandoned/`). The kept item-#2 files are part of this feature's baseline state — review-time diff against `367df9bc` will include them, which is fine since they are integral to gating the `claude agents` option.
- **Patterns to lean on:**
  - `NewSessionDialog.tsx` and `ui/` for picker UI components.
  - `cli-manager.ts` + `claude-provider.ts` for command construction (the runtime branches at line 353/38 are the surgery sites).
  - `git-manager.ts` for `execFile` + version-probe pattern (with timeout) — reuse this style for the one-shot `claude --version` probe.
