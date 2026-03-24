Ship the current changes: create a branch, run preflight checks, commit, and push.

The user may provide a branch name or description as $ARGUMENTS. If not provided, infer from the changes.

## Steps

### 1. Check working state
- Run `git status` to see what's changed.
- If there are no changes, stop and tell the user.
- Run `git diff --stat` to summarize the changes.

### 2. Create or confirm branch
- If already on a feature branch (not `main`), stay on it.
- If on `main`, create a new branch:
  - If $ARGUMENTS is provided, use it to derive the branch name (e.g. "fix login bug" -> `fix/login-bug`).
  - If not provided, infer from the changed files and diff content.
  - Use conventional prefixes: `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`, `test/`.
- Confirm the branch name with the user before creating it.

### 3. Run preflight checks
Run these in order, stopping at first failure:

1. `npx tsc --noEmit` (renderer + shared type check)
2. `npx tsc -p tsconfig.main.json --noEmit` (main process type check — stricter)
3. `npm test` (all unit + integration tests)

If any check fails:
- Show the errors
- Suggest fixes if obvious
- Do NOT proceed to commit/push
- Ask the user if they want you to fix the issues

### 4. Stage and commit
- Stage only the relevant changed files (prefer specific files over `git add -A`).
- Do NOT stage files that look like secrets, local config, or build artifacts.
- Draft a commit message following the project's conventional commit style (check recent `git log --oneline -10`).
- Show the user the proposed commit message and staged files.
- Commit after user confirms (or immediately if changes are straightforward).

### 5. Push
- Push with `-u origin <branch>` to set upstream.
- Show the user the remote URL for creating a PR if this is a new branch.

## Important
- NEVER force push.
- NEVER push to `main` directly.
- NEVER skip the preflight checks.
- ALWAYS confirm branch name with the user if creating a new one.
- If preflight fails, help fix the issues rather than skipping checks.
