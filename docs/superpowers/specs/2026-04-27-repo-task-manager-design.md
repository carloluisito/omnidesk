# Repo-Scoped Task Manager — Design

**Date:** 2026-04-27
**Status:** Design approved, ready for implementation plan
**Scope:** Personal todo list tied to a repo, with a side panel and a quick-capture shortcut. Tasks are stored as a markdown file the active AI session can read and edit directly.

## Goal

Give the user a lightweight personal todo list inside OmniDesk, scoped to the current repo, that survives session restarts. The list must be (a) frictionless to add to without leaving flow, and (b) editable by the active AI session itself, so the user can ask Claude/Codex to refine vague tasks into clean, no-noise entries.

## Non-Goals

- Not a project manager. No priorities, due dates, tags, or assignees.
- Not a backlog the AI executes from autonomously.
- Not session-scoped. Tasks live with the repo.
- No auto-archive, no analytics, no sync across machines.

## User Stories

1. While working in a session, I press a shortcut, type "fix race in session pool", press Enter, and keep going. The task is saved to the current repo.
2. I open the Task panel for a repo and see all open + completed tasks. I check things off, edit titles inline, expand notes.
3. I tell the active Claude/Codex session "clean up my tasks — make them crisp, no noise". It edits `.omnidesk/tasks.md` directly, the panel updates immediately via a file watcher.
4. I close OmniDesk and reopen the repo days later. The tasks are still there.

## Architecture

New domain following the standard 3-layer pattern used by every other domain (Sessions, History, Atlas, Git, etc.):

- **Main:** `src/main/task-manager.ts` — owns `.omnidesk/tasks.md` per repo. Parses, writes, and watches the file.
- **Renderer hook:** `src/renderer/hooks/useTasks.ts` — subscribes to changes for the current repo, exposes task state and mutation actions.
- **Renderer UI:** `src/renderer/components/TaskPanel.tsx` (side panel) and `src/renderer/components/TaskQuickCapture.tsx` (overlay shortcut).
- **Shared types:** `src/shared/types/task-types.ts`.
- **IPC prefix:** `task:*`.

### Key design point

The AI does not go through OmniDesk's IPC. It edits `.omnidesk/tasks.md` with its normal Read/Edit tools. A file watcher in `task-manager.ts` keeps the panel in sync. OmniDesk only writes the file when the user acts in the UI. This keeps OmniDesk simple and puts the smarts where they belong — in the active session.

## File Format

`.omnidesk/tasks.md` — GitHub-flavored markdown checklist. Human-editable, AI-editable, diff-friendly.

```markdown
# Tasks

- [ ] Fix race condition in session pool warmup
  Repro: open 4 sessions fast, second one hangs ~2s.
- [ ] Add Codex provider model detection
- [x] Wire up quick-capture shortcut
```

### Parsing rules

- A task is a top-level `- [ ]` or `- [x]` line.
- Everything indented under that line (until the next task or a blank line followed by a new task) is the `notes` field for that task.
- Task order in the file is the order in the UI.
- The `# Tasks` heading is preserved on round-trip but is not required.
- Anything else in the file (other headings, prose, comments) is preserved as-is on round-trip so the AI can leave structure without OmniDesk clobbering it.

### Data model

```ts
interface Task {
  id: string;        // stable hash of (file position, title), recomputed on every parse
  title: string;
  done: boolean;
  notes?: string;
  createdAt: number; // sourced from sidecar, not from the markdown
}
```

### Sidecar metadata

`createdAt` (and any future per-task metadata) lives in `.omnidesk/tasks.meta.json` keyed by task id. The markdown file stays free of metadata noise. When a task disappears from the markdown, its sidecar entry is garbage-collected on next parse.

### Location & git

`.omnidesk/tasks.md` is per-repo. OmniDesk does **not** auto-gitignore it. The user decides whether to commit it.

## UI

### TaskPanel (side panel)

Lives alongside HistoryPanel, AtlasPanel, GitPanel, etc.

- Header: repo name + open/total counts (e.g., "3 open / 5 total").
- Inline add row at the top — type, press Enter to save.
- Task list: checkbox, title, optional notes (collapsed by default; click to expand).
- Hover row reveals edit and delete icons.
- Completed tasks render dimmed and sink to the bottom of the list. No auto-archive.
- Empty state: short hint — "Add a task, or ask the active session to write to `.omnidesk/tasks.md`."

### TaskQuickCapture (overlay)

Modeled on `CommandPalette`.

- Default shortcut: **Ctrl/Cmd+Shift+T**. Configurable later if it conflicts.
- Single text input. Enter saves and closes. Esc cancels.
- Shows the last 3 open tasks below the input as lightweight context.
- Always writes to the current focused session's repo. If no repo, the overlay shows a "no repo" state and does not save.

### No AI-refine UI inside OmniDesk

Refinement happens by talking to the active session. The session edits the file. The watcher updates the panel. OmniDesk has no "refine" button, no LLM call of its own, and no special prompt-injection flow.

## IPC Surface

All under the `task:*` prefix. Added to `src/shared/ipc-contract.ts`:

- `task:list(repoPath)` → `Task[]`
- `task:add(repoPath, title)` → `Task`
- `task:toggle(repoPath, id)` → `Task`
- `task:edit(repoPath, id, { title?, notes? })` → `Task`
- `task:delete(repoPath, id)` → `void`
- `task:onChange(repoPath)` event — fires whenever the file changes (UI-driven or external)

The preload bridge and `ElectronAPI` types auto-derive from the contract — no manual wiring beyond the contract entry and the handler in `ipc-handlers.ts`.

## Edge Cases

- **External edits during UI write** — debounce file writes; last-write-wins. The watcher reconciles. If the AI edits the file while the user is toggling a checkbox, the toggle re-applies on top of the AI's version. Rare and acceptable.
- **Malformed markdown** — parser is permissive. Anything that is not a valid task line is preserved verbatim on round-trip.
- **No repo / scratch session** — TaskPanel shows "Open a repo to use tasks." TaskQuickCapture is a no-op with a small toast.
- **Repo rename or move** — tasks live in the repo directory and follow naturally.
- **Concurrent UI mutations** — `task-manager` serializes writes via a per-repo mutex (same pattern as `GitManager`).

## Testing

Following existing Vitest workspace conventions (`shared`, `main`, `renderer`).

- **shared:** parser round-trip is byte-stable for a representative set of markdown inputs (clean, with notes, with extra prose, with completed tasks, empty file).
- **main:** `task-manager` add / toggle / edit / delete produce correct file content; watcher fires `task:onChange` on external edits; sidecar GC removes meta entries for tasks that no longer exist; per-repo mutex serializes writes.
- **renderer:** `useTasks` reflects watcher events; `TaskPanel` renders, toggles, and edits; `TaskQuickCapture` saves on Enter, aborts on Esc, no-ops with no repo.

## Out of Scope (Future Work)

- Configurable quick-capture shortcut.
- Optional task → session/checkpoint/file-path links.
- Auto-detection of vague task titles with a "needs detail" indicator.
- Heuristic-based AI prompt to refine tasks via the active session (could be a built-in custom command later).
