# Launch Mode Picker — Review

**Status:** all-triaged
**Reviewer:** ousterhout-reviewer
**Baseline ref:** 367df9bcd5e7dc85e3e66956aeb8824a39fbeeb5 (main)
**HEAD ref at review:** 367df9bcd5e7dc85e3e66956aeb8824a39fbeeb5
**Last run:** 2026-05-13 18:56
**Run count:** 1

## Findings

Each finding has a per-run id (F1, F2, …). Edit `Decision:` to triage. Do not edit `Found`, `Where`, or `Why it matters` — those are reviewer output and are overwritten on rerun.

### F1 — `launchMode` field is accepted at the IPC boundary but dropped before reaching `CLIManager`
**Where:** `src/main/session-manager.ts:138-287` (`createSession`), compared against `src/shared/ipc-types.ts:35` and `src/main/cli-manager.ts:177,231`
**Found:** `SessionCreateRequest.launchMode` arrives in `SessionManager.createSession` but the method never reads `request.launchMode`. The pool path calls `cliManager.initializeSession(workingDir, request.permissionMode, model, provider)` with no 5th argument (line 260), and the direct path constructs `new CLIManager({ workingDirectory, permissionMode, model, enableAgentTeams, provider })` with no `launchMode` field (lines 265-271, 278-284). The renderer's selection therefore never reaches `ClaudeProvider.buildCommand`; the provider always falls back to the `permissionMode === 'skip-permissions'` branch on line 64 of `claude-provider.ts`.
**Why it matters:** Information hiding (and complexity moved). The renderer was made to know about a `launchMode` it cannot actually deliver, and the type system says it can. The visible interface (`SessionCreateRequest.launchMode?`) is wider than the implementation honors — a consumer using the contract correctly will silently get the wrong command.
**Decision:** fix-now plan-item-5
**Decision notes:** Functional bug, not design smell. Verified by reading session-manager.ts:260,265-271,278-284. Tracked as new plan item #5 in `launch-mode-picker.plan.md`.

### F2 — Two parallel `LaunchMode` → argv switches drift apart by design
**Where:** `src/main/cli-manager.ts:367-396` (no-provider fallback) and `src/main/providers/claude-provider.ts:60-99`
**Found:** `CLIManager.launchProviderCommand` contains a second `switch (launchMode)` (lines 373-391) that re-implements the same three-mode dispatch as `ClaudeProvider.buildCommand`. Both also re-implement the `permissionMode === 'skip-permissions' → 'bypass-permissions'` legacy mapping (cli-manager 370-371; claude-provider 63-64). The comment at cli-manager.ts:368 says it "replicate[s] ClaudeProvider's switch so the behaviour is consistent even without an explicit provider instance."
**Why it matters:** Complexity isn't reduced, only moved (and duplicated). The provider abstraction's purpose is to be the single source of truth for command construction; the fallback path defeats that. A new `LaunchMode` variant must now be added in three places (the union, the provider switch, and the cli-manager switch) and tested in two. The exhaustive `never` check makes the duplication safer but does not eliminate it.
**Decision:** defer
**Decision notes:** The no-provider fallback path is rarely hit (SessionManager always resolves a provider; `'claude'` is always registered). The exhaustive `never` check forces a compile error if a new `LaunchMode` variant is added without updating both switches, so the duplication can't silently drift. Extracting a shared `launchModeToArgv(launchMode, model?)` helper is the right move, but the cost-per-new-variant is low and the urgency is low. Track as a follow-up; revisit if a third dispatch site appears.

### F3 — `availability-cache` module's public setter exists primarily so tests can mutate production state
**Where:** `src/main/agent-view/availability-cache.ts:36-40`, exercised in `src/main/ipc-handlers.availability.test.ts:51,66,73,89,108,127,146`
**Found:** `setCachedAgentViewAvailability` is exported but has exactly one production caller (`index.ts:143`, called once per app lifetime by `agentViewDelayedInit`) and seven test call sites that use it to reset cache state. The comment on lines 33-35 even documents the dual purpose: "Called exactly once per app lifetime ... Also used by tests to set up cache state." The cache is a module-level `let`, so tests need the setter, but production callers see a setter that suggests the cache can be updated at any time.
**Why it matters:** Information hiding. The "set once" contract is documented in prose but not enforced; the implementation choice (module-level mutable state) leaks through a setter whose existence is justified by test needs rather than by the production lifecycle. The IPC handler trusts a value that any importer can stomp.
**Decision:** defer
**Decision notes:** The "set once" contract is enforced by call-site count (a single production caller in `agentViewDelayedInit`). No other module imports the setter. Following the F4 fix (item #6: push pattern), the setter will gain a second production caller (the IPC emit happens right after `setCachedAgentViewAvailability`), but the call site stays in the same function. The pragmatic risk is theoretical. Track as follow-up; if the cache ever needs multi-write semantics (e.g. user-triggered re-probe), refactor to a class with private state at that point.

### F4 — Renderer polls main for a state transition that main already knows the timing of
**Where:** `src/renderer/hooks/useAgentViewAvailability.ts:18-60`, paired with `src/main/index.ts:307-309`
**Found:** The main process schedules `agentViewDelayedInit` via `setTimeout(..., 2000)` and writes the result to a module-level cache. The renderer hook then polls that cache every 500ms via IPC (`useAgentViewAvailability.ts:36`) until the cached value stops returning `reason: 'probing'`. Main knows exactly when the probe resolves (it `await`s `probeClaudeVersion`) but has no mechanism to push that event; the renderer compensates by polling.
**Why it matters:** Pulling complexity downward. The work of "notice that probing finished" belongs in the layer that already has the resolved promise (main) — a single `mainWindow.webContents.send('agentView:availabilityChanged', ...)` after `setCachedAgentViewAvailability(...)` would let the hook be a one-shot fetch plus a subscription, matching the push pattern already used elsewhere (e.g. `taskManager.setMainWindow`, `gitManager.setMainWindow`). The polling also introduces a renderer-side concept ("probing as transient") that exists only because the renderer cannot tell whether the cache is initial or final.
**Decision:** fix-now plan-item-6
**Decision notes:** Strong leverage finding — fixing F4 also collapses F5 (probing reason can stay internal-only) and F7 (hook becomes a one-shot fetch + event subscription with no polling plumbing). The pattern matches existing managers (`taskManager`, `gitManager`) which already use `setMainWindow`. Tracked as new plan item #6.

### F5 — `AgentViewUnavailable.reason` mixes domain reasons with transport/lifecycle states
**Where:** `src/shared/types/agent-view-types.ts:32-44`
**Found:** The discriminated union conflates three different categories under one `reason`: real availability outcomes (`cli-too-old`, `cli-not-found`, `disabled-by-setting`, `disabled-by-env`, `version-unparseable`), a lifecycle state (`probing`, meaning "main hasn't finished yet"), and a transport failure (`detection-failed`, meaning "IPC threw" or "no getter was injected into `ClaudeProvider`"). Consumers must filter `probing` specially (see `useAgentViewAvailability.ts:14-16` and `NewSessionDialog.tsx:19-21`).
**Why it matters:** Deep modules / information hiding. A consumer of the type now has to know two implementation facts to use it correctly: (a) that the cache starts in a transient state that should be rendered differently, and (b) that the same shape is used to encode IPC failure. The "narrow on `status === 'unavailable'`" guidance in the doc comment is no longer sufficient — every consumer must additionally branch on `reason` to decide whether the unavailability is real, transient, or a fault. The type is broader than the concept it claims to model.
**Decision:** fix-now plan-item-6
**Decision notes:** Partially subsumed by F4's fix (item #6). With push-not-poll, the renderer hook no longer needs to surface `'probing'` to the picker — it just stays `loading: true` until either the initial fetch returns a non-probing state OR a push event arrives with the final value. `'probing'` remains in the union as an internal cache sentinel, but the picker stops special-casing it (the `isProbing` predicate moves into the hook only, and the picker treats `availability === null` as the sole "checking" indicator). `'detection-failed'` stays as-is — it's a legitimate transport-failure variant and removing it would require a separate error channel.

### F6 — `ClaudeProvider`'s injected-getter pattern requires every constructor site to remember the wiring
**Where:** `src/main/providers/claude-provider.ts:22-30`, registered in `src/main/providers/provider-registry.ts:14`, exercised in `src/main/providers/claude-provider.test.ts:160-224`
**Found:** `ClaudeProvider`'s constructor takes an optional `availabilityGetter`. The default is a closure that returns `{ status: 'unavailable', reason: 'detection-failed' }` so no-args construction silently downgrades `'agents'` to `'default'`. Tests must inject `() => ({ status: 'available', ... })` to exercise the success path (lines 160, 166, 172, 188, 194, 200, 223 of the test file). Production wiring lives in `ProviderRegistry.constructor` (line 14), but any other call to `new ClaudeProvider()` — including from a future test or a future manager — silently breaks `'agents'` mode without an error.
**Why it matters:** Information hiding / general-purpose over special-purpose. The provider's public surface declares that the `availabilityGetter` is optional, but `'agents'` mode does not actually work without it. The "safe default" is correct as defense-in-depth but masks a wiring mistake instead of surfacing it. A constructor that requires the cache module to exist could either take the cache module reference directly (so the dependency is explicit) or live with a documented runtime invariant that throws when `'agents'` is requested without a getter.
**Decision:** defer
**Decision notes:** The only realistic no-args call path is the test fixture; production wiring through `ProviderRegistry` always injects the getter. The defense-in-depth default is correct: silently downgrading to `'default'` is the safe failure mode (vs. spawning `claude agents` with an untested CLI version). Making the getter required would force every test to wire it up explicitly — a maintainability improvement but not urgent. Track as follow-up; revisit if a new manager ever needs to construct a `ClaudeProvider` directly.

### F7 — `useAgentViewAvailability` is a special-purpose hook around a generic shape (one-shot fetch + retry-while-pending)
**Where:** `src/renderer/hooks/useAgentViewAvailability.ts:20-63`
**Found:** The hook's structure — fetch on mount, retry every N ms while a predicate holds, surface `null | T`, synthesize a failure shape on rejection — is generic, but it is implemented inline against one IPC method, one polling interval constant, one predicate (`isProbing`), and one fallback shape. The name suggests it is the API for a domain concept, but the body is dominated by polling plumbing that has nothing to do with Agent View.
**Why it matters:** General-purpose over special-purpose. If a second feature ever needs the same "fetch a main-side cached value that may not be ready yet" pattern (e.g. tunnel status, git status), this hook will be copied. The polling logic, the `cancelled` + `timeoutId` cleanup dance, and the rejection-to-typed-shape synthesis would each be reinvented. Note that this finding becomes moot if F4 is taken (push from main eliminates the polling entirely).
**Decision:** fix-now plan-item-6
**Decision notes:** Subsumed by F4's fix. With push-not-poll, the hook collapses to one-shot fetch + event subscription — about 25 lines of generic React. The polling plumbing (POLL_INTERVAL_MS constant, recursive setTimeout, isProbing predicate) goes away. The hook becomes special-purpose only in its IPC method name and fallback shape, both of which are intrinsic to the domain. The "generic shape" concern dissolves once the polling is removed.

## Triage legend

`Decision:` must be one of:
- `fix-now <ref>` — addressed in this feature. `<ref>` is a commit sha or a new plan item id. The fix itself follows TDD; this verb does not write code.
- `defer <reason>` — punted to follow-up. Reason required.
- `dismiss <reason>` — reviewer was wrong or principle does not apply here. Reason required.

## Notes
Append-only log of review-related decisions. Same conventions as the plan's Notes.
- 2026-05-13: First run. F1 was independently verified by reading `src/main/session-manager.ts:260,265-271,278-284` — `request.launchMode` is never read; both pool-path and direct-path discard the field. The feature is functionally broken end-to-end; this is the only finding that's a true blocker. Unit tests missed it because `claude-provider.test.ts` constructs the provider directly and never exercises the SessionManager wiring; `NewSessionDialog.test.tsx` only verifies the dialog's `onSubmit` call shape, not what happens to the value after. **Recommend triage as F1=fix-now (new plan item #5)**, others as design-debt to triage individually.
- 2026-05-13: Triage complete. F1 fixed via plan item #5 (3 call sites in `session-manager.ts`, 3 new tests). F4 + F5 + F7 collapsed into plan item #6: replaced poll-with-event push pattern via new `agentView:availabilityChanged` IPC event, dropping ~30 lines of polling plumbing from the hook and the `isProbing` special-casing from the picker. F5 partially addressed — the `'probing'` reason variant stays in the union as an internal cache sentinel, but the renderer no longer special-cases it (the hook hides it from consumers by staying `loading: true` instead). F2, F3, F6 deferred with explicit notes documenting why (low recurrence, single-call-site invariant, defense-in-depth correctness, respectively). Full suite at 788 passing. Ready for `done`.
