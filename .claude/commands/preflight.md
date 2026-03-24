Run the same checks that CI runs, in order, before pushing. Stop at the first failure.

This mirrors the GitHub Actions pipeline in `.github/workflows/ci.yml` exactly.

## Steps

### 1. Type check (renderer + shared)
Run: `npx tsc --noEmit`

If this fails, report the errors and stop.

### 2. Type check (main process)
Run: `npx tsc -p tsconfig.main.json --noEmit`

If this fails, report the errors and stop. This config is stricter (e.g. catches unused imports that the default tsconfig misses).

### 3. Run tests
Run: `npm test`

If any tests fail, report which tests failed and stop.

### 4. Build TypeScript (main process)
Run: `npm run build:electron`

If this fails, report and stop.

### 5. Build React app (renderer)
Run: `npm run build`

If this fails, report and stop.

## On success
Print a short summary: all checks passed, safe to push.

## On failure
- Show the exact error output
- Suggest a fix if the cause is obvious
- Do NOT proceed to subsequent steps

## Important
- Run steps sequentially — each depends on the previous passing.
- Do NOT skip any step.
- Do NOT push code — this is a read-only validation.
