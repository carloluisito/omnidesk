# Remote / Mobile UX — Findings Report

> **Purpose.** Grounded, no-noise assessment of how OmniDesk behaves when accessed
> **remotely from a mobile browser** (the primary use case: "continue working from
> my phone"). This documents the *current state* only. It is the input to the next
> **planning phase** — no solutions are prescribed here, only the problem surface and
> candidate opportunity areas, each backed by `file:line` evidence.
>
> **Date:** 2026-07-09 · **Scope:** remote-served renderer, shell layout, xterm terminal, PWA.
> **Target:** both the **mobile browser tab** and the **installed PWA** (standalone). This
> makes the safe-area / standalone-mode findings (G) in-scope, not optional.

---

## 1. The one-paragraph reality

When a phone connects over the remote tunnel, it is served **the exact same desktop
React UI**, with `window.__OMNIDESK_REMOTE__ = true` as the only runtime signal
(`src/main/remote/web-bridge.ts:60`). There is **no runtime mobile/touch awareness
anywhere in the renderer** — zero matches for `navigator.userAgent`, `matchMedia`,
`ontouchstart`, `maxTouchPoints`, or `standalone` in `src/renderer`. Mobile adaptation
is limited to **two hand-authored CSS width breakpoints** plus PWA install tags. The
result is usable enough to *view* a session, but the core promise — *typing into the
terminal to keep working* — is effectively broken on a touch device.

---

## 2. TL;DR — headline findings

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| **A** | **Mobile users likely cannot type into the terminal.** Input relies solely on xterm.js's internal helper textarea via `focus()`, with no `inputmode`/`enterkeyhint`/explicit-focus workaround to summon the soft keyboard. No fallback input path exists. | 🔴 **Blocker** | `Terminal.tsx:459,504`; no `inputmode`/`enterkeyhint` anywhere |
| **B** | **No way to send special keys** (Esc, Tab, Ctrl-combos, arrows, Enter-modifiers). Every special-key path assumes a physical keyboard; there is no on-screen key bar. | 🔴 **Blocker** | `shell-key-rules.ts:5-33`; `kitty-keyboard.ts:134-183`; `Terminal.tsx:389-407` |
| **C** | **Soft keyboard opening is not handled.** No `visualViewport` listener; the terminal is not refit against the shrunken viewport and can sit hidden behind the keyboard. | 🟠 High | `Terminal.tsx:269-275,432-485` (only `ResizeObserver`/`window.resize`) |
| **D** | **Empty/no-repo state bypasses the mobile layout.** It sets `gridTemplateColumns` inline (inline > `@media`), so the drawer breakpoint never applies and no hamburger renders — a phone with no active repo gets a broken desktop grid. | 🟠 High | `App.tsx:470-474` vs `App.tsx:597-608` |
| **E** | **Right inspector is unreachable on mobile** (force-hidden ≤1100px), and the tile **GRID view never collapses to one column** on phones (stays 2-col). | 🟡 Medium | `prototype-shell.css:1056,1076`; grid untouched at ≤768px (`:504-508,1057`) |
| **F** | **Fixed 14px terminal font, DOM renderer, no DPR handling.** Not tuned for small high-DPI screens. | 🟡 Medium | `Terminal.tsx:342-349`; no `devicePixelRatio` / webgl addon |
| **G** | **No iOS safe-area handling.** No `viewport-fit=cover`, no `env(safe-area-inset-*)`. In standalone PWA mode content sits under the notch / home indicator. | 🟡 Medium | none in repo; `index.html:5`; `http-util.ts:30-33` |
| **H** | **Sub-44px touch targets throughout**, including the mobile hamburger itself (32px). | 🟡 Medium | `prototype-shell.css:98-99,38-39,1101-1102` |

**A + B together are the crux:** without them, remote mobile is a read-only viewer, not a
working surface. Everything else is polish on top of a floor that isn't there yet.

---

## 3. Current state by area

### 3.1 Terminal input (the load-bearing problem)

- Input plumbing itself is fine: `xterm.onData` → `onInput(sessionId, data)` → WebSocket
  to host (`Terminal.tsx:413-423`; `web-bridge.ts:55`). The problem is *getting characters
  produced at all* on a touch device.
- Focus is delegated entirely to xterm (`xtermRef.current.focus()` on container click,
  `Terminal.tsx:504`, and on focus+visible `Terminal.tsx:458-459`). This focuses xterm's
  `.xterm-helper-textarea`, which the app never configures. With the **DOM renderer** and
  no `inputmode`/`enterkeyhint`, this does **not** reliably raise the iOS/Android keyboard.
- **No app-owned `<textarea>`/`contenteditable`** exists as a fallback (searched: none).
- Special keys (`shell-key-rules.ts:26-33`, Ctrl+C interception `:5-11`, copy/paste
  `Terminal.tsx:389-407`, Kitty encoding `kitty-keyboard.ts:134-183`) all derive from
  physical `KeyboardEvent` modifiers a phone keyboard cannot produce. **No on-screen
  accessory bar** for Esc/Tab/Ctrl/arrows/newline-chords (searched: none).
- Touch scrollback relies on xterm's default `overflow-y:auto` viewport
  (`Terminal.tsx:836-838`) — native touch scroll should work, but there's no
  `touch-action`/`overscroll-behavior` tuning and no touch copy/paste UI.
- Remote scrollback replay on cold attach is the **only** `__OMNIDESK_REMOTE__` branch
  in the terminal (`Terminal.tsx:697-703`).

### 3.2 Shell layout & responsiveness

- Shell is a fixed 3-row / 3–4-col grid: `48px | 300px | 1fr (| 340px)`
  (`prototype-shell.css:9-20`). Desktop chrome sums to **688px** before the main view —
  ~1.8× a 375px phone.
- **Only 4 width-based media queries in the entire renderer**; the shell has just two
  (`prototype-shell.css:1054` ≤1100px, `:1065` ≤768px). No container queries, no fluid
  `clamp()` sizing. Responsiveness is two hand-authored breakpoints, not a system.
- A **nav drawer does exist** at ≤768px: activity bar + rail become a fixed off-canvas
  drawer (`min(280px,74vw)`) toggled by a hamburger + backdrop
  (`prototype-shell.css:1065-1116`; `App.tsx:129,580,601-608`). It is **width-driven, not
  device-driven** — fires in any narrow window.
- Gaps: **right inspector force-hidden** ≤1100px & ≤768px (`:1056,1076`); **GRID view
  stays 2-col** on phones (never collapses, `:504-508` / `:1057`); **mode bar is a
  non-wrapping flex row** never adjusted for narrow widths (`:444-489`) → overflow risk.
- **Empty-state branch** renders its own shell with **inline** grid style
  (`App.tsx:470-474`), overriding the media queries and omitting the hamburger/backdrop —
  the main-shell branch (`App.tsx:597`) does it correctly with a class.

### 3.3 PWA & mobile-awareness

- Remote HTML head injection (`injectRemoteHead`, `http-util.ts:37`) adds manifest link,
  apple-touch-icon, `apple-mobile-web-app-*`, and `theme-color` (`http-util.ts:26-34`) —
  but does **not** touch the viewport meta. Base viewport is `width=device-width,
  initial-scale=1.0` with **no `viewport-fit=cover`** (`index.html:5`); zoom is allowed
  (good — no `user-scalable=no`).
- Manifest (`buildManifest`, `http-util.ts:49-65`): `display: standalone`,
  `orientation: any`, token-embedded `start_url`, icons 192/512 + maskable-512. Missing
  `id`, `shortcuts`, `screenshots`, maskable-192.
- Service worker (`sw.js`): single cache, cache-first only for hashed `/assets/`,
  network-only for nav/auth. Offline UX is a 503 fallback page (`sw.js:33-42`).
- **No safe-area CSS** (`env(safe-area-inset-*)`) anywhere; combined with missing
  `viewport-fit=cover` → content under notch/home-indicator in standalone.
- `RemoteAccessPanel` is a **desktop host-operator** control (QR, token, tunnel); not a
  phone-facing screen (`RemoteAccessPanel.tsx`; `App.tsx:565,749`).

---

## 4. Opportunity map (for the planning phase)

Grouped by the problem they unblock. Ordered so the **enablers** come before **polish** —
without the first group, remote mobile is not a working tool.

**Group 1 — Make the terminal usable by touch (unblocks the core use case)**
- Reliable soft-keyboard invocation on tap (findings A).
- On-screen key/accessory bar for Esc, Tab, Ctrl, arrows, and the newline chords (B).
- `visualViewport`-aware refit so the prompt stays above the keyboard (C).
- Touch scroll tuning + a touch-friendly copy/paste affordance (§3.1).

**Group 2 — Make the layout coherent on a phone**
- Fix the empty-state inline-grid bypass so the drawer/hamburger always work (D).
- Give the right inspector a mobile presentation instead of hiding it; collapse GRID to
  one column; make the mode bar wrap/condense (E, §3.2).
- Bump touch targets to ≥44px, starting with the hamburger and activity-bar items (H).

**Group 3 — Native-feel polish (PWA)**
- `viewport-fit=cover` + `env(safe-area-inset-*)` for notch/home-indicator (G).
- Terminal font sizing / renderer tuning for small high-DPI screens (F).
- Manifest completeness (maskable-192, `id`, `shortcuts`) and richer offline shell (§3.3).

**Cross-cutting decision to make first:** whether to keep bolting width-breakpoints onto
the desktop UI, or introduce a **runtime "mobile/touch" mode** (the app currently has
*no* such notion — see §1). Group 1's key bar and keyboard handling only make sense when
gated to touch clients, so this decision gates most of the above.

---

## 5. What is *not* broken (so planning doesn't re-litigate it)

- IPC-over-WebSocket bridge, auth, and scrollback replay work; a phone can connect and
  *see* live session output (`web-bridge.ts`; `Terminal.tsx:697-703`).
- Viewport zoom is not disabled; base viewport meta is present (`index.html:5`).
- A nav drawer + hamburger already exist to build on (`prototype-shell.css:1065-1116`).
- PWA is installable with reasonable icons and a token-persisting `start_url`
  (`http-util.ts:49-65`).
- Overlays/sheets already cap to `calc(100vw - 32px)` and fit a phone
  (`prototype-shell.css:720-722,759`).

---

*All findings above are grounded in the current `main` branch. Reproduce any claim by
opening the cited `file:line`.*
