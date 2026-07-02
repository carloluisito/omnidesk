# Shell Sessions — Design Spec

**Date:** 2026-07-03
**Status:** Approved for planning
**Topic:** Plain shell sessions (run normal CLI commands) alongside AI agent sessions

## Problem

Every OmniDesk session today is a shell PTY with an AI CLI (`claude`) launched into it. Users have no way to run ordinary CLI commands (`git`, `npm`, `ls`, build scripts) in the same app without doing it *through* the agent. We want a plain terminal — both as its own session and as a companion beside an agent — so the user can work in a repo's shell without leaving OmniDesk.

## Goals

- A **shell session**: a session that spawns the PTY but launches **no** AI CLI.
- Create one **standalone** (first-class in the session rail) or as a **companion** in a split pane next to an agent session.
- Companion shells are **loosely coupled**: seeded to the agent's working directory at creation, then fully independent (no shared lifecycle).

## Non-Goals (v1)

- **Shell picker** (PowerShell / pwsh / git-bash selection). Platform default only. Deferred to a future version.
- Tight agent↔shell coupling (auto-open, auto-close, parent/child links).
- Any AI features in the shell (no model, no readiness detection, no quota).
- **Side-by-side split-pane placement.** The split-view types (`LayoutNode`, `SplitViewState`) exist in `ipc-types.ts`, but the renderer has **no** split-pane rendering — `MainView` supports only Grid and Focus modes. Building that layer is a separate feature. For v1 the companion is a normal shell session seeded to the agent's directory (see below); it is not rendered beside the agent.

## Core Concept

There is exactly **one new concept: a shell session** — a session whose `kind` is `'shell'` instead of `'agent'`. "Companion" is not a separate type; it is simply a shell session created from an agent session and seeded to that agent's working directory. Everything else reuses existing infrastructure (session rail, persistence, PTY spawn).

**Note (v1 scope correction):** the companion is seeded but *not* placed side-by-side — split-pane rendering does not exist in the renderer yet (see Non-Goals). "Open terminal here" creates the seeded shell session and switches to it. Side-by-side placement lands for free once a future split-view rendering feature exists, with no change to the shell-session core.

## Architectural Decision

**Model the difference with a `kind` discriminator (`'agent' | 'shell'`), not a `ShellProvider`.**

Rejected alternative — a `ShellProvider implements IProvider`: the provider abstraction encapsulates *AI CLI specifics* (`buildCommand`, `getReadinessPatterns`, `getModelDetectionPatterns`, model normalization). A shell has none of these, so a shell "provider" would be a chain of no-ops and lies, and model-detection/quota code would still run against it. A `kind` flag is the honest separation and places branches exactly where shell and agent genuinely differ.

The `kind` approach also reuses the session pool's existing two-phase spawn: `spawnShell()` (PTY only) already exists for pre-warming; a shell session is essentially a pooled shell that is never "activated" with a `claude` launch. This makes shell-session creation near-instant.

## Design

### 1. Data model (`src/shared/ipc-types.ts`)

- New: `export type SessionKind = 'agent' | 'shell';`
- `SessionCreateRequest.kind?: SessionKind` — defaults to `'agent'`.
- `SessionMetadata.kind?: SessionKind` — read as `'agent'` when absent (back-compat with persisted sessions from before this feature).
- Shell sessions carry **no** `providerId`, **no** `currentModel`, **no** `launchMode`. These fields remain `undefined`/`null` for shell sessions and consumers must tolerate their absence.

### 2. Spawn path (`src/main/cli-manager.ts`, `src/main/session-manager.ts`)

- `CLIManager` spawns shell-only for shell sessions: create the PTY at the working dir, wire output/exit handlers, and **do not** call `launchProviderCommand()`. Reuse/lean on the existing `spawnShell()` phase rather than adding a parallel spawn path.
- In `bufferOutput`, **skip model detection** (`detectModelFromOutput` and both detection phases) when the session is a shell. There is no model to detect.
- `SessionManager.createSession` branches on `request.kind`:
  - `'shell'` → spawn PTY only (or claim a pooled shell and skip activation).
  - `'agent'` (default) → today's behavior, unchanged.

### 3. Terminal behavior differences (`src/renderer/components/shell/Terminal.tsx`)

These are gated on the session's `kind`. For `kind === 'shell'`:

- **Ctrl+C passes through.** The existing interception (which catches `\x03`, shows `ConfirmDialog`, and never forwards to Claude because it exits Claude) is **disabled**. In a shell, Ctrl+C must interrupt the running foreground command like any normal terminal.
- **Claude-specific key remaps are off.** The Ctrl+Enter / Shift+Enter / Alt+Enter / Cmd+Enter "insert literal `\n`" affordance is a Claude-input convenience; a shell wants a real Enter. These remaps do not apply to shell sessions.
- **Readiness is immediate.** No "Claude Code / Sonnet / Tips for getting started" pattern match and no 5s fallback timeout. A shell is considered ready as soon as the PTY is running.

For `kind === 'agent'` (default), all of the above behave exactly as today.

### 4. UI

- **NewSessionSheet** (`src/renderer/components/shell/NewSessionSheet.tsx`) — entry point **A**: add a **"Terminal"** choice. When selected, the provider / model / launch-mode controls are hidden (they do not apply); only a working directory is required. Submitting creates a session with `kind: 'shell'`.
- **"Open terminal here" action** — entry point **C**: from an agent session's context menu, this creates a shell session seeded to the agent's current working directory, then switches to it. Loosely coupled — no lifecycle link back to the agent. (v1: not rendered side-by-side; see Non-Goals. It becomes a companion pane automatically if/when split-view rendering ships.)
- **Session rail / tiles** (`src/renderer/components/shell/`) — shell sessions render a **terminal glyph** in place of the model/quota badge. Anywhere the UI assumes a model exists, render a neutral **"Terminal"** label instead of a model name. Quota/burn-rate surfaces ignore shell sessions.
- **Shell used:** platform default — `cmd.exe` on Windows, `$SHELL` (fallback `/bin/bash`) on Unix. This matches the existing `createPtyProcess` shell selection; no new selection logic.

### 5. Lifecycle, persistence, limits

- Shell sessions count toward `MAX_SESSIONS` (10) like any session.
- Persisted and restarted across app restart like agent sessions. On restart, re-spawn the PTY at the working dir — there is no command to replay (shell sessions have no `launchMode`/provider command).
- Closing a shell session uses the same close flow as agent sessions: kill the PTY. No worktree cleanup unless a worktree was explicitly involved at creation (same rules as agent sessions).

### 6. Testing

- **Unit (main):** `CLIManager` shell spawn launches **no** provider command (`launchProviderCommand` not invoked); model detection is skipped in `bufferOutput` for shells.
- **Unit (shared):** `SessionMetadata.kind` defaults to `'agent'` when absent; `SessionCreateRequest.kind` round-trips.
- **Integration (renderer):** NewSessionSheet "Terminal" path creates a `kind: 'shell'` request and hides provider/model controls; Terminal Ctrl+C is passed through when `kind === 'shell'` and intercepted when `kind === 'agent'`.
- **Manual verification** (per standing preference for visual/UX work): the "Open terminal here" flow (confirm the new shell session seeds the agent's dir and lives independently), and the rail/tile terminal badge rendering.

## Risks / Notes

- Consumers that today assume `providerId`/`currentModel` are present must tolerate `undefined` for shell sessions. Audit rail/inspector/quota code paths for unguarded access.
- The session pool interaction: claiming a pooled shell for a shell session should skip the activation (`initializeSession` → `launchProviderCommand`) step entirely; verify the pool return/reset path handles a claimed-but-never-activated shell cleanly.
- Restart path must not attempt provider/model restoration for shell sessions.
