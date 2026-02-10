# ClaudeDesk

Electron desktop app wrapping Claude Code CLI with multi-session terminals, split views, and agent team visualization.

## Tech Stack

Electron 28 | React 18 | TypeScript | xterm.js | node-pty | Tailwind CSS | reactflow

## Architecture

```
┌─────────────────────────────────────────────┐
│  Main Process (Node.js)                     │
│  8 managers + IPC handlers + session pool   │
└──────────────────┬──────────────────────────┘
                   │ IPC (80 methods)
┌──────────────────┴──────────────────────────┐
│  Preload (auto-derived context bridge)      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│  Renderer (React 18)                        │
│  Hooks → Components → UI                   │
└─────────────────────────────────────────────┘
```

**3-layer pattern per domain:** Manager (main) → Hook (renderer) → Components (renderer)

**IPC contract** (`src/shared/ipc-contract.ts`) is the single source of truth — 80 methods. The preload bridge and `ElectronAPI` type are auto-derived from it.

## Domain Map

| Domain | Main (manager) | Renderer (hook + UI) | Shared types | IPC prefix |
|--------|---------------|---------------------|-------------|------------|
| Sessions | session-manager, cli-manager, session-pool, session-persistence | useSessionManager, Terminal | ipc-types.ts | `session:*` |
| Split View | settings-persistence | useSplitView, SplitLayout, PaneHeader, PaneSessionPicker | ipc-types.ts | `settings:*` |
| Agent Teams | agent-team-manager | useAgentTeams, useAutoTeamLayout, useMessageStream, TeamPanel, TaskBoard, MessageStream, AgentGraph | ipc-types.ts, message-parser.ts | `teams:*` |
| Templates | prompt-templates-manager, built-in-actions | useCommandPalette, CommandPalette, TemplateEditor | types/prompt-templates.ts | `template:*` |
| History | history-manager | useHistory, HistoryPanel | types/history-types.ts | `history:*` |
| Checkpoints | checkpoint-manager, checkpoint-persistence | useCheckpoints, CheckpointPanel, CheckpointDialog | types/checkpoint-types.ts | `checkpoint:*` |
| Quota | quota-service | useQuota, BudgetPanel, BudgetSettings | ipc-types.ts | `quota:*`, `burnRate:*` |
| Drag-Drop | file-dragdrop-handler, file-utils | useDragDrop, DragDropOverlay, DragDropContextMenu, DragDropSettings | ipc-types.ts | `dragdrop:*` |
| Workspaces | settings-persistence | SettingsDialog | ipc-types.ts | `workspace:*` |
| Atlas | atlas-manager | useAtlas, AtlasPanel | types/atlas-types.ts | `atlas:*` |
| Window | index.ts | ConfirmDialog, SettingsDialog, AboutDialog, TitleBarBranding | ipc-types.ts | `window:*`, `dialog:*` |

## Adding a New IPC Method

1. Add entry to `src/shared/ipc-contract.ts` (in `IPCContractMap`)
2. Add handler in `src/main/ipc-handlers.ts` using `registry.handle()` / `registry.on()`

That's it. The preload bridge and types auto-derive.

## Adding a New Domain

1. Create `src/main/<domain>-manager.ts`
2. Create `src/renderer/hooks/use<Domain>.ts`
3. Create component(s) in `src/renderer/components/`
4. Add IPC methods to `ipc-contract.ts` with `<domain>:*` prefix
5. Wire manager in `src/main/index.ts` (import, instantiate, pass to `setupIPCHandlers`)
6. Update `docs/repo-index.md`

## Critical Implementation Patterns

- **Shell setup**: `cli-manager.ts` uses `cmd.exe` on Windows and the user's default shell on Unix. No directory locking or shell overrides.
- **Output buffering**: 16ms batches in `CLIManager` prevent IPC flooding (~60fps).
- **Claude readiness**: Pattern detection ("Claude Code", "Sonnet", "Tips for getting started") + 5s fallback timeout in `Terminal.tsx`.
- **Ctrl+C interception**: Caught in `terminal.onData()`, shows `ConfirmDialog`. Never forward `\x03` to Claude (it exits).
- **Session pool**: Pre-warmed shells in `session-pool.ts` for faster session creation. Delayed init (2.5s after app start).
- **IPC contract**: One entry in `IPCContractMap` = auto-derived channel, kind, preload bridge method, and TypeScript type. No manual wiring needed.
- **Split view**: `useSplitView` manages a tree of leaf/branch nodes. Max 4 panes. State persisted in settings.
- **Agent team detection**: `AgentTeamManager` watches `~/.claude/teams/` and `~/.claude/tasks/` via `fs.watch()`. Auto-links sessions within 30s of team creation.

## Pitfalls

- Windows paths need `.replace(/\\/g, '\\\\')`
- Never send Ctrl+C (`\x03`) to Claude — it exits immediately
- Never use React hooks inside callbacks (caused SplitLayout crash — see `useSplitView.ts`)
- Always batch PTY output (16ms `FLUSH_INTERVAL` in CLIManager)
- `transformTree` in `useSplitView.ts` must recurse children BEFORE applying transformation (infinite recursion otherwise)
- Reuse existing UI components from `components/ui/` for consistency
- No global state library — React hooks only

## Design Language

Dark theme (Tokyo Night): bg `#1a1b26`, accent `#7aa2f7`, danger `#f7768e`, border `#292e42`
Font: JetBrains Mono. Monospace everywhere.

## Docs

- [Repo Index](docs/repo-index.md) — detailed domain-to-file mapping
- [Agent Teams Guide](docs/AGENT_TEAMS.md)
- [Quick Start: Agent Teams](docs/QUICKSTART_AGENT_TEAMS.md)
- [Contributing](CONTRIBUTING.md)
- [Repository Atlas Evaluation](docs/REPO_ATLAS_EVALUATION.md)
