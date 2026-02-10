# Agent Teams - Quick Start Guide

Get started with Agent Teams in ClaudeDesk in under 5 minutes.

## Prerequisites

- ClaudeDesk v4.2+ installed
- Claude Code CLI with Agent Teams support
- A Claude Code subscription (Pro/Max)

## Step 1: Start a Session

Create a new session in ClaudeDesk. Agent Teams is automatically enabled on all sessions via the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable.

## Step 2: Request a Team Task

Ask Claude to perform a complex task that benefits from multiple agents. For example:

```
Please review this codebase for security issues, performance problems,
and code quality. Use a team to parallelize the work.
```

Claude Code will automatically spawn teammate agents as needed.

## Step 3: Monitor the Team

When a team forms, ClaudeDesk detects the team directory at `~/.claude/teams/<team-name>/config.json` and displays it in the panel:
1. A **blue badge** appears on the Teams button in the tab bar showing the team count
2. Click the **Teams button** to open the Team Panel
3. Expand a team card to see members and their status
4. Click **Tasks** to see the Kanban board with per-agent task files
5. Click **Messages** to see inter-agent communication (`@agent> message` format)
6. Click **Graph** to see the agent relationship visualization

## Step 4: Navigate Between Agents

- Click on any **team member** to focus their terminal session
- If auto-layout is enabled, panes are automatically arranged for you
- Use the **Split View** button for manual pane arrangement

## Example Scenarios

### Code Review Team
```
Review this project for bugs, security vulnerabilities, and performance issues.
Assign different areas to different agents.
```

### Feature Implementation
```
Implement user authentication with JWT tokens. Have one agent handle the backend
and another handle the frontend changes.
```

### Bug Investigation
```
Investigate the failing tests in the CI pipeline. Check both the test code
and the implementation for issues.
```

## Tips

- **Keep teams small**: 2-4 agents work best
- **Be specific**: Tell Claude what each agent should focus on
- **Monitor tasks**: Use the Task Board to track progress
- **Check messages**: The Message Stream parses `@agentname>` messages from terminal output in real time
- **Close teams**: Use the "Close Team" button to end all team sessions at once
- **Stale teams**: Teams are automatically cleaned up when sessions end. On restart, old teams (>5 min) are not shown
