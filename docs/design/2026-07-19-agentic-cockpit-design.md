# OmniDesk Agentic Cockpit — Design Spec

**Date:** 2026-07-19
**Status:** Approved direction; ready for implementation planning
**Rung:** One (attention router + its foundation) of the supervisory-cockpit ladder

> ## ⚠️ Update (2026-07-19) — agent classification deferred; headless emulator required
>
> **Shipped in #202/#207** — the headless-emulator fix described below
> (`@xterm/headless`-backed `ScreenModel`, wired into `SessionManager.setupClassifier`
> for agent sessions) has landed on `main`. This callout is kept as historical
> context for why the tail-based approach was gated to shells in the first place;
> see `CLAUDE.md`'s "Attention cockpit / session-state classifier" entry for the
> current, shipped design.
>
> Live testing against **Claude Code v2.1.x** proved the tail-based classifier
> (§4: rolling byte tail + output quiescence) **cannot classify agent CLIs**.
> Confirmed from instrumented logs: Claude Code renders its entire REPL in the
> terminal's **alternate-screen buffer** (`?1049h`) and **repaints continuously**
> — even when idle (footer/token counter). So the classifier never observes a
> "quiet" tail to settle on, and the alt-screen guard holds it pinned. This is
> the §8 "repaint/alt-buffer" risk — but it applies to Claude's **normal** REPL,
> not only `agents` mode as originally scoped.
>
> **Decision:** ship the cockpit **plumbing** (rail vocabulary, ⌘J overlay,
> toasts, IPC, StatusBar pill) plus **shell-session** classification, and gate
> the classifier to `kind === 'shell'` (see `SessionManager.setupClassifier`).
> Agent sessions surface only their process lifecycle for now (running via the
> rail default; errored/exited via `SessionMetadata.status`).
>
> **Correct fix (next):** classify the **rendered screen**, not a byte tail —
> feed each PTY into a headless terminal emulator (`@xterm/headless`, the pure-JS
> sibling of the renderer's xterm) and match markers against the visible buffer
> on a fixed interval. xterm handles the alt-screen + absolute-cursor repaints
> internally, so no quiescence is needed and what we classify equals what the
> user sees. This reuses `IProvider.getStateSignals()` + the pure detector and
> replaces `line-reducer` + `alt-screen-tracker`. It is the Phase-4 "headless
> emulator" item, promoted to required for agent classification.

> ## ✅ Update 2 (2026-07-19) — agent "needs you" signal SHIPPED via the terminal bell
>
> The empirical probe (`docs/experiments/2026-07-19-bell-attention-probe.md`,
> PR #58) found a signal that sidesteps the repaint problem entirely: with
> `preferredNotifChannel: "terminal_bell"` set, **Claude Code rings a bare BEL
> exactly when it needs the user** (turn finished, question/permission prompt
> up) and stays silent while working. `BareBellDetector`
> (`src/main/session-state/bell-attention.ts`) watches the output tap
> escape-aware (OSC/DCS-terminator BELs never count — observed live via an
> OSC 52 clipboard write), emits `awaiting-input` (reason `'bell'`) through the
> existing `onSessionStateChanged`, and clears on `sendInput`. The cockpit,
> toasts, and pill light up for agent sessions with zero renderer changes.
>
> **Scope honesty:** the bell is one undifferentiated "needs you" ding — it
> cannot distinguish done / question / approval, requires the bell channel to
> be enabled in the CLI's settings, and errored/exited still come from process
> lifecycle. The headless-emulator rewrite above remains the path to *richer*
> agent states (differentiated approval vs. input, error banners); it is no
> longer required for the core attention signal. Claude Code hooks
> (Stop/Notification, `session_id`-correlated) are the assessed phase-2 upgrade
> for differentiation — see the probe findings note.

## 1. Problem & Direction

OmniDesk today is a **session host**: a human opens a repo, spawns a Claude/Codex session per worktree, and drives each terminal by hand. The human is the orchestrator. We are pivoting OmniDesk toward being a **supervisory cockpit** — the app classifies each session's live state from its PTY output and routes the user's attention to whichever agent needs them (needs-approval / waiting-for-input / errored / done), so the user supervises a fleet instead of babysitting terminals.

**Litmus test for every feature (the north star):** does it *remove* a human from the loop (agentic) or *add* one (anti-agentic)? A manual source-control panel — stage, hand-write a commit message, click commit — is anti-agentic and explicitly deprioritized. The attention router is the opposite: it lets one person supervise N semi-autonomous agents with less attention each.

**Rung one = the attention router.** Everything higher on the ladder (goal→fleet dispatch, autonomous runs, inter-agent coordination) stacks on the same foundation: an honest, per-session live-state signal. This spec delivers that signal and the cockpit UX that consumes it.

## 2. Chosen Approach

**Provider-owned state signals feeding a main-process `SessionStateClassifier`.**

- The **pure classification engine** lives in `src/shared/` (a sibling of the existing `model-detector.ts`), so it is table-testable with zero OS mocks.
- **Per-provider marker tables** live behind a new `IProvider.getStateSignals()` method — the exact idiom already used for `getReadinessPatterns()` / `getModelDetectionPatterns()`.
- The **stateful timer/tail machine** lives in a new `src/main/session-state/` module, wired at the single `onOutput`/`onExit` tap.
- The **renderer** only consumes a new `session:stateChanged` event and maps it onto the already-built (but currently unreachable) `STATUS_META` vocabulary.

**Why this and not the alternatives:** Three approaches were designed and adversarially judged (accuracy / false-positive-trust / architecture-fit). Pure-pattern-matching and provider-owned-hooks tied (avg 5.7); hybrid-fusion trailed (4.5). We take **provider-owned hooks as the backbone** because it reuses the codebase's single most-trusted, best-tested seam — the provider-parameterized detection pipeline in `cli-manager.ts:474-523` — and placing the pure engine in `src/shared` gives the cheapest high-value test surface. We then **graft the three fusion pieces the judges praised** and that materially raise trust:

1. **Authoritative PTY exit-code** (with a `userInitiated` flag so a user Stop never paints red).
2. A **main-side alt-screen tracker** (which also fixes audit finding R4.1).
3. **Asymmetric fast-in / slow-out hysteresis** to stop flapping.

This yields the trust of signal-fusion without its accuracy penalties, on the lowest-risk architectural seam.

## 3. Foundation Fixes (Phase 0 — must land first)

The attention router's ground truth is `SessionMetadata.status` and a live, non-blank PTY stream. Five bugs make those untrustworthy today; they are Tier-0 because the router inherits every one of them for free.

### F1 — Await spawns and gate status on success/failure
- **Files:** `src/main/session-manager.ts:352-356` (fallback spawn), `:366` (unconditional `status='running'`), `:645-656` (`restartSession` try/catch).
- **Change:** Wrap the fallback branch in try/catch and `await` both calls: `try { if (isShell) await cliManager.spawnShellSession(); else await cliManager.spawn(); metadata.status='running'; } catch (err) { metadata.status='error'; metadata.error=String(err); }`. Still `sessions.set(id, ...)` so a failed session is visible/closeable; emit `onSessionCreated` with the real status. In `restartSession`, add `await` before both spawn calls so the existing synchronous try/catch (currently dead code for async rejections) actually catches failure. Ensure `cliManager.destroy()` tolerates a PTY that never spawned.
- **Why it blocks the cockpit:** A session whose PTY never spawned (bad cwd, missing binary, ConPTY failure) is today recorded and broadcast as `running` with an unhandled rejection — the worst false signal for a router: invisible by construction (shows healthy, emits no output, no exit event will ever correct it). The router would suppress attention on a dead session.

### F2 — Insert the session into the map before async activation
- **Files:** `src/main/session-manager.ts` — move `this.sessions.set(id, { metadata, cliManager: null })` to right after `metadata` is built (~`:255`); update the entry's `cliManager` in place after each assignment (pool ~`:320`, pool-fallback ~`:336`, direct ~`:350`); remove the redundant trailing `set` at `:363`.
- **Why it blocks the cockpit:** The `onExit`/`onModelChange` closures bail on `this.sessions.get(id)` being undefined, but the entry isn't inserted until after `await cliManager.initializeSession(...)` (which includes a 200ms settle). Any exit/model event in that window is silently dropped. A crash-on-launch pooled session — disproportionately likely during fleet-wide activation, exactly when the cockpit watches hardest — would sit at `starting` forever, never flagged, never bucketed errored, never finalized.

### F3 — Persist model+launchMode; extract one shared `wireCliManager()`; restore restart scrollback
- **Files:** `src/shared/ipc-types.ts:47-63` (add `model?: ClaudeModel`, `launchMode?: LaunchMode` to `SessionMetadata`); `src/main/session-manager.ts:245-255` (populate from request), `:581-588` (pass to restart CLIManager), `:613-622` (add `appendScrollback` to restart `onOutput`); consolidate `:259-310` and `:590-638` into one private `wireCliManager()`.
- **Change:** Add the two starting-intent fields (distinct from the existing live-detected `currentModel`). Collapse the ~120 lines of duplicated, already-drifted callback wiring into one `wireCliManager(mgr)` used by both create and restart — this restores the dropped `appendScrollback` on restart and becomes **the single output tap the classifier hooks into**.
- **Why it blocks the cockpit:** (1) `launchMode` determines the CLI's entire output shape (`agents` TUI vs plain `claude`) that the classifier parses; silently reverting it on restart makes the classifier apply the wrong marker set at the moment a session most needs re-classification. (2) The classifier must tap output in **one** place for both create and restart, or restarted sessions never classify.

### F4 — Provider-aware, bounded, shell-skipping readiness buffer (both processes)
- **Files:** `src/main/history-manager.ts:41-54,111-177` (`recordOutput`); `src/main/session-manager.ts:282-292` (pass kind/providerId to `recordOutput`); `src/renderer/components/Terminal.tsx:765-854` (MultiTerminal `onOutput` buffering); `src/shared/claude-detector.ts:48-65` (use the existing, unused `isProviderReady`/`findProviderOutputStart`).
- **Change:** **Main:** skip the readiness gate entirely for `kind==='shell'` (record immediately); for non-Claude providers use `isProviderReady` with the provider's `getReadinessPatterns()`; cap `preClaudeBuffer` at 8KB and give up (flip ready, flush) past the cap, mirroring `cli-manager.ts:499`. **Renderer:** thread `providerId` into MultiTerminal, use `isProviderReady` for non-Claude, and add a hard fallback — if a session's output buffer exceeds N bytes or T ms without matching, flush raw and mark ready anyway so a terminal can never stay blank.
- **Why it blocks the cockpit:** Today a Codex session's output never matches Claude-only patterns, so the renderer can show a permanently **blank** terminal (zero signal for the classifier) and the main-process history buffer leaks unbounded O(n²) for shell/Codex. Guarantees every session — including the long-running shells and Codex agents the cockpit most needs to supervise — has a live, non-blank stream.

### F5 — Reconcile SessionPane vs rail status contradiction
- **Files:** `src/renderer/components/shell/SessionPane.tsx:25,115-142` (`isStopped`); `src/renderer/components/shell/SessionRail.tsx:16-20` (`mapTabStatus`).
- **Change:** Delete `SessionPane`'s independent `isStopped = session.status !== 'running'` re-derivation and drive the "stopped" overlay from the same mapped `SessionStatus` the rail uses. This is the seam the classifier's new state plugs into (the `mapTabStatus` rewrite happens in Phase 2).
- **Why it blocks the cockpit:** Two UI surfaces disagree on the same `exited` state (rail shows quiet `idle`, pane shows an alarming full-screen "stopped") because no single owned `SessionStatus` drives both. The cockpit needs one authoritative status per session.

## 4. The Classifier (Phase 1)

### 4.1 Placement
**Main process.** The router must classify sessions the user is *not* looking at (unmounted `TerminalHost` slots, backgrounded, remote/phone). Only main sees every session's full stream from creation via the single `onOutput` tap; it owns the wall-clock quiescence timers (renderer timers throttle when backgrounded — exactly when "who needs me" matters) and the native exit/model events. Computed state fans out to desktop + every remote client for free via the existing `IPCEmitter` → `ClientHub` broadcaster, with no double-classification.

### 4.2 State taxonomy
| State | Meaning | Router urgency | Maps to `SessionStatus` |
|-------|---------|----------------|--------------------------|
| `initializing` | PTY up, CLI not yet at ready banner (reuses readiness gate) | ignored | `idle` (neutral until ready) |
| `working` | Bytes flowing and/or interrupt-affordance present (`esc to interrupt` / spinner) | none | `thinking` / `live` |
| `awaiting-approval` | Composite permission/trust prompt at tail while quiescent | **highest** — agent is blocked ON you | `needs-approval` (new `STATUS_META` member, non-pulsing) |
| `awaiting-input` | Quiescent at an interactive prompt carrying a pending question | needs you | `awaiting` |
| `done` | Quiescent at ready prompt **after** substantive output this turn, unacknowledged | needs review (below approval/error) | `done` |
| `errored` | Non-zero PTY exit (authoritative); optionally a narrow fatal-banner while quiescent | high | `errored` |
| `idle` | Quiescent at ready prompt, nothing new since last acknowledge | ignored | `idle` |
| `exited` | Clean exit or user Stop (`userInitiated`) | neutral | `stopped`/`idle` |

**REPLs don't exit after a turn**, so `done` — not process exit — is the real "finished a turn, come review" event.

**Shell reduction:** `kind==='shell'` sessions classify to `working` / `idle` / `exited` **only** — never `awaiting-approval`/`awaiting-input`/pattern-`errored`. A returning shell prompt is `idle`, not "needs approval." Mirrors the existing kind-driven guards (`cli-manager.ts:478`, the Ctrl+C branch).

### 4.3 Detection mechanism
Per **flushed chunk** (in `wireCliManager`'s `onOutput`, after CLIManager's 16ms batch — never per raw byte):
1. Alt-screen scan.
2. Append to a bounded ~8KB rolling tail.
3. Run a **line-reducer** to collapse CR / erase-line / cursor-line repaints into the last ~40 visual lines (this is what makes an answered-and-erased approval box actually leave the tail, defeating repaint-smear).
4. ANSI-strip.
5. **Leading edge:** any fresh visible content → emit `working` immediately, set `hadOutputSinceView=true`, re-arm the quiescence timer (`QUIET_MS ≈ 800–1200ms`). Interrupt-affordance present → force `working` and **veto** `idle`/`done` even across quiescence (kills the "slow silent tool call reads as done" flap).

On the **quiescence timer** firing: if alt-screen open → suppress transition (hold prior state); else test `getStateSignals` in priority order (`approval` > `awaitingInput` > `fatalError`) anchored to the tail **end**; on match emit that state; else if `hadOutputSinceView` → `done`; else `idle`. Require **2 consecutive quiet ticks** (dwell) before emitting `done`/`idle`.

`onExit` → `exitCode !== 0 && !userInitiated` ⇒ `errored`, else `exited` (authoritative, overrides text). Emit `onStateChange` **only on a state delta**, coalesced ≤ 1 transition / 150ms.

### 4.4 Anti-false-positive rules
- ANSI-strip before matching so cursor/color redraws never phantom-match.
- Line-reducer collapses in-place repaint frames (the key smear fix).
- **Tail-end anchoring** — approval/prompt/error must match the last visual lines, not anywhere in buffer.
- **Composite** approval markers (question line AND numbered triad/`❯`), never a bare keyword.
- `errored` is authoritative only from non-zero exit; text fatal-banners are narrow, line-anchored, and only fire after quiescence — an agent printing "Error:" while fixing a bug does **not** trip `errored`.
- Asymmetric fast-in/slow-out debounce + 2-tick dwell before `done`/`idle`; emit on delta only.
- Interrupt-affordance veto on `idle`/`done` promotion.
- Alt-screen suppression while a TUI/editor is active.
- Bounded 8KB tail — no O(n²) rescan.
- `kind==='shell'` excluded from all pattern-based attention states.

**Bias-to-surface (anti-silent-miss):** when quiescent and not confidently clean-idle and `hadOutputSinceView` is true, classify as `done` (surfaced) rather than `idle` (hidden). `awaiting-approval` requires a positive composite match; if the wording drifts, the state degrades to `done` (still surfaced), never to `idle`. A cockpit that over-surfaces is annoying; one that silently hides a blocked agent is fatal — uncertainty always resolves toward surfacing.

### 4.5 Provider handling
Add `getStateSignals(): { working: RegExp[]; approval: RegExp[]; awaitingInput: RegExp[]; fatalError: RegExp[] }` to `IProvider` (`src/main/providers/provider.ts`) — the 10th method, same idiom as `getReadinessPatterns`/`getModelDetectionPatterns`.

- **Claude** (`claude-provider.ts`): `working=[/esc to interrupt/i, spinner glyphs]`, `approval=[COMPOSITE: /Do you want to (proceed|make this edit|create|run)/i with the numbered triad /1\. Yes/ + /2\. Yes,? and/ + /3\. No/, plus /Do you trust the files/]`, `awaitingInput=[a reappeared prompt box carrying a question]`, `fatalError=[/API Error/, /Credit balance too low/, /rate limit/i]`.
- **Codex** (`codex-provider.ts`): its **own** approval (`/allow.*command/i`, `/\[y\/n\]/i`, `/approve/i`), spinner, prompt glyphs, and error strings — **authored and fixture-tested against captured real Codex transcripts** (hard ship gate; do not ship Claude strings for Codex).
- **No provider (shell):** reduced quiescence-only mode.
- A 3rd provider = implement one method.

### 4.6 New & changed files
**New:**
- `src/shared/state-detector.ts` — pure `detectStateFromTail(reducedTail, signals, ctx)` → candidate state (sibling of `model-detector.ts`; shared-project testable).
- `src/shared/line-reducer.ts` — CR/erase-line/cursor-line reducer → last-N visual lines (pure, testable).
- `src/main/session-state/classifier.ts` — per-session stateful machine (rolling tail, quiescence timer, `hadOutputSinceView`, hysteresis, exit fusion); `onOutput`/`onExit`/`onModel`/`getState`/`onStateChange`.
- `src/main/session-state/alt-screen-tracker.ts` — CSI `?1049`/`1047`/`47` `h|l` membership scanner (split params on `;`, test membership — fixes audit R4.1; main becomes authoritative for alt-screen, renderer kitty stays for keyboard encoding only).

**Changed:**
- `src/main/providers/provider.ts` — add `getStateSignals()` + `StateSignals` type.
- `src/main/providers/claude-provider.ts`, `codex-provider.ts` — implement `getStateSignals()`.
- `src/main/session-manager.ts` — instantiate one classifier per session inside `wireCliManager()` (F3); tap `classifier.onOutput/onExit/onModel`; on `onStateChange` set `metadata.activityState` and emit `onSessionStateChanged`; dispose the timer on close/stop/exit/destroyAll; reset `activityState` on load (transient — never trust the persisted value).
- `src/shared/ipc-types.ts` — add `SessionActivityState` union + transient `activityState?: SessionActivityState` on `SessionMetadata` + `SessionStateChangeEvent { sessionId; state; reason?; at }`.
- `src/main/cli-manager.ts` — reuse existing ANSI-strip; optionally expose interrupt-affordance presence (no new hot-path regex beyond existing model-detect work).

**New IPC contract:** add `onSessionStateChanged` as an `EventContract` in the three parallel arrays of `src/shared/ipc-contract.ts` (`IPCContractMap` ~`:144`, channels ~`:317` → `session:stateChanged`, kinds ~`:480` → `event`), mirroring `onModelChanged` exactly. Preload bridge, `ElectronAPI` type, and remote WS fan-out auto-derive.

## 5. Cockpit UX (Phases 2–3)

**Principle:** finish wiring the visual vocabulary that already exists (`STATUS_META` in `shell-utils.ts:63-70`, unreachable per audit R3.5) and add **one** new cross-repo overlay for the attention queue. Reuse every existing row/chip/avatar/toast primitive; invent no new visual language.

### 5.1 Rail changes (Phase 2)
- `shell-utils.ts:6,63-70` — add a 7th `SessionStatus` member `needs-approval` to the union and `STATUS_META`, with a **non-pulsing** badge/ring treatment (a decision-needed reads differently from "still running"). Keep `chip:'warn'`.
- `SessionRail.tsx:16-20` — rewrite `mapTabStatus` to read the classifier's `activityState` from `TabData` **1:1** onto `SessionStatus` instead of the 3-way process-lifecycle collapse. This single change also flows into `RightInspector`'s `StatusChip` and `SessionTile` chips for free.
- `SessionRail.tsx:22,166-174` — add an attention-priority comparator ahead of `applyOrder` so `needs-approval`/`errored` sort to the top of the Active group (does not disturb drag-reorder).
- `SessionRail.tsx:336-388` — add one inline "N need you" pill to the repo header stats row, copied from the StatusBar `otherLive` pill pattern, scoped to the current repo.

### 5.2 "Who needs you" surface (Phase 3)
- **New `CockpitPanel.tsx`** — a cross-repo overlay (NOT a third per-repo `MainView` mode; attention spans every repo while `MainView` is scoped to one). Styled after `Palette.tsx`'s `.p4-overlay` shell. A single sorted list (`needs-approval` > `awaiting-input` > `errored` > `done`, then longest-waiting first) of every non-idle session across all repos. Each row = repo name + agent letter/color + `STATUS_META` chip + last-output line (reuse `useSessionPreviews().outputSnapshots`, already tails 8 lines) + Jump / Dismiss buttons.
- **New `useAttentionQueue.ts`** — derives the sorted cross-repo list from `activityState` + `useSessionPreviews`; tracks a client-side acknowledged set (`sessionId → timestamp`) so a session stops re-alerting until its state changes again; fires the toast on **backgrounded** state transitions.
- `RepoActivityBar.tsx:53,148,186` — add a per-repo needs-you badge alongside the existing live-dot, plus a persistent cockpit icon-button with a total badge count.
- `StatusBar.tsx:75-88` — add an "N need you" pill next to the existing `otherLive` pill.
- `App.tsx:403-427,436-465` — new **Cmd+J** shortcut + palette action to open `CockpitPanel`; optional **Cmd+Shift+J** to cycle to the next session needing you.

### 5.3 Interactions
- **Jump-to-agent:** clicking a `CockpitPanel` row / a `StatusBar` or `RepoActivityBar` pill / a `needs-approval` `SessionRow` composes the three setters App already exposes — `setActiveRepoId` + `onSelectSession` + `setMode('focus')`. Nothing new.
- **Backgrounded toast:** when a session the user is *not* viewing flips to `needs-approval`/`awaiting-input`/`errored`, `dispatchToast` with a persistent (actionable, no-duration) toast carrying a real "Jump" `ToastAction`. Reuses the existing `{label, onClick, variant}` type.
- **Dismiss/acknowledge:** marks the session acknowledged in `useAttentionQueue`'s local set so it stops re-toasting and deprioritizes until its classifier state changes again. Purely client-side; does not touch the agent.
- **Inline Approve** (type `y`/Enter into an unfocused PTY): **out of scope for rung one** — needs a new provider "send approval keystroke" surface plus a safety gate and risks racing the user's typing. Rung one is Jump-then-approve-manually. Deferred to Phase 4.

### 5.4 Components
- **Build:** `CockpitPanel.tsx`, `useAttentionQueue.ts`.
- **Reuse:** `STATUS_META` + chip/pulse CSS (finish R3.5); `SessionRow` dot / `SessionTile` chip / `RightInspector` `StatusChip` (pick up new states via the `mapTabStatus` rewrite); `Palette.tsx` overlay shell; `ToastContainer`/`dispatchToast` + `ToastAction`; `StatusBar` `otherLive` pill + `RepoActivityBar` live-dot aggregation; `useSessionPreviews`; App's keyboard switch + `paletteActions`.

## 6. Data Flow

`node-pty` → `CLIManager.bufferOutput` (existing 16ms batch + model detection, `cli-manager.ts:474-530`) → `flushOutput` → `outputCallback`. That callback is `wireCliManager()`'s `onOutput` (F3), which now does five things: `appendScrollback(id, data)` + emit `onSessionOutput` + `notifyOutputSubscribers` + `historyManager.recordOutput` (F4 provider-aware) **and `classifier.onOutput(data)`**. The classifier (main) runs alt-screen scan → bounded tail → line-reducer → ANSI-strip → leading-edge `working` / re-arm quiescence timer; on the timer or `onExit` it computes a state and, only on a delta, calls `onStateChange`. `SessionManager` sets `metadata.activityState` and emits `onSessionStateChanged` via `IPCEmitter`, which fans out through `ClientHub` to the desktop renderer **and every remote WS client**. Preload auto-derives `onSessionStateChanged`; `useSessionManager` subscribes and folds state onto `TabData.activityState`. `mapTabStatus` maps it onto `STATUS_META`, rendering the `SessionRow` dot/badge, `SessionTile` chip, and `RightInspector` chip. `useAttentionQueue` derives the sorted cross-repo list → `CockpitPanel` + `RepoActivityBar`/`StatusBar` badges + the backgrounded toast. Acknowledgment stays client-side in `useAttentionQueue`.

## 7. Test Strategy

Vitest-first, mock only the OS boundary (`node-pty` already mocked in `test/setup-main.ts`; `window.electronAPI` via `electron-api-mock.ts`). Prefer `vi.useFakeTimers` / deterministic assertions over real `setTimeout`.

- **shared:** `state-detector.test.ts` — table-driven `(reducedTail, signals)` → candidate state, plus captured real Claude **and** Codex transcript fixtures for approval/working/error/prompt. `line-reducer.test.ts` — CR/erase-line repaint frames → last-N visual lines, including the answered-approval-box-erased case that proves the smear fix.
- **main:** `classifier.test.ts` — drive `onOutput`/`onExit` with fake timers: leading-edge `working`, quiescence→`done` vs `idle` (`hadOutputSinceView`), interrupt-affordance veto, 2-tick dwell anti-flap, exit-code `errored` vs `userInitiated` `exited`, alt-screen suppression; assert `onStateChange` emissions and timer disposal on close/exit. `alt-screen-tracker.test.ts` — `?1049` / `?1049;2004h` / `1047` / `47` `h|l` membership (R4.1 regression). `providers/*.test.ts` — `getStateSignals` authored + fixture-validated for Claude and Codex (Codex is a ship gate). `session-manager.test.ts` — F1 (spawn rejects → status `error`, no unhandled rejection; success → `running`); F2 (`onExit` during activation → `exited`, not stuck `starting`); F3 (restart CLIManager constructed with model+launchMode via `expect.objectContaining`; `getSessionScrollback` grows after restart-time output; classifier tap fires on **both** create and restart). `history-manager.test.ts` — F4 (shell skip records immediately; >8KB non-matching gives up bounded; provider-pattern flush; Claude banner regression unchanged).
- **renderer:** `shell-utils.test.ts` — `mapTabStatus` folds all 7 states; `SessionPane` no longer derives its own `stopped`. `useAttentionQueue.test.ts` — sort order, ack suppression, backgrounded-toast fire. `SessionRail`/`CockpitPanel` render tests — one fixture per state asserts the right `STATUS_META` chip.

No E2E (per the standing preference to verify UI manually).

## 8. Risks

1. **Repaint/alt-buffer smear** is the biggest residual accuracy risk (Claude/Codex are Ink TUIs that repaint in place). The line-reducer mitigates the common CR case; full alt-buffer `agents` mode needs a screen-snapshot model — scoped to Phase 4. Rung one keys off markers that persist under repaint (interrupt-affordance, the live approval box) + quiescence, and biases to surface.
2. **Marker drift silent miss** — a Claude/Codex UI revision can break the approval composite. Mitigated by bias-to-surface (drift degrades `approval`→`done`, still surfaced) + fixture tests that fail in CI on drift. Not eliminated.
3. **`QUIET_MS` is a per-provider heuristic** — too tight false-positives on slow tool calls; too loose delays the signal. Interrupt-affordance veto covers Claude's long silent tool calls; providers without a persistent affordance are weaker.
4. **Codex signals are unvalidated** until real transcripts are captured — a hard dependency, not future work; rung one must not ship Codex on guessed strings.
5. **Multi-agent (`agents`/teams)** — one `activityState` per session collapses N sub-agents to the highest-urgency sub-state. Acceptable for rung one; a known limitation.
6. **Classifier CPU on busy sessions** — bounded by running only on the 16ms flush (not per byte), an 8KB tail, and quiet-evaluation only on the timer. Must not regress the CLAUDE.md hot-path pitfall.
7. **Transient `activityState`** must be reset on load and never trusted from persisted JSON, or a restored session shows a stale `working`.
8. **Per-client acknowledgment** — two remote clients can disagree on what's been "seen." See open questions.

## 9. Open Questions

1. **Capture live transcripts** — the exact current approval-box, trust-prompt, and interrupt strings for the installed Claude Code version, and the equivalent approval/working/error strings for Codex. `getStateSignals` cannot be finalized without them. *(Resolve before Phase 1 signal authoring.)*
2. **Inline Approve** in rung one or deferred? Recommendation: defer to Phase 4; rung one is Jump-then-approve.
3. **Multi-agent decomposition** — is one state per session acceptable for rung one (highest-urgency sub-agent wins), or must the cockpit show per-sub-agent state for `agents`/teams mode?
4. **Acknowledgment scope** — keep "seen" per-client (simple, but remote clients disagree), or move it to main for shared parity across desktop + phone?
5. **Alt-buffer accuracy** — is a headless terminal-emulator buffer per session an acceptable Phase-4 cost for accurate `agents`-mode classification, or stay with append-tail + line-reducer only?
6. **`QUIET_MS` default**, and should it be a setting (pairs with audit F7)?

## 10. Phasing

- **Phase 0 — Foundation** (must land first; independent of the classifier): F1–F5. Ships trust in `metadata.status` and a live non-blank stream for every session. Each with its regression test. *This is a self-contained, shippable PR on its own.*
- **Phase 1 — Classifier core** (depends on F3 for the single tap, F4 for a live stream): the pure `state-detector` + `line-reducer` + `classifier` + `alt-screen-tracker` (all pure/fixture-tested); `IProvider.getStateSignals()` for Claude **and** Codex (Codex against captured transcripts — ship gate); wire the tap into `wireCliManager`; exit-code fusion; new `onSessionStateChanged` IPC event; transient `activityState`. Deliverable: correct states emitted, verifiable in main tests, no UI yet.
- **Phase 2 — Renderer surfacing** (depends on Phase 1 event): `mapTabStatus` rewrite + `STATUS_META` `needs-approval`; `TabData.activityState` + `useSessionManager` subscription; rail dot/badge + attention-priority sort + repo "N need you" pill; StatusBar + RepoActivityBar badges. Deliverable: the rail and inspector show the full seven-state vocabulary live.
- **Phase 3 — Cockpit overlay + routing** (depends on Phase 2): `useAttentionQueue` + `CockpitPanel`; Cmd+J open + optional Cmd+Shift+J cycle + palette action; jump interactions; backgrounded toast. Deliverable: "route my attention to whoever needs me" across repos, including from the phone via the existing `ClientHub` fan-out.
- **Phase 4 — Hardening / optional** (post rung-one): inline Approve provider surface; headless-emulator alt-buffer accuracy for `agents` mode; multi-agent per-sub-agent decomposition; `QUIET_MS` as a setting; shared (main-side) acknowledgment for remote parity.
