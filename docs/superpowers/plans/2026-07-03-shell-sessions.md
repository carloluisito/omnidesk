# Shell Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `kind: 'shell'` session that spawns a plain terminal (cmd.exe / `$SHELL`) with no AI CLI, creatable standalone (NewSessionSheet "Terminal" type) or as a seeded companion ("Open terminal here" from an agent session).

**Architecture:** One new discriminator, `SessionKind = 'agent' | 'shell'`, threaded from the create request through `SessionMetadata`. `CLIManager` gains a `kind` option that (a) skips model detection and (b) exposes `spawnShellSession()` (PTY only, no `claude` launch). `SessionManager.createSession`/`restartSession` branch on it: shell sessions skip provider resolution and the pool, and use `spawnShellSession()`. The renderer mirrors `kind` the same way it mirrors `providerId` (session→TabData map → App map → TerminalHost → Terminal); the Terminal gates Ctrl+C interception, newline chords, and readiness on `kind`.

**Tech Stack:** Electron 28, React 18, TypeScript, xterm.js, node-pty, Vitest 4 + @testing-library/react.

## Global Constraints

- Back-compat: a missing `kind` MUST be treated as `'agent'` (persisted sessions predate this field).
- Never forward Ctrl+C (`\x03`) to an **agent** session — the existing close-confirm interception stays intact for `kind !== 'shell'`.
- Shell sessions carry **no** `providerId`, **no** `currentModel`, **no** `launchMode`, **no** worktree (v1).
- Shell used is the platform default already chosen in `CLIManager.createPtyProcess` (`cmd.exe` on Windows, `$SHELL` on Unix). No shell picker in v1.
- All work stays on the single branch `feat/shell-sessions` (already created off latest `main`). One branch per plan — do not branch per task.
- Windows paths interpolated into shell command strings need `.replace(/\\/g, '\\\\')` (not needed anywhere in this plan, but the rule stands).
- Run tests with the workspace config: `npm run test:unit` (shared+main) and `npm run test:integration` (renderer) already pass `--config vitest.workspace.ts`.

---

### Task 1: Shared `SessionKind` type

**Files:**
- Modify: `src/shared/ipc-types.ts` (add type; extend `SessionCreateRequest` ~line 31, `SessionMetadata` ~line 42)
- Test: `src/shared/session-kind.test.ts` (create)

**Interfaces:**
- Produces: `type SessionKind = 'agent' | 'shell'`; `SessionCreateRequest.kind?: SessionKind`; `SessionMetadata.kind?: SessionKind`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/session-kind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SessionKind, SessionCreateRequest, SessionMetadata } from './ipc-types';

describe('SessionKind', () => {
  it('accepts shell and agent create requests', () => {
    const shell: SessionCreateRequest = {
      workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell',
    };
    const agent: SessionCreateRequest = {
      workingDirectory: '/tmp', permissionMode: 'standard',
    };
    expect(shell.kind).toBe('shell');
    expect(agent.kind).toBeUndefined(); // absent => agent
  });

  it('treats a missing metadata kind as agent (back-compat helper)', () => {
    const meta = { kind: undefined } as Pick<SessionMetadata, 'kind'>;
    const effective: SessionKind = meta.kind ?? 'agent';
    expect(effective).toBe('agent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- session-kind`
Expected: FAIL — `SessionKind` is not exported / `kind` not assignable.

- [ ] **Step 3: Add the type and fields**

In `src/shared/ipc-types.ts`, after the `PermissionMode` type (~line 4) add:

```ts
/** Whether a session runs an AI CLI ('agent') or is a plain terminal ('shell').
 *  Absent on persisted sessions from before this feature — treat as 'agent'. */
export type SessionKind = 'agent' | 'shell';
```

In `SessionCreateRequest` (add after `launchMode?`):

```ts
  kind?: SessionKind; // 'shell' spawns a plain terminal with no AI CLI (default 'agent')
```

In `SessionMetadata` (add after `providerId?`):

```ts
  kind?: SessionKind; // undefined treated as 'agent' for back-compat
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- session-kind`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-types.ts src/shared/session-kind.test.ts
git commit -m "feat(shell-sessions): add SessionKind discriminator to shared types"
```

---

### Task 2: `CLIManager` shell spawn + detection skip

**Files:**
- Modify: `src/main/cli-manager.ts` (`CLIManagerOptions` ~line 170; `bufferOutput` ~line 405; add `spawnShellSession`)
- Test: `src/main/cli-manager.test.ts` (create)

**Interfaces:**
- Consumes: `SessionKind` (Task 1).
- Produces: `CLIManagerOptions.kind?: SessionKind`; `CLIManager.spawnShellSession(): Promise<void>` (creates PTY, marks initialized, launches **no** command). Model detection is skipped when `kind === 'shell'`.

- [ ] **Step 1: Write the failing test**

Create `src/main/cli-manager.test.ts`. Note: `test/setup-main.ts` globally mocks `node-pty` (spawn returns `{ onData, onExit, write, resize, kill }` spies). We also mock `child_process` locally so `getFreshWindowsEnvironment` never shells out.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pty from 'node-pty';

// Stop the fresh-env probe from shelling out to powershell/login shell.
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => 'PATH=/usr/bin\n'),
  execFile: vi.fn(),
}));

import { CLIManager } from './cli-manager';

// Grab the onData handler the CLIManager registers on the mocked pty.
function getOnData(): (data: string) => void {
  const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
  const ptyInstance = spawnMock.mock.results[spawnMock.mock.results.length - 1].value;
  return ptyInstance.onData.mock.calls[0][0];
}
function getWrite(): ReturnType<typeof vi.fn> {
  const spawnMock = pty.spawn as unknown as ReturnType<typeof vi.fn>;
  const ptyInstance = spawnMock.mock.results[spawnMock.mock.results.length - 1].value;
  return ptyInstance.write;
}

describe('CLIManager shell sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('spawnShellSession launches no CLI command', async () => {
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell' });
    await mgr.spawnShellSession();
    expect(mgr.isInitialized).toBe(true);
    const writeCalls = getWrite().mock.calls.map((c: string[]) => c[0]).join('');
    expect(writeCalls).not.toContain('claude');
  });

  it('skips model detection for shell sessions', async () => {
    const onModel = vi.fn();
    const mgr = new CLIManager({ workingDirectory: '/tmp', permissionMode: 'standard', kind: 'shell' });
    mgr.onModelChange(onModel);
    await mgr.spawnShellSession();
    getOnData()('Welcome to Claude Code\nSonnet 4.6\nTips for getting started');
    expect(onModel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- cli-manager`
Expected: FAIL — `kind` not in options / `spawnShellSession` not a function.

- [ ] **Step 3: Add `kind` option**

In `src/main/cli-manager.ts`, import `SessionKind`:

```ts
import { TerminalSize, PermissionMode, ClaudeModel, LaunchMode, SessionKind } from '../shared/ipc-types';
```

Add to `CLIManagerOptions`:

```ts
  /** 'shell' spawns a plain terminal (no provider launch, no model detection). Default 'agent'. */
  kind?: SessionKind;
```

- [ ] **Step 4: Add `spawnShellSession`**

Add next to `spawn()` (after ~line 275):

```ts
  /**
   * Create the shell PTY for a plain terminal session and mark it initialized,
   * WITHOUT launching any provider command. Mirrors spawn() minus the CLI launch.
   */
  async spawnShellSession(): Promise<void> {
    await this.createPtyProcess();
    this._isInitialized = true;
  }
```

- [ ] **Step 5: Skip detection for shell**

In `bufferOutput` (~line 405), wrap the detection work (provider-pattern resolution through the Phase 1 / Phase 2 blocks — everything between `this.outputBuffer += data;` and the `if (this.flushTimeout === null)` flush scheduler) in a guard:

```ts
  private bufferOutput(data: string): void {
    this.outputBuffer += data;

    // Shell sessions run no AI CLI — there is no model to detect.
    if (this.options.kind !== 'shell') {
      // Resolve provider-specific detection options (undefined = use built-in Claude patterns)
      const providerPatterns = this.options.provider
        ? this.options.provider.getModelDetectionPatterns()
        : undefined;
      const providerNormalizer = this.options.provider
        ? (raw: string) => this.options.provider!.normalizeModel(raw)
        : undefined;

      // Phase 1: Initial detection (try on each chunk, give up after 8KB)
      if (!this.initialDetectionDone) {
        // ...existing Phase 1 body unchanged...
      }
      // Phase 2: Switch detection (rolling buffer to handle PTY fragmentation)
      else {
        // ...existing Phase 2 body unchanged...
      }
    }

    if (this.flushTimeout === null) {
      this.flushTimeout = setTimeout(() => {
        this.flushOutput();
      }, this.FLUSH_INTERVAL);
    }
  }
```

(Keep the existing Phase 1 / Phase 2 bodies verbatim — only add the `if (this.options.kind !== 'shell') { ... }` wrapper around them, leaving the flush scheduler outside the guard.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:unit -- cli-manager`
Expected: PASS (both tests).

- [ ] **Step 7: Commit**

```bash
git add src/main/cli-manager.ts src/main/cli-manager.test.ts
git commit -m "feat(shell-sessions): CLIManager shell spawn + skip model detection"
```

---

### Task 3: `SessionManager.createSession` shell branch

**Files:**
- Modify: `src/main/session-manager.ts` (`createSession` ~lines 209–326)
- Test: `src/main/session-manager.test.ts` (add a `describe` block; extend the mocked `CLIManager` prototype)

**Interfaces:**
- Consumes: `CLIManager.spawnShellSession` (Task 2), `SessionMetadata.kind` (Task 1).
- Produces: shell sessions get `metadata.kind === 'shell'`, `providerId` undefined, no pool claim, no provider resolution, spawned via `spawnShellSession()`.

- [ ] **Step 1: Write the failing test**

In `src/main/session-manager.test.ts`, first extend the mocked CLIManager (in the existing `vi.mock('./cli-manager', ...)` block ~line 87) with:

```ts
  CLIManager.prototype.spawnShellSession = vi.fn().mockResolvedValue(undefined);
```

Then add a new describe block at the end of the file:

```ts
describe('SessionManager.createSession — shell sessions', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
    // A provider registry whose get() we can assert is NOT called for shells.
    const registry = { get: vi.fn(() => { throw new Error('should not resolve provider for shell'); }) };
    manager.setProviderRegistry(registry as any);
  });

  it('creates a shell session with kind=shell and no provider', async () => {
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard', kind: 'shell',
    });
    expect(meta.kind).toBe('shell');
    expect(meta.providerId).toBeUndefined();
    expect(meta.status).toBe('running');
  });

  it('spawns via spawnShellSession, never spawn(), and never claims the pool', async () => {
    await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard', kind: 'shell',
    });
    expect(CLIManager.prototype.spawnShellSession).toHaveBeenCalledTimes(1);
    expect(CLIManager.prototype.spawn).not.toHaveBeenCalled();
    expect(SessionPool.prototype.claim).not.toHaveBeenCalled();
  });

  it('still creates an agent session with a provider (regression)', async () => {
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard',
    });
    expect(meta.kind).toBeUndefined();
    expect(meta.providerId).toBe('claude');
  });
});
```

Note: the agent regression test resolves a provider, but the `beforeEach` registry throws on `get`. Give the agent test its own registry that returns a provider:

```ts
  it('still creates an agent session with a provider (regression)', async () => {
    const registry = { get: vi.fn(() => ({ getEnvironmentVariables: () => ({}), buildCommand: () => 'claude' })) };
    manager.setProviderRegistry(registry as any);
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard',
    });
    expect(meta.kind).toBeUndefined();
    expect(meta.providerId).toBe('claude');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- session-manager`
Expected: FAIL — shell session still resolves provider (throws) / `spawnShellSession` never called.

- [ ] **Step 3: Branch `createSession` for shell**

In `src/main/session-manager.ts`:

(a) Provider id (~line 212) — skip provider for shell:

```ts
    const model = request.model;
    const isShell = request.kind === 'shell';

    // Resolve the provider to use: explicit request > default 'claude'. Shell sessions have none.
    const providerId = isShell ? undefined : (request.providerId ?? 'claude');
    let provider: IProvider | undefined;
    if (!isShell) {
      try {
        provider = this.providerRegistry?.get(providerId!);
      } catch {
        console.warn(`[SessionManager] Provider '${providerId}' not found, using no provider`);
        provider = undefined;
      }
    }
```

(b) Metadata (~line 222) — add `kind`:

```ts
    const metadata: SessionMetadata = {
      id,
      name: this.generateSessionName({ ...request, workingDirectory: workingDir }),
      workingDirectory: workingDir,
      permissionMode: request.permissionMode,
      status: 'starting',
      createdAt: Date.now(),
      worktreeInfo,
      providerId,
      kind: request.kind,
    };
```

(c) Pool claim (~line 288) — shell skips the pool:

```ts
    // Try to claim from pool first (agent sessions only — shells never launch claude,
    // so the pool's launch-latency optimization does not apply).
    const pooledSession = isShell ? null : this.sessionPool.claim();
```

(d) Direct-creation branch (~lines 316–325) — pass `kind` and pick the spawn method:

```ts
    } else {
      // FALLBACK PATH: Direct creation (existing behavior)
      console.log(`[SessionManager] Pool empty, creating session ${id} directly`);
      cliManager = new CLIManager({
        workingDirectory: workingDir,
        permissionMode: request.permissionMode,
        model,
        enableAgentTeams: this.agentTeamsGetter?.() ?? true,
        provider,
        launchMode: request.launchMode,
        kind: request.kind,
      });
      registerCallbacks(cliManager);
      if (isShell) {
        cliManager.spawnShellSession();
      } else {
        cliManager.spawn();
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- session-manager`
Expected: PASS (new shell tests + existing suite green).

- [ ] **Step 5: Commit**

```bash
git add src/main/session-manager.ts src/main/session-manager.test.ts
git commit -m "feat(shell-sessions): createSession shell branch (no provider, no pool, shell spawn)"
```

---

### Task 4: `SessionManager.restartSession` shell branch

**Files:**
- Modify: `src/main/session-manager.ts` (`restartSession` ~lines 534–609)
- Test: `src/main/session-manager.test.ts` (add cases)

**Interfaces:**
- Consumes: `CLIManager.spawnShellSession` (Task 2), persisted `metadata.kind`.
- Produces: restarting a `kind: 'shell'` session skips provider resolution and uses `spawnShellSession()`.

- [ ] **Step 1: Write the failing test**

Add to `src/main/session-manager.test.ts`:

```ts
describe('SessionManager.restartSession — shell sessions', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createSessionManager();
  });

  it('restarts a shell session via spawnShellSession, not spawn', async () => {
    const registry = { get: vi.fn(() => { throw new Error('no provider for shell'); }) };
    manager.setProviderRegistry(registry as any);
    const meta = await manager.createSession({
      workingDirectory: '/mock/home', permissionMode: 'standard', kind: 'shell',
    });
    vi.clearAllMocks(); // isolate restart calls
    const ok = await manager.restartSession(meta.id);
    expect(ok).toBe(true);
    expect(CLIManager.prototype.spawnShellSession).toHaveBeenCalledTimes(1);
    expect(CLIManager.prototype.spawn).not.toHaveBeenCalled();
    expect(registry.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- session-manager`
Expected: FAIL — restart calls `spawn()` and resolves a provider (throws).

- [ ] **Step 3: Branch `restartSession` for shell**

In `restartSession` (~line 534), replace the provider resolution + CLIManager construction + spawn with:

```ts
    const isShell = session.metadata.kind === 'shell';

    // Resolve provider from stored providerId (backward compat: missing = 'claude').
    // Shell sessions have no provider.
    let restartProvider: IProvider | undefined;
    if (!isShell) {
      const restartProviderId = session.metadata.providerId ?? 'claude';
      try {
        restartProvider = this.providerRegistry?.get(restartProviderId);
      } catch {
        console.warn(`[SessionManager] Provider '${restartProviderId}' not found on restart, using no provider`);
        restartProvider = undefined;
      }
    }

    // Create new CLI manager with same options
    const cliManager = new CLIManager({
      workingDirectory: session.metadata.workingDirectory,
      permissionMode: session.metadata.permissionMode,
      enableAgentTeams: this.agentTeamsGetter?.() ?? true,
      provider: restartProvider,
      kind: session.metadata.kind,
    });
```

Then in the spawn block (~line 607):

```ts
    try {
      if (isShell) {
        cliManager.spawnShellSession();
      } else {
        cliManager.spawn();
      }
      session.metadata.status = 'running';
    } catch (err) {
      session.metadata.status = 'error';
      console.error('Failed to restart session:', err);
      return false;
    }
```

(The existing `onModelChange`/`onOutput`/`onExit` handler attachment stays as-is — `onModelChange` simply never fires for a shell because detection is skipped.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- session-manager`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-manager.ts src/main/session-manager.test.ts
git commit -m "feat(shell-sessions): restartSession shell branch"
```

---

### Task 5: Renderer plumbing — `kind` through the hook & TabData

**Files:**
- Modify: `src/renderer/hooks/useSessionManager.ts` (mapping fn ~lines 26–32; `createSession` ~lines 104–130; interface type ~line 10)
- Modify: `src/renderer/components/ui/Tab.tsx` (`TabData` ~line 14)
- Test: `src/renderer/hooks/useSessionManager.test.ts` (create or extend if present)

**Interfaces:**
- Consumes: `SessionMetadata.kind` (Task 1).
- Produces: `TabData.kind?: 'agent' | 'shell'`; `createSession(name, workingDirectory, permissionMode, worktree?, providerId?, launchMode?, kind?)` now returns the new session id (`Promise<string>`); shell requests omit model/worktree/provider/launchMode.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/hooks/useSessionManager.test.ts` (jsdom project). Use the auto-derived electron API mock:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useSessionManager } from './useSessionManager';

describe('useSessionManager.createSession — shell', () => {
  beforeEach(() => {
    const api = getElectronAPI();
    api.getSettings = vi.fn().mockResolvedValue({ defaultModel: 'sonnet' });
    api.createSession = vi.fn().mockResolvedValue({ id: 'new-shell-id' });
    (window as any).electronAPI = api;
  });

  it('sends a shell request without model/provider/launchMode and returns the id', async () => {
    const { result } = renderHook(() => useSessionManager());
    let id: string | undefined;
    await act(async () => {
      id = await result.current.createSession(
        'my term', '/repo', 'standard', undefined, undefined, undefined, 'shell',
      );
    });
    expect(id).toBe('new-shell-id');
    const arg = (window.electronAPI.createSession as any).mock.calls[0][0];
    expect(arg.kind).toBe('shell');
    expect(arg.model).toBeUndefined();
    expect(arg.providerId).toBeUndefined();
    expect(arg.launchMode).toBeUndefined();
    expect(arg.worktree).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- useSessionManager`
Expected: FAIL — `createSession` takes no `kind` arg / returns void.

- [ ] **Step 3: Add `kind` to `TabData`**

In `src/renderer/components/ui/Tab.tsx`, inside `interface TabData` (after `providerId?`):

```ts
  kind?:            'agent' | 'shell';
```

- [ ] **Step 4: Map `kind` onto the renderer session**

In `src/renderer/hooks/useSessionManager.ts`, in the metadata→session mapping (~line 31, after `providerId: metadata.providerId,`):

```ts
    kind: metadata.kind,
```

- [ ] **Step 5: Extend `createSession`**

Update the interface signature (~line 10) and the implementation (~line 104):

```ts
  createSession: (name: string, workingDirectory: string, permissionMode: 'standard' | 'skip-permissions', worktree?: import('../../shared/types/git-types').WorktreeCreateRequest, providerId?: ProviderId, launchMode?: LaunchMode, kind?: import('../../shared/ipc-types').SessionKind) => Promise<string>;
```

```ts
  const createSession = useCallback(async (
    name: string,
    workingDirectory: string,
    permissionMode: 'standard' | 'skip-permissions',
    worktree?: import('../../shared/types/git-types').WorktreeCreateRequest,
    providerId?: ProviderId,
    launchMode?: LaunchMode,
    kind?: import('../../shared/ipc-types').SessionKind,
  ): Promise<string> => {
    try {
      if (kind === 'shell') {
        // Plain terminal: no model, provider, launch mode, or worktree.
        const meta = await window.electronAPI.createSession({
          name: name || undefined,
          workingDirectory,
          permissionMode,
          kind: 'shell',
        });
        return meta.id;
      }

      // Read default model from settings
      const settings = await window.electronAPI.getSettings();
      const defaultModel = settings.defaultModel || 'sonnet';

      const meta = await window.electronAPI.createSession({
        name: name || undefined,
        workingDirectory,
        permissionMode,
        model: defaultModel,
        worktree,
        providerId,
        launchMode,
      });
      return meta.id;
    } catch (err) {
      console.error('Failed to create session:', err);
      throw err;
    }
  }, []);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:integration -- useSessionManager`
Expected: PASS. Also run `npm run test:integration` to confirm no other renderer test regressed on the `createSession` return type.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/hooks/useSessionManager.ts src/renderer/components/ui/Tab.tsx src/renderer/hooks/useSessionManager.test.ts
git commit -m "feat(shell-sessions): thread kind through hook + TabData; createSession returns id"
```

---

### Task 6: Terminal behavior rules (Ctrl+C, newline, readiness)

**Files:**
- Create: `src/renderer/terminal/shell-key-rules.ts`
- Test: `src/renderer/terminal/shell-key-rules.test.ts` (create)
- Modify: `src/renderer/components/Terminal.tsx` (props ~line 49/67; keydown ~line 393; onData ~line 409; readiness ~line 294)
- Modify: `src/renderer/components/shell/TerminalHost.tsx` (thread `sessionKindMap` → `SingleTerminalSlot` → `Terminal`)
- Modify: `src/renderer/App.tsx` (add `sessionKindMap`; pass to `TerminalHost`)

**Interfaces:**
- Consumes: `SessionKind` (Task 1), `TabData.kind` (Task 5).
- Produces: `shouldShowCloseDialog(data, kittyFlags, kind)` and `isNewlineChord(e, kind)` pure predicates; Terminal gains `kind?: SessionKind` prop.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/terminal/shell-key-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowCloseDialog, isNewlineChord } from './shell-key-rules';

describe('shouldShowCloseDialog', () => {
  it('intercepts Ctrl+C for agent sessions in legacy mode', () => {
    expect(shouldShowCloseDialog('\x03', 0, 'agent')).toBe(true);
    expect(shouldShowCloseDialog('\x03', 0, undefined)).toBe(true); // back-compat
  });
  it('passes Ctrl+C through for shell sessions', () => {
    expect(shouldShowCloseDialog('\x03', 0, 'shell')).toBe(false);
  });
  it('does not intercept under kitty flags or for other data', () => {
    expect(shouldShowCloseDialog('\x03', 1, 'agent')).toBe(false);
    expect(shouldShowCloseDialog('a', 0, 'agent')).toBe(false);
  });
});

describe('isNewlineChord', () => {
  const enter = (mods: Partial<Record<'ctrlKey'|'shiftKey'|'altKey'|'metaKey', boolean>>) =>
    ({ key: 'Enter', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });
  it('is a newline chord for agent sessions with a modifier', () => {
    expect(isNewlineChord(enter({ ctrlKey: true }), 'agent')).toBe(true);
    expect(isNewlineChord(enter({ shiftKey: true }), undefined)).toBe(true);
  });
  it('is never a chord for shell sessions', () => {
    expect(isNewlineChord(enter({ ctrlKey: true }), 'shell')).toBe(false);
  });
  it('is not a chord without a modifier or non-Enter keys', () => {
    expect(isNewlineChord(enter({}), 'agent')).toBe(false);
    expect(isNewlineChord({ key: 'a', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }, 'agent')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- shell-key-rules`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the predicates**

Create `src/renderer/terminal/shell-key-rules.ts`:

```ts
import type { SessionKind } from '../../shared/ipc-types';

/** Legacy-mode Ctrl+C opens the close-confirm dialog only for agent sessions.
 *  Shell sessions must let Ctrl+C through to interrupt the foreground command. */
export function shouldShowCloseDialog(
  data: string,
  kittyFlags: number,
  kind: SessionKind | undefined,
): boolean {
  return data === '\x03' && kittyFlags === 0 && kind !== 'shell';
}

/** Ctrl/Shift/Alt/Cmd+Enter inserts a literal newline — a Claude-input
 *  affordance. Shell sessions want a real Enter, so this is agent-only. */
export function isNewlineChord(
  e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  kind: SessionKind | undefined,
): boolean {
  return kind !== 'shell'
    && e.key === 'Enter'
    && (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- shell-key-rules`
Expected: PASS.

- [ ] **Step 5: Wire predicates + kind into Terminal.tsx**

Import at top of `src/renderer/components/Terminal.tsx`:

```ts
import { shouldShowCloseDialog, isNewlineChord } from '../terminal/shell-key-rules';
import type { SessionKind } from '../../shared/ipc-types';
```

Add `kind` to `TerminalProps` (~line 49) and the destructure (~line 67):

```ts
  kind?: SessionKind; // 'shell' disables Claude-specific key handling & readiness
```
```ts
export function Terminal({ sessionId, isVisible, isFocused, providerId, kind, readOnly = false, getKittyFlags, onInput, onResize, onReady }: TerminalProps) {
```

Replace the newline block (~line 393):

```ts
        // Newline insertion (legacy renderer only — Kitty path handled above; agent sessions only).
        if (isNewlineChord(e, kind)) {
          e.preventDefault();
          if (!readOnly) onInput(sessionId, '\n');
          return false;
        }
```

Replace the Ctrl+C guard in `onData` (~line 409):

```ts
      // Close-confirm interception (agent sessions, legacy mode only). Shell
      // sessions let Ctrl+C pass through to interrupt the running command.
      if (shouldShowCloseDialog(data, flags, kind)) {
        if (!readOnly) setShowCloseConfirm(true);
        return;
      }
```

Add an immediate-ready effect after the fallback-timeout effect (~line 303):

```ts
  // Shell sessions have no AI CLI to wait for — ready as soon as the PTY is up.
  useEffect(() => {
    if (kind === 'shell') setIsClaudeReady(true);
  }, [kind]);
```

- [ ] **Step 6: Thread `kind` through TerminalHost**

`TerminalHost` is the persistent xterm holder; `providerId` is threaded from the host props down to the actual `<Terminal>` render (via `sessionProviderMap` → `SingleTerminalSlot` → an internal `providerMap` keyed by sessionId). **Mirror that exact path for `kind` — do not assume a single hop.** Concretely, in `src/renderer/components/shell/TerminalHost.tsx`, for every place `providerId` / `sessionProviderMap` / `providerMap` appears, add a parallel `kind` / `sessionKindMap` / `kindMap`:

- Add `sessionKindMap?: Record<string, 'agent' | 'shell'>` to the host's props type (next to `sessionProviderMap`).
- Wherever the host renders `SingleTerminalSlot` with `providerId={sessionProviderMap[sid]}` (~line 209), add `kind={sessionKindMap?.[sid]}`.
- Add `kind?: 'agent' | 'shell'` to `SingleTerminalSlot`'s props (~line 227) and destructure it (~line 238).
- Wherever `SingleTerminalSlot` builds `providerMap` from `providerId` (~line 246) and passes it onward, build the analogous `kindMap` and thread it to the same consumer, ending at `<Terminal kind={...} />` (the Terminal prop added in Step 5).

Grep `providerId` and `providerMap` within this file first; every hit gets a `kind` twin. Verify with `npm run build` (Step 8) that no `<Terminal>` render is missing the `kind` prop.

- [ ] **Step 7: Provide `sessionKindMap` from App**

In `src/renderer/App.tsx`, next to `sessionProviderMap` (~line 422):

```ts
  const sessionKindMap = useMemo(() => {
    const m: Record<string, 'agent' | 'shell'> = {};
    for (const s of sessions) {
      if (s.kind) m[s.id] = s.kind;
    }
    return m;
  }, [sessions]);
```

Where `<TerminalHost ... sessionProviderMap={sessionProviderMap} />` is rendered, add `sessionKindMap={sessionKindMap}`.

- [ ] **Step 8: Verify build + predicate tests**

Run: `npm run test:integration -- shell-key-rules` (PASS) and `npm run build` (renderer typechecks clean).
Expected: no TypeScript errors from the new `kind` prop wiring.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/terminal/shell-key-rules.ts src/renderer/terminal/shell-key-rules.test.ts src/renderer/components/Terminal.tsx src/renderer/components/shell/TerminalHost.tsx src/renderer/App.tsx
git commit -m "feat(shell-sessions): gate Ctrl+C/newline/readiness on session kind"
```

---

### Task 7: NewSessionSheet "Terminal" type

**Files:**
- Modify: `src/renderer/components/shell/NewSessionSheet.tsx` (`NewSessionForm` ~line 15; state ~line 60; controls ~line 452; `submit` ~line 163)
- Modify: `src/renderer/App.tsx` (`handleCreateSession` ~line 234)
- Test: `src/renderer/components/shell/NewSessionSheet.test.tsx` (create or extend)

**Interfaces:**
- Consumes: `SessionKind` (Task 1), `createSession(..., kind)` (Task 5).
- Produces: `NewSessionForm.kind: SessionKind`; selecting "Terminal" submits `{ kind: 'shell', workingDirectory: repo.path }` and hides agent/launch-mode/worktree controls.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/shell/NewSessionSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewSessionSheet } from './NewSessionSheet';

const repo = { id: 'r1', name: 'demo', path: '/repos/demo', isGit: false } as any;

describe('NewSessionSheet — Terminal type', () => {
  it('submits a shell form with kind=shell and the repo path', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <NewSessionSheet repos={[repo]} sessions={[]} activeRepoId="r1" onClose={() => {}} onCreate={onCreate} />
    );
    fireEvent.click(screen.getByRole('button', { name: /terminal/i })); // Type toggle
    fireEvent.click(screen.getByRole('button', { name: /start|create/i }));
    // onCreate is async; flush microtasks
    await Promise.resolve();
    expect(onCreate).toHaveBeenCalledTimes(1);
    const form = onCreate.mock.calls[0][0];
    expect(form.kind).toBe('shell');
    expect(form.workingDirectory).toBe('/repos/demo');
  });
});
```

(If the start button's accessible name differs, match the actual label used in the sheet footer.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- NewSessionSheet`
Expected: FAIL — no "Terminal" toggle / form has no `kind`.

- [ ] **Step 3: Add `kind` to the form + state**

In `NewSessionForm` (~line 15) add:

```ts
  kind: import('../../../shared/ipc-types').SessionKind; // 'agent' | 'shell'
```

Add state (~line 60):

```ts
  const [sessionType, setSessionType] = useState<'agent' | 'shell'>('agent');
```

- [ ] **Step 4: Add the Type toggle and gate the agent controls**

Immediately before the `{/* Agent + Launch mode */}` grid (~line 452), add:

```tsx
          {/* Session type */}
          <div className="p4-form-row" style={{ marginBottom: 12 }}>
            <label>Type</label>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-mid)', padding: 2, borderRadius: 6 }}>
              {(['agent', 'shell'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSessionType(t)}
                  className="p4-btn"
                  style={{
                    flex: 1, justifyContent: 'center',
                    background: sessionType === t ? 'var(--surface-high)' : 'transparent',
                    border: 0,
                    gap: 4,
                    color: sessionType === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {t === 'shell' && <P4Icon name="terminal" size={12} />}
                  {t === 'agent' ? 'Agent' : 'Terminal'}
                </button>
              ))}
            </div>
          </div>
```

Wrap the existing Agent + Launch-mode grid (~lines 453–537) so it only renders for agent sessions:

```tsx
          {sessionType === 'agent' && (
          <div className="p4-form-grid" style={{ marginTop: 12 }}>
            {/* ...existing Agent + Launch mode controls unchanged... */}
          </div>
          )}
```

Also gate the worktree controls the same way (v1 shells run in the repo folder, no worktree). Wrap the worktree-mode section (the block that renders worktree mode buttons / branch inputs, ending at the `worktreeMode === 'current'` block ~line 448) in `{sessionType === 'agent' && ( ... )}`. For a plain non-git folder the sheet already forces `current` mode, so shells simply omit these controls and use `repo.path`.

- [ ] **Step 5: Set `kind` + shell working dir in `submit`**

In `submit` (~line 170), change the `onCreate` payload:

```ts
      const isShell = sessionType === 'shell';
      const permissionMode: PermissionMode =
        launchMode === 'bypass-permissions' ? 'skip-permissions' : 'standard';
      await onCreate({
        name: name || (isShell ? 'Terminal' : 'New session'),
        repoId: repo.id,
        workingDirectory: isShell ? repo.path : worktreePathPreview,
        agent,
        launchMode: isShell ? 'default' : launchMode,
        permissionMode: isShell ? 'standard' : permissionMode,
        worktreeMode: isShell ? 'current' : worktreeMode,
        kind: isShell ? 'shell' : 'agent',
        branch: isShell ? undefined :
          worktreeMode === 'new'      ? derivedSlug :
          worktreeMode === 'existing' ? branch :
          worktreeMode === 'share'    ? sharedSession?.worktreeBranch ?? undefined :
          undefined,
        baseBranch: isShell ? undefined :
          worktreeMode === 'new' && baseBranch && baseBranch !== currentBranchName
            ? baseBranch
            : undefined,
        shareSessionId: isShell ? undefined :
          worktreeMode === 'share' ? shareSessionId : undefined,
      });
      onClose();
```

Also relax `disabled` (~line 158) so shell can always submit:

```ts
  const disabled =
    submitting ||
    (sessionType === 'agent' && worktreeMode === 'existing' && !branch) ||
    (sessionType === 'agent' && worktreeMode === 'share' && !sharedSession);
```

- [ ] **Step 6: Branch `handleCreateSession` in App for shell**

In `src/renderer/App.tsx`, at the top of `handleCreateSession` (~line 234, right after the `repo` lookup):

```ts
    if (form.kind === 'shell') {
      // Plain terminal in the repo folder — no worktree, provider, or launch mode.
      await createSession(form.name, form.workingDirectory, 'standard', undefined, undefined, undefined, 'shell');
      return;
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:integration -- NewSessionSheet`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/shell/NewSessionSheet.tsx src/renderer/App.tsx src/renderer/components/shell/NewSessionSheet.test.tsx
git commit -m "feat(shell-sessions): NewSessionSheet Terminal type + App shell create branch"
```

---

### Task 8: Terminal badges in rail / tile / pane

**Files:**
- Modify: `src/renderer/components/shell/SessionRail.tsx` (~line 58/108)
- Modify: `src/renderer/components/shell/SessionTile.tsx` (~lines 74–87)
- Modify: `src/renderer/components/shell/SessionPane.tsx` (~lines 38–57)

**Interfaces:**
- Consumes: `TabData.kind` (Task 5). No new exports.

This task is visual; per the standing preference it is verified manually (Step 4). The code below is exact.

- [ ] **Step 1: SessionRail terminal badge**

In `SessionRail.tsx`, replace the agent badge span (~line 108). Currently:

```tsx
          <span style={{ color: agentColor(agent), fontWeight: 600 }}>{agentLetter(agent)}</span>
```

with:

```tsx
          {session.kind === 'shell' ? (
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <P4Icon name="terminal" size={10} /> shell
            </span>
          ) : (
            <span style={{ color: agentColor(agent), fontWeight: 600 }}>{agentLetter(agent)}</span>
          )}
```

(`P4Icon` is already imported in SessionRail.tsx.)

- [ ] **Step 2: SessionTile terminal badge**

In `SessionTile.tsx`, replace the agent letter span in the tile foot (~line 75):

```tsx
    <span style={{ color: agentColor(agent), fontWeight: 600 }}>{agentLetter(agent)}</span>
```

with:

```tsx
    {session.kind === 'shell' ? (
      <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <P4Icon name="terminal" size={9} style={{ verticalAlign: -1 }} /> shell
      </span>
    ) : (
      <span style={{ color: agentColor(agent), fontWeight: 600 }}>{agentLetter(agent)}</span>
    )}
```

(Confirm `P4Icon` is imported in SessionTile.tsx; it is used elsewhere in the file for the branch icon, so it is.)

- [ ] **Step 3: SessionPane permission chip → Terminal label**

In `SessionPane.tsx`, replace the permission badge (~line 54):

```tsx
          <span className={permClass}>{permLabel}</span>
```

with:

```tsx
          {session.kind === 'shell'
            ? <span className="p4-chip"><P4Icon name="terminal" size={10} /> Terminal</span>
            : <span className={permClass}>{permLabel}</span>}
```

(Confirm `P4Icon` is imported in SessionPane.tsx; it is used for the branch chip, so it is.)

- [ ] **Step 4: Manual verification**

```bash
npm run build && npm run build:electron && npm run start
```

Verify:
- Create a Terminal session (NewSessionSheet → Type → Terminal → Start). Rail row and grid tile show a terminal glyph + "shell" instead of a provider letter; the session pane strip shows a "Terminal" chip.
- The terminal accepts normal commands (`git status`, `dir`/`ls`), and **Ctrl+C interrupts a running command** (e.g. `ping -t` on Windows / `ping` on Unix) without opening the close-confirm dialog.
- An agent (Claude) session still shows its provider letter and still opens the close-confirm dialog on Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/shell/SessionRail.tsx src/renderer/components/shell/SessionTile.tsx src/renderer/components/shell/SessionPane.tsx
git commit -m "feat(shell-sessions): terminal badge in rail, tile, and pane"
```

---

### Task 9: "Open terminal here" companion action

**Files:**
- Modify: `src/renderer/App.tsx` (context-menu items ~lines 807–833; add handler near `handleCreateSession`)

**Interfaces:**
- Consumes: `createSession(..., kind)` returning the new id (Task 5), the session context menu (`sessionMenu`, `switchSession`).

- [ ] **Step 1: Add the handler**

In `src/renderer/App.tsx`, after `handleCreateSession` (~line 284) add:

```ts
  const handleOpenTerminalHere = useCallback(async (sessionId: string, workingDirectory: string, baseName: string) => {
    // Loosely-coupled companion: a plain shell seeded to the agent's dir, then focus it.
    const newId = await createSession(`${baseName} · shell`, workingDirectory, 'standard', undefined, undefined, undefined, 'shell');
    await switchSession(newId);
  }, [createSession, switchSession]);
```

- [ ] **Step 2: Add the context-menu item**

In the session context menu `items` array (~line 826, after "Rename session…" and before "Close session"), insert:

```tsx
              {
                label: 'Open terminal here',
                icon: 'terminal',
                onSelect: () => {
                  if (s.workingDirectory) {
                    void handleOpenTerminalHere(s.id, s.workingDirectory, s.name);
                  }
                },
              },
```

(`ContextMenu` items accept an `icon` name rendered via `P4Icon`; `terminal` is a valid glyph. If the `ContextMenu` item `icon` prop is typed to a narrower union that excludes `'terminal'`, either widen it to include `'terminal'` or fall back to `'cmd'` — do not leave a type error.)

- [ ] **Step 3: Manual verification**

```bash
npm run build && npm run build:electron && npm run start
```

Verify: right-click an agent session → "Open terminal here" creates a new shell session whose working directory matches the agent's (`cd` / `pwd` confirms), the app switches focus to it, and closing the agent leaves the shell running (loose coupling).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(shell-sessions): 'Open terminal here' companion action"
```

---

## Final Verification

- [ ] Run the full unit + integration suite: `npm test`. Expected: all green.
- [ ] Run `npm run build && npm run build:electron`. Expected: clean typecheck for main and renderer.
- [ ] Manual smoke (see Task 8 Step 4 and Task 9 Step 3): standalone shell creation, Ctrl+C passthrough, agent Ctrl+C dialog intact, companion seeding, and terminal badges.
- [ ] Confirm all work is on `feat/shell-sessions`; open a PR against `main`.

## Spec Coverage Notes

- Data model (SessionKind + fields) → Task 1.
- Spawn path (PTY-only, detection skip) → Task 2; createSession/restart branches → Tasks 3, 4.
- Terminal behavior (Ctrl+C, key remaps, readiness) → Task 6.
- UI: NewSessionSheet "Terminal" → Task 7; rail/tile/pane badges → Task 8; "Open terminal here" (companion, v1 = seeded new session, no split pane per spec Non-Goals) → Task 9.
- Lifecycle/persistence/limits: shells reuse the existing persistence and restart paths (Task 4 covers restart); they count toward `MAX_SESSIONS` via the unchanged guard in `createSession`.
- Testing: unit (shared/main) Tasks 1–4; renderer integration Tasks 5–7; manual for visual/companion Tasks 8–9 (per standing preference).
