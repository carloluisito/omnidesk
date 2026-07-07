# OmniDesk Remote Access — Design

**Date:** 2026-07-08
**Status:** Approved (Approach A), ready for implementation
**Topic:** Reach your own running OmniDesk instance from any browser over the internet.

## Summary

Add a **remote access** capability so a single user can reach their own running OmniDesk
instance from a browser on any device (laptop → phone), do real work, and drive live sessions.

The renderer is reused unchanged. OmniDesk's main process gains an embedded HTTP + WebSocket
server bound to `127.0.0.1`; a WebSocket-backed bridge implements the same `window.electronAPI`
surface the Electron preload provides. The user exposes it with a **tunnel** (Cloudflare/Tailscale/
ngrok) and OmniDesk enforces its own auth token on top. Session output **fans out to every
connected client** (desktop + web) and a **per-session scrollback buffer** lets a late-joining
client reconstruct the terminal.

## Decisions (from brainstorming)

| Dimension | Decision |
|-----------|----------|
| Whose compute | The user's own running instance, reached remotely. Single user. |
| Client surface | One responsive web UI reusing the existing React renderer (laptop + phone). |
| Exposure | Tunnel model. Server binds `127.0.0.1` only; OmniDesk adds its own auth token. |
| Concurrency | Live mirror — output fans out to all clients; input accepted from any. |
| v1 scope | Core: repo/session list, live terminal, prompt/input, create session, switch repo. |

**Out of scope for v1:** multi-tenant/SaaS, opening a public port directly, WebRTC/relay,
native drag-drop over the web, OS file pickers (`dialog:*`), window controls (`window:*`),
git/quota/checkpoint panels remotely (backend methods still reachable but no mobile UI work).

## Why Approach A (WebSocket transport behind the IPC contract)

OmniDesk's IPC contract (`src/shared/ipc-contract.ts`) is a single source of truth from which
the preload bridge and the `ElectronAPI` type are auto-derived. That contract is a clean transport
seam: a browser bridge can speak the exact same method surface over WebSocket, so **the React
renderer does not change**. Rejected alternatives: screen-streaming the desktop (contradicts the
responsive requirement, heavy, one fixed layout), and a terminal-only web bridge (loses the
OmniDesk shell — repo/session navigation and create/switch, which are in v1 scope).

## Architecture

```
Browser (any device)                         Your machine (OmniDesk main process)
┌────────────────────────────┐               ┌──────────────────────────────────────────┐
│ Built React renderer        │   HTTPS via   │ RemoteAccessServer (127.0.0.1:8420)        │
│ (dist/renderer, unchanged)  │◄──tunnel────► │  • static file server (dist/renderer)      │
│                             │   (CF/TS/ngrok)│  • injects web-bridge.js into index.html   │
│ window.electronAPI =        │               │  • auth: token → httpOnly cookie           │
│   WebSocketBridge  ─────────┼──WS (wss)────►│  • WsRouter: invoke/send → IPCRegistry     │
│                             │               │              events   ← ClientHub broadcast│
└────────────────────────────┘               └───────────────┬────────────────────────────┘
                                                              │ same handlers/emitter
                                              ┌───────────────┴────────────────────────────┐
                                              │ IPCRegistry (callable map) · IPCEmitter →   │
                                              │ ClientHub(fan-out) · SessionManager · PTYs  │
                                              └─────────────────────────────────────────────┘
Electron desktop window ── contextBridge preload ──► same IPCRegistry / receives same broadcast
```

### New components (main process, `src/main/remote/`)

1. **`RemoteAccessServer`** — owns a Node `http.Server` bound to `127.0.0.1:<port>` (default `8420`,
   configurable; **never 9876**). Responsibilities: serve `dist/renderer` static assets; serve `/`
   with the web bridge `<script>` injected into `<head>`; expose auth endpoints; upgrade `/__omnidesk/ws`
   to WebSocket after auth. Lifecycle: `start()` / `stop()`; started only when the user enables remote
   access. Off by default.

2. **`WsRouter`** — per-connection message handler. Protocol (JSON frames):
   - `{t:'invoke', id, method, args}` → `registry.invokeMethod(method, args)` → `{t:'result', id, ok, value|error}`
   - `{t:'send', method, args}` → `registry.sendMethod(method, args)` (fire-and-forget)
   - Server→client: `{t:'event', channel, payload}` (broadcast) and per-connection scrollback replay.
   No explicit subscribe: the browser bridge maps `channel → callbacks` exactly like `ipcRenderer.on`.

3. **`ClientHub`** — registry of connected sinks. `broadcast(channel, payload)` writes to every
   authed WS client. `IPCEmitter` forwards each event here in addition to the Electron window.

4. **`RemoteAuth`** — generates/stores a `remoteAccessToken` (crypto-random, in config dir).
   `POST /__omnidesk/auth {token}` verifies (constant-time compare) and sets an httpOnly, Secure,
   SameSite=Strict cookie. Convenience `GET /?token=…` auto-submits then redirects to `/` (clean URL).
   WS upgrade validates the cookie. Simple in-memory rate limit on auth attempts.

5. **`web-bridge` generator** — produces the browser bridge JS. Generated in main from the imported
   `channels` + `contractKinds` (serialized as JSON) + a static transport template, so it **stays in
   sync with the contract automatically** with no extra build wiring. Served at
   `/__omnidesk/web-bridge.js`.

### Changed components

- **`src/main/ipc-registry.ts`** — additionally store handlers in `Map<method, fn>` and expose
  `invokeMethod(method, args)` / `sendMethod(method, args)` that call the same handler functions with
  a synthetic event `{ sender: null, __remote: true }`. Verified safe: no handler reads `event.sender`.
- **`src/main/ipc-emitter.ts`** — add module-level `registerRemoteBroadcaster(fn)`; `emit()` calls the
  Electron window send AND `remoteBroadcaster?.(channel, payload)`. Single fan-out chokepoint preserved.
- **`src/main/session-manager.ts`** — maintain a bounded per-session ring buffer (raw output, cap
  ~256 KB) appended in the existing `mgr.onOutput` callback (`session-manager.ts:262`). Add
  `getSessionScrollback(sessionId): string`.
- **IPC contract** — add `getSessionScrollback` (invoke) and a small `remote:*` control surface
  (`remote:getStatus`, `remote:enable`, `remote:disable` returning `{ enabled, port, url, token }`).
- **`src/renderer/components/Terminal.tsx`** — on mount (alongside `sessionReady()` at ~`:743`), call
  `getSessionScrollback(sessionId)` and write the backlog to xterm before live output. Transport-agnostic:
  also fixes desktop terminal history loss on renderer reload.
- **Renderer responsive pass** — CSS/layout only, in `components/shell/`. The activity bar + session
  rail collapse into a drawer/tab pattern under a mobile breakpoint. No logic changes.
- **`src/main/index.ts`** — instantiate `RemoteAccessServer` (not started); wire enable/disable IPC.
- **Settings UI** — a "Remote Access" panel: toggle on/off, show URL + token + QR, copy buttons,
  and a short tunnel setup hint.

### New dependency

`ws` (WebSocket server for Node — no built-in equivalent). Static file serving uses Node `http`/`fs`
directly; no web framework added.

## Data flow

**Invoke (e.g. `listSessions`)**: browser bridge sends `{t:'invoke',id,method,args}` → `WsRouter`
→ `registry.invokeMethod` → same handler as Electron → `{t:'result',id,ok,value}` → bridge resolves
the promise. Identical return types because it's the same handler.

**Live output**: PTY data → `CLIManager` (16 ms batches, unchanged) → `session-manager` `onOutput`
→ appends to ring buffer + `emitter.emit('onSessionOutput')` → Electron window **and** `ClientHub`
broadcast → every web client's bridge dispatches to `onSessionOutput` callbacks → xterm write.

**Late join / mobile connects mid-session**: `Terminal.tsx` mounts → `getSessionScrollback` returns
the ring buffer → written to xterm first → live broadcast continues from there.

**Input from any client**: xterm `onData` → `sendSessionInput(sessionId,data)` → `{t:'send'}` →
`registry.sendMethod` → PTY write. Ctrl+C interception rules (`SessionKind`) are unchanged and run in
the renderer, so they apply identically over the web.

## Security

- Server binds `127.0.0.1` only — never a public interface. Public reach is exclusively via the
  user's tunnel, which supplies TLS and (optionally) its own access layer.
- OmniDesk still requires its own token so the tunnel is not the only gate. Constant-time token
  compare; httpOnly + Secure + SameSite=Strict cookie; auth-attempt rate limiting; token regeneratable
  from the settings panel (invalidates existing sessions).
- Remote access is **off by default** and must be explicitly enabled per run.
- No new local attack surface when disabled (server not listening).
- WS upgrade rejected without a valid cookie.

## Error handling

- Bridge queues `invoke`/`send` until the socket opens; auto-reconnect with backoff; on reconnect,
  re-fetch scrollback per mounted terminal (idempotent — xterm reset then rewrite).
- Invoke errors serialize `{ok:false, error}` and reject the browser promise (same shape as a thrown
  handler in Electron).
- Port in use / bind failure surfaces a clear error in the settings panel; server stays disabled.
- Client disconnect removes it from `ClientHub`; broadcasts skip dead sockets.

## Testing

- **shared/main unit**: web-bridge generator emits every contract method; `WsRouter` invoke/send
  routing + error serialization; `RemoteAuth` token verify (pass/fail/constant-time), cookie issue,
  rate limit; `ClientHub` broadcast add/remove/dead-socket; session-manager ring buffer bound +
  `getSessionScrollback`; `IPCRegistry.invokeMethod/sendMethod` parity with `ipcMain` handlers.
- **renderer**: `Terminal.tsx` writes scrollback before live output on mount; WebSocket bridge shim
  resolves invokes, dispatches events, packs `sendSessionInput`/`resizeSession` like the preload.
- **manual (user)**: build, enable remote access, connect via a tunnel from a phone and a second
  laptop; verify live mirror both directions, create/switch, scrollback on late join, auth rejection
  without token. (Per project decision, no automated e2e for this UI-heavy feature.)

## Rollout

Off by default; additive. No change to the Electron path when remote access is disabled. Ships behind
the settings toggle.
