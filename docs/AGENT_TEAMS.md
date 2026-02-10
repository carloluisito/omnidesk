# Agent Teams - ClaudeDesk User Guide

## Overview

Agent Teams is a feature that provides first-class visibility and management of Claude Code's experimental Agent Teams capability. When Claude Code spawns multiple agents that collaborate on a task, ClaudeDesk automatically detects, monitors, and visualizes their activity.

## Features

### Team Detection & Monitoring
- **Automatic detection** via file system monitoring of `~/.claude/teams/` and `~/.claude/tasks/`
- **Real-time updates** as teams form, teammates join, and tasks change
- **Session linking** - automatically links Claude sessions to their team roles

### Team Panel (Sidebar)
Open the Team Panel by clicking the **Users** icon in the tab bar, or when teams are detected (indicated by a blue badge showing the team count).

The panel shows:
- **Team list** with expandable cards
- **Member hierarchy** - lead (gold star) and teammates (blue user icon)
- **Session status** - green (running), yellow (starting), red (exited), gray (disconnected)
- **Task statistics** - pending, in-progress, and completed counts

Click on any team member to focus their terminal session.

### Task Board
A Kanban-style visualization of team tasks:
- **Three columns**: Pending | In Progress | Completed
- **Filter by**: status (all/assigned/blocked/unblocked) and team member
- **Task details**: click to expand and see description, dependencies, owner
- **Blocked indicator**: red left border on tasks that are blocked by others

### Message Stream
Real-time inter-agent communication feed:
- **Pattern detection**: Parses multiple message formats from terminal output
- **Color-coded** participants for easy visual tracking
- **Search and filter**: by content, sender, or receiver
- **Timeline view**: chronological with auto-scroll
- **Expandable details**: click to see raw output and message ID

### Agent Graph
Interactive node-based visualization using React Flow:
- **Hierarchical layout**: lead at top, teammates below
- **Node details**: agent name, role badge, connection status
- **Animated edges**: show communication flow between agents
- **Interactive**: zoom, pan, drag nodes
- **Click to focus**: click any node to focus its terminal session

### Auto-Layout
Automatically arranges split panes when teammates join:
- **Smart detection**: listens for teammate events
- **Automatic splitting**: creates new panes for new teammates
- **Respects limits**: max 4 panes
- **Configurable**: toggle on/off in Settings > General > Agent Teams

## Settings

### Agent Teams Settings (Settings > General)
- **Auto-layout teams**: When enabled (default), automatically arranges split panes when new teammates join a team.

## How It Works

1. **Environment Variable**: ClaudeDesk sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` on all CLI sessions, enabling the Agent Teams feature in Claude Code.

2. **File System Monitoring**: ClaudeDesk watches `~/.claude/teams/` and `~/.claude/tasks/` recursively for changes. Each team is a directory containing `config.json`, and tasks are individual JSON files per team subdirectory. Changes are detected via `fs.watch({ recursive: true })` with debouncing (200ms).

3. **Staleness Detection**: On startup, ClaudeDesk skips team directories whose `config.json` hasn't been modified in the last 5 minutes, preventing stale teams from previous sessions from appearing. Active teams are always detected via file watchers in real time.

4. **Session Linking**: When a team is detected, ClaudeDesk searches for recently created sessions (within 30 seconds) and links them to team members. The oldest running session is assigned as the lead. When all sessions for a team close, the team is automatically removed from the panel.

5. **Message Parsing**: Terminal output from all running sessions is stripped of ANSI escape codes and parsed using regex patterns to extract inter-agent messages (e.g., `@agentname> message`). Parsing is debounced (100ms) for performance.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click Teams icon | Open/close Team Panel |
| Click team member | Focus their terminal session |
| Click task card | Expand/collapse task details |

## File Structure

Claude Code uses a directory-based layout for agent teams:

```
~/.claude/
  teams/
    <team-name>/
      config.json           # Team configuration
      inboxes/
        <agent-name>.json   # Per-agent message inbox
  tasks/
    <team-name>/
      .lock                 # Lock file (ignored)
      1.json                # Individual task files
      2.json
      ...
```

### Team Configuration (`~/.claude/teams/<team-name>/config.json`)
```json
{
  "description": "Code review team",
  "leadSessionId": "session-abc-123",
  "leadAgentId": "team-lead",
  "members": [
    {
      "name": "team-lead",
      "agentId": "team-lead",
      "agentType": "team-lead",
      "color": "yellow",
      "model": "claude-sonnet-4-5-20250929"
    },
    {
      "name": "researcher",
      "agentId": "researcher",
      "agentType": "general-purpose",
      "color": "blue"
    }
  ]
}
```

Note: Claude Code uses `"team-lead"` and `"general-purpose"` as agent types. ClaudeDesk normalizes these to `"lead"` and `"teammate"` internally.

### Task File (`~/.claude/tasks/<team-name>/1.json`)
```json
{
  "id": "1",
  "subject": "Research the project structure",
  "description": "Explore all files and report findings",
  "status": "in_progress",
  "owner": "researcher",
  "blockedBy": [],
  "blocks": ["3"]
}
```

Note: Each task is stored as an individual JSON file (e.g., `1.json`, `2.json`). Tasks use `id` (not `taskId`) as the identifier field.

## Troubleshooting

### Teams not appearing
- Ensure Claude Code version supports Agent Teams
- Check that `~/.claude/teams/` directory exists and contains team subdirectories with `config.json`
- On startup, teams whose `config.json` is older than 5 minutes are considered stale and skipped. Start a fresh team session to trigger detection.
- Verify `config.json` is valid JSON with a `members` array

### Session not linking to team
- Sessions must be created within 30 seconds of the team being detected
- Try manually linking via the Team Panel
- Check that the session's `agentId` matches a team member's `agentId`

### Messages not appearing
- Messages are parsed from terminal output of all running sessions
- Agent messages must follow the `@agentname> message` format used by Claude Code
- ANSI escape codes are automatically stripped before parsing
- Messages are debounced by 100ms; wait briefly after agent activity

### Stale teams showing after sessions end
- Teams are automatically removed when all their linked sessions close or exit
- On app restart, teams with stale config files (>5 minutes old) are not loaded

### Auto-layout not working
- Verify "Auto-layout teams" is enabled in Settings > General
- Maximum 4 panes are supported
- Each teammate is only auto-laid out once per session
