# Bell-as-attention-signal probe — findings (2026-07-19)

**Question:** can the terminal bell (`\x07`/BEL) give the attention cockpit a reliable
"this agent session needs you" signal for Claude Code sessions, sidestepping the
alt-screen-repaint problem that blocks the tail classifier (see the deferral callout in
`docs/design/2026-07-19-agentic-cockpit-design.md`)?

**Answer: yes — GO on the bell path.** With one required setting and one required filter,
the bell fires at exactly the moments the cockpit needs and stays silent otherwise.

## Environment (results are bounded to this)

- Claude Code **v2.1.215**, launched by OmniDesk (instrumented build from this branch),
  Windows 11, session launch mode **bypass-permissions** (the user's normal mode).
- Probe: `BellScanner` in the `wireCliManager` PTY tap, enabled via `OMNIDESK_DEBUG_BELL`,
  logging every `\x07` with timestamp + ~40 chars of surrounding bytes.
- Probe control-tested end-to-end: a deliberate `\x07` from a plain shell session was
  captured byte-for-byte before any conclusions were drawn.

## Observed (real bytes, live driven session)

| Moment | Bell? | Evidence |
|---|---|---|
| Claude working (3 full turns incl. multi-minute tool use) | **silent** | zero probe hits mid-turn |
| **Turn finished, back at prompt** | **rings** | 2/2 turns; bare BEL right after the final repaint frame (`…\x1b[?25h\x1b[?2026l⟬BEL⟭`); arrives at completion or within ~1 min (may be the "waiting for input" notification — either serves supervision) |
| **AskUserQuestion picker on screen** | **rings** | bare BEL as the dialog painted (`… to cancel…⟬BEL⟭`) |
| Option selected in the picker | **false positive** | BEL was the terminator of an OSC 52 clipboard sequence (base64 payload immediately before it) — not a notification |
| Any of the above with **default settings** | **never rings** | full turn observed pre-setting: zero hits. `preferredNotifChannel: "terminal_bell"` is **required** (docs agree: bell is opt-in outside Ghostty/Kitty/iTerm2) |

Not observed (honestly untested):

- **Permission approval box** — the user runs bypass mode, so none appeared. Docs state the
  notification fires on permission pauses; treat as likely-but-unverified.
- **Idle re-ring cadence** — whether the bell repeats while a session stays ignored is unknown.

## The two mandatory conditions

1. **`preferredNotifChannel: "terminal_bell"`** in the active profile's `settings.json`
   (now set in both `~/.claude-work` and `~/.claude-personal`). Without it: zero bells, ever.
   Product implication: OmniDesk must check/offer this setting or the cockpit stays dark.
2. **Escape-sequence-aware BEL discrimination.** BEL doubles as the OSC string terminator
   (`ESC]…\x07` — window titles, OSC 52 clipboard writes). A naive `\x07` counter misfires;
   observed live (finding #3). The detector must track "inside OSC string" state and count
   only bare BELs — a small parser in the spirit of the existing `alt-screen-tracker`.

## Claude Code hooks (assessed, not built)

Hooks are the richer sibling and work regardless of the bell setting:

- `Stop` fires every turn end; `Notification` has matchers `permission_prompt`,
  `idle_prompt`, and (v2.1.198+) `agent_needs_input` / `agent_completed`. Payload is JSON on
  stdin with `session_id` — a hook writing a marker file (or hitting a localhost endpoint)
  would give OmniDesk **differentiated** events (approval vs question vs done) instead of one
  undifferentiated ding. The user's profiles already run Stop/SessionStart hooks (brain,
  stoke monitor), so the mechanism is proven in this environment.
- Cost: no documented per-invocation injection (no CLI flag/env var) — OmniDesk would have
  to write into settings files (user profile or repo-local `.claude/settings.local.json`)
  and correlate `session_id`→PTY. Feasible, but real config-management surface.

## Recommendation

1. **GO — ship the bell path now** (small, provider-agnostic, reuses everything):
   detect bare BEL (OSC-aware) in the existing tap for `kind === 'agent'` sessions →
   `emitActivityState(sessionId, 'awaiting-input', 'bell')` through the already-built
   `onSessionStateChanged` → cockpit/toasts light up with zero renderer changes. Clear the
   state when the user sends input to that session. The bell can't distinguish "done" from
   "question waiting", so it maps to one honest "needs you" state — which is the cockpit's
   core promise.
2. **Hooks as the phase-2 upgrade** if differentiated states or bell-independence prove
   worth the config-injection cost.
3. **Headless-emulator rewrite: not needed for the attention signal.** Keep it parked;
   it only pays if we later want screen-content states (e.g. error banners) beyond
   needs-you/working.

## Probe artifacts

- `src/main/session-state/bell-probe.ts` (+ unit tests) — kept behind `OMNIDESK_DEBUG_BELL`
  as a debugging affordance; zero effect when the flag is unset.
- Wiring: ~15 lines in `SessionManager.wireCliManager`.
