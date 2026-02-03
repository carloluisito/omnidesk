# Worktree Session Close Confirmation Feature

## Overview

Added a confirmation dialog when users close worktree sessions, allowing them to choose whether to keep or delete the worktree and branch. This prevents accidental loss of work and provides clear options for managing worktrees.

## Changes Made

### 1. Bug Fix: Ship Feature OAuth Restrictions (`src/api/terminal-routes.ts`)

**Problem**: When checking for existing PRs, the code tried GitHub API fallback even when `gh pr view` simply didn't find a PR. For organizations with OAuth App access restrictions, this caused 403 errors.

**Fix**:
- Added detection for "no pull requests found" error message
- Skip API fallback when no PR exists (lines 3559-3592)
- Added better error logging for OAuth restrictions (lines 3706-3711)

### 2. Bug Fix: PR Creation Error Detection (`src/core/github-integration.ts`)

**Problem**: The error parser didn't recognize "OAuth App access restrictions" messages, preventing proper fallback to `gh` CLI.

**Fix**:
- Updated `parseGitHubError` to detect "oauth app access restrictions" message (line 236)
- Now properly classified as `ORG_ACCESS_REQUIRED` error type
- Enables automatic fallback to `gh` CLI for organizations with OAuth restrictions

### 3. New Component: CloseWorktreeDialog (`src/ui/app/components/terminal/CloseWorktreeDialog.tsx`)

A production-grade React component with:

**Features**:
- Three radio options with color-coded styling:
  - **Keep worktree** (green) - Recommended default
  - **Delete worktree only** (amber) - Remove worktree, keep branch
  - **Delete worktree and branch** (red) - Complete cleanup
- Smart context-aware warnings:
  - Uncommitted changes (shows file count)
  - Unpushed commits (shows commit count)
  - Active PRs (shows PR number)
  - Protected branches (disables delete option)
  - Session running (blocks close)
  - Non-owned worktrees (shows info message)
- Expandable educational section explaining worktrees
- Full keyboard navigation (Tab, Arrow keys, Enter, Escape)
- Screen reader support with proper ARIA labels
- Smooth animations using framer-motion
- Responsive design (mobile, tablet, desktop)

**Design**:
- Dark theme matching Claude Code aesthetic
- Monospace font (IBM Plex Mono) for technical details
- Color-coded confirmation buttons matching selected option
- Staggered reveal animations on open
- Terminal-inspired visual language

### 4. Integration: MissionControl Component (`src/ui/app/components/mission/MissionControl.tsx`)

**Added**:
- Import of `CloseWorktreeDialog` component (line 24)
- State for dialog management (lines 81-83)
- `handleCloseSession` function to check worktree mode and show dialog (lines 188-195)
- `handleWorktreeDialogConfirm` function to execute close with options (lines 197-211)
- Dialog render with session data mapping (lines 1041-1074)
- Updated all three `RepoDock` instances to use `handleCloseSession` (lines 652, 1001, 1310)

**Logic**:
- When user clicks close on a session pill:
  - If session is worktree mode AND owns worktree → Show dialog
  - Otherwise → Close immediately (borrowed worktrees, non-worktree sessions)
- Dialog shows contextual information:
  - Session name, branch, worktree path
  - Git status (uncommitted/unpushed changes)
  - PR information (if active session)
  - Commits ahead of base (if active session)

## User Experience

### Before
1. User closes a session
2. Worktree is automatically deleted
3. Branch remains but worktree is gone
4. User confused about how to resume work

### After
1. User closes a worktree session
2. Dialog appears with three clear options
3. Warnings show if there are uncommitted changes or unpushed commits
4. User makes informed choice:
   - **Keep worktree**: Can resume work later by creating new session with same branch
   - **Delete worktree**: Clean up directory, branch still available for checkout
   - **Delete both**: Complete cleanup when feature is done
5. Toast notification confirms action taken

## Technical Details

### API Parameters

The `closeSession` function accepts:
```typescript
closeSession(sessionId: string, deleteBranch?: boolean, deleteWorktree?: boolean)
```

**Mappings**:
- Keep worktree: `closeSession(id, false, false)`
- Delete worktree only: `closeSession(id, false, true)`
- Delete worktree and branch: `closeSession(id, true, true)`

### Session Properties Used

```typescript
{
  id: string;
  name?: string;
  branch: string;
  worktreePath: string;
  baseBranch?: string;
  ownsWorktree?: boolean;  // Key property - only show dialog if true
  status: string;
  gitStatus?: {
    files: Array<{ status: string }>;
  };
}
```

### Edge Cases Handled

1. **Uncommitted changes**: Warning banner with file count
2. **Unpushed commits**: Warning banner with commit count
3. **Active PR**: Info banner with PR number
4. **Protected branches** (main/master/develop): Delete option disabled
5. **Session running**: Cannot close until stopped
6. **Borrowed worktrees** (`ownsWorktree = false`): Cannot delete, info message shown
7. **Non-worktree sessions**: Close immediately without dialog

## Testing Checklist

- [ ] Dialog appears when closing worktree session with `ownsWorktree = true`
- [ ] Dialog does NOT appear for non-worktree sessions
- [ ] Dialog does NOT appear for borrowed worktrees
- [ ] "Keep worktree" option preserves worktree directory
- [ ] "Delete worktree only" removes worktree, keeps branch
- [ ] "Delete worktree and branch" removes both
- [ ] Warning appears for uncommitted changes
- [ ] Warning appears for unpushed commits
- [ ] Info banner appears for active PRs
- [ ] Delete branch option disabled for protected branches
- [ ] Dialog disabled when session is running
- [ ] Keyboard navigation works (Tab, Arrow keys, Enter, Escape)
- [ ] Toast notification shows after successful close
- [ ] Educational section expands/collapses correctly
- [ ] Responsive layout works on mobile
- [ ] Screen readers announce dialog content correctly

## OAuth Restrictions Fix Testing

- [ ] In work repos with OAuth restrictions, ship-summary endpoint doesn't show 403 errors
- [ ] PR creation falls back to `gh` CLI when API is blocked
- [ ] Existing `gh` CLI authentication continues to work
- [ ] No more "OAuth App access restrictions" errors in logs when no PR exists

## Future Enhancements

1. **Fetch unpushed commits count**: Currently only available for active session
2. **Show which files are uncommitted**: Expandable list in warning banner
3. **Quick resume**: Add button in dialog to "Keep worktree and create new session"
4. **Batch operations**: Allow closing multiple sessions at once
5. **Remember user preference**: Option to "Always keep worktrees" or "Always delete"
6. **Worktree size**: Show disk space used by worktree
7. **Last activity**: Show when worktree was last modified

## Files Changed

1. `src/api/terminal-routes.ts` - Ship summary OAuth fix
2. `src/core/github-integration.ts` - PR creation OAuth fix
3. `src/ui/app/components/terminal/CloseWorktreeDialog.tsx` - New dialog component
4. `src/ui/app/components/mission/MissionControl.tsx` - Integration

## Dependencies

- `framer-motion` - Already in use, for animations
- `lucide-react` - Already in use, for icons
- `tailwindcss` - Already in use, for styling

No new dependencies added.
