# Doc Drift + CLAUDE.md Audit

> Read-only audit of docs vs. code. Every finding cites the doc claim and the code reality with `file:line`. Use the checkboxes as a work list.

## Resolution (applied 2026-07-07)
All findings below have been applied, **except** the `CHANGELOG.md` item, which was a **false positive** (the file exists — see the corrected entry). Real test count confirmed via `npm test`: **393 tests across 33 files** (badge was already correct; the stale `334`/`25 files` figures were fixed in README, CONTRIBUTING, and repo-index). `CODE_OF_CONDUCT.md` created (Contributor Covenant 2.1). Decisions taken per user: authored `CODE_OF_CONDUCT.md`; kept the `tsc --strict` claim (verified `tsconfig.json:14`) and only removed the phantom `lint`/`format` commands rather than adding a linter.

## Summary
The docs are broadly aligned with the code on the big structural claims — the **103 IPC methods** figure (`docs/repo-index.md:3` vs `src/shared/ipc-contract.ts` = 103 `Contract<'…'>` entries), the config-dir/credentials paths, the shell layout, and the CI workflow all check out. The drift is concentrated in **counts and cross-references**: the test count is quoted three different ways (393 / 334 / "25 files") and the real number is neither; two referenced repo files (`CODE_OF_CONDUCT.md`, `CHANGELOG.md`) don't exist; CONTRIBUTING tells contributors to run `npm run lint`/`npm run format`, which aren't defined. `CLAUDE.md` is high-quality and mostly current — it needs a handful of edits (manager count, a couple of new files/dirs, and the Ctrl+C nuance from shell sessions), not a rewrite. **Verdict: exists and needs edits.**

## Drift findings (worst first)

### Critical (breaks setup, build, or a documented feature)
- None. Documented setup (`npm install`, `npm run electron:dev`, `npm run package`) matches real scripts (`package.json:12-21`).

### High (misleads a developer, wastes real time)
- [x] **CONTRIBUTING documents lint/format scripts that don't exist**
  - Doc says: `npm run lint` and `npm run format` (`CONTRIBUTING.md:108-112`); also "All code must pass `tsc --strict`" (`CONTRIBUTING.md:159`)
  - Code does: `package.json` scripts contain no `lint`, `format`, `eslint`, or `prettier` entry (`package.json:10-29`; grep = 0 matches)
  - Fix: Remove the lint/format commands or add the scripts; either way stop instructing contributors to run non-existent commands.

- [x] **Dead links to `CODE_OF_CONDUCT.md` (file absent)**
  - Doc says: "read our [Code of Conduct](CODE_OF_CONDUCT.md)" (`README.md:276`); "adheres to a [Code of Conduct](CODE_OF_CONDUCT.md)" (`CONTRIBUTING.md:21`)
  - Code does: no `CODE_OF_CONDUCT.md` at repo root (root `*.md` listing shows only `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md` + scratch docs)
  - Fix: Add the file or remove the links.

- [x] ~~**Dead references to `CHANGELOG.md` (file absent)**~~ — **WITHDRAWN (false positive).** `CHANGELOG.md` exists, is tracked, and is well-maintained (`git ls-files` confirms it). The original audit glob missed it (the `**/*.md` listing truncated at 100 results, dominated by `node_modules`). The `CONTRIBUTING.md:277,442,445` references are valid. Separate minor fix applied: the CHANGELOG's own footer compare-links stopped at `[2.0.0]` — added `[2.0.1]`/`[2.1.0]`/`[2.1.1]` and repointed `[Unreleased]` to `v2.1.1` (`CHANGELOG.md:557-583`).

- [x] **Test count is quoted three inconsistent ways and all are stale**
  - Doc says: badge "tests-393 passing" (`README.md:6`); "Vitest 4 (334 tests)" (`README.md:191`); "Run all 334 tests" (`README.md:239`); "334 tests across 25 test files" (`CONTRIBUTING.md:225`); "334 tests + 6 e2e specs" (`docs/repo-index.md:3`)
  - Code does: **33** unit/integration test files exist (glob `src/**/*.test.{ts,tsx}`), not 25; the exact passing-test total can't be read statically (see "Could not verify")
  - Fix: Pick one source of truth, regenerate the number from a real run, and reconcile the badge with the body.

### Medium (stale but not blocking)
- [x] **`repo-index.md` test tables omit 8 test files that now exist**
  - Doc says: unit/integration/component tables enumerate 25 files (`docs/repo-index.md:216-251`)
  - Code does: also present but undocumented — `src/main/cli-manager.test.ts`, `src/main/path-access.test.ts`, `src/shared/session-kind.test.ts`, `src/renderer/components/shell/shell-utils.test.ts`, `src/renderer/components/shell/NewSessionSheet.test.tsx`, `src/renderer/components/shell/NonGitFolderDialog.test.tsx`, `src/renderer/terminal/kitty-keyboard.test.ts`, `src/renderer/terminal/shell-key-rules.test.ts`
  - Fix: Regenerate the test tables (or replace them with a "run `npm test` for current counts" note to avoid perpetual staleness).

- [x] **`src/renderer/terminal/` (Kitty protocol + shell key rules) is undocumented in repo-index**
  - Doc says: repo-index Shared/Renderer sections list no `terminal/` directory (`docs/repo-index.md:184-199`)
  - Code does: `src/renderer/terminal/kitty-keyboard.ts` and `src/renderer/terminal/shell-key-rules.ts` exist and back a shipped feature (README documents Kitty protocol at `README.md:96`; commit `8a82279`)
  - Fix: Add a `terminal/` row to repo-index.

- [x] **`NonGitFolderDialog.tsx` missing from shell inventories**
  - Doc says: shell component list in `CLAUDE.md` Domain Map (Shell row) and `docs/repo-index.md:32-49` — neither lists it
  - Code does: `src/renderer/components/shell/NonGitFolderDialog.tsx` exists (backs README's "offers to initialize git", `README.md:78`)
  - Fix: Add it to both lists.

- [x] **CLAUDE.md Ctrl+C pattern states the old absolute behavior**
  - Doc says: "Ctrl+C interception: Caught in `terminal.onData()`, shows `ConfirmDialog`. Never forward `\x03` to Claude" (`CLAUDE.md`, Critical Implementation Patterns)
  - Code does: behavior is now conditional — plain shell sessions pass Ctrl+C through: "sessions let Ctrl+C pass through to interrupt the running command" (`src/renderer/components/Terminal.tsx:413-416`). README already reflects this (`README.md:95`)
  - Fix: Add the shell-session pass-through caveat to the CLAUDE.md pattern.

### Low (cosmetic, wording, minor gaps)
- [x] **Manager count: CLAUDE.md says ~8, everything else says ~7**
  - Doc says: "~8 managers" (`CLAUDE.md`, architecture diagram) vs "~7 managers" (`README.md:202`, `CONTRIBUTING.md:119`, `docs/repo-index.md:9`)
  - Code does: `index.ts` instantiates 7 (`SettingsManager`, `HistoryManager`, `CheckpointManager`, `SessionPool`, `SessionManager`, `GitManager`, `ProviderRegistry`) (`src/main/index.ts:167-201`)
  - Fix: Change CLAUDE.md's "~8" to "~7".

- [x] **CONTRIBUTING PowerShell tip contradicts actual newline handling**
  - Doc says: "PowerShell line endings - Use `\r`, not `\n`" (`CONTRIBUTING.md:436`)
  - Code does: newline insertion sends `\n` (`src/renderer/components/Terminal.tsx:403`, `onInput(sessionId, '\n')`)
  - Fix: Remove or clarify the tip; it reads as a codebase convention but isn't one.

- [x] **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is injected in two places, not just ClaudeProvider**
  - Doc says: "injected by `ClaudeProvider` … the only surviving part of the agent-teams feature" (`CLAUDE.md`, Agent teams CLI capability)
  - Code does: set in `src/main/providers/claude-provider.ts:120` **and** `src/main/cli-manager.ts:334`
  - Fix: Note both injection points (or dedupe in code — a code-quality item, out of audit scope).

## CLAUDE.md
- Verdict: **exists and needs edits** (accurate and genuinely useful — correct build/test commands, real IPC-contract mechanics, good pitfalls; the drift is small and localized).
- [ ] Change "~8 managers" → "~7 managers" in the architecture diagram (matches `src/main/index.ts:167-201`).
- [ ] Add `NonGitFolderDialog` to the Shell row of the Domain Map.
- [ ] Add the `src/renderer/terminal/` directory (Kitty keyboard protocol + shell key rules) to the Domain Map / Critical Implementation Patterns — it's a shipped feature with tests but absent from CLAUDE.md.
- [ ] Update the "Ctrl+C interception" pattern to note plain shell sessions pass `\x03` through (`Terminal.tsx:413-416`), so the "Never forward `\x03`" rule is scoped to agent/Claude sessions.
- [ ] Note that `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is also set in `cli-manager.ts:334`, not only `ClaudeProvider`.
- Leave as-is (verified correct): 103 IPC methods, provider abstraction, launch-mode picker, agent-view availability probe, config-dir migration (`~/.claudedesk` → `~/.omnidesk`), session pool, output buffering.

## Could not verify statically
- ~~**Exact passing test total (393 vs 334):**~~ **RESOLVED** — `npm test` reports 393 passed across 33 files; docs reconciled to 393/33.
- **"All code must pass `tsc --strict`" (`CONTRIBUTING.md:159`):** confirm with `npx tsc --noEmit -p tsconfig.json` and check `"strict"` in `tsconfig.json`.
- **README badge "393 passing" accuracy:** same as above — the badge is hand-maintained, so it's only as current as the last manual edit.

## Suggested fix order
1. **Missing referenced files** — add or delink `CODE_OF_CONDUCT.md` and `CHANGELOG.md` (broken links hurt every new contributor). *Human decision:* whether to author these files or remove the references.
2. **CONTRIBUTING lint/format** — delete the phantom commands or add real `lint`/`format` scripts. *Human decision:* adopt ESLint/Prettier vs. just remove the claim.
3. **Reconcile the test count** — run the suite, set one number, fix the README badge/body + CONTRIBUTING + repo-index; consider replacing hard counts with "run `npm test`".
4. **repo-index refresh** — add the 8 missing test files, the `terminal/` dir, and `NonGitFolderDialog`.
5. **CLAUDE.md edits** — the 5 checkboxes above (all mechanical, no human decision needed).
6. **Low-severity wording** — manager count in CLAUDE.md, PowerShell `\r` tip, agent-teams env-var note.

---

## Addendum: README ↔ code feature audit (applied 2026-07-08)

Second pass — verify every README feature/shortcut claim against the actually-mounted code (static, no app run). Most claims verified accurate (shortcuts `App.tsx:382-402`; links `Terminal.tsx:362-367`; Kitty `Terminal.tsx:379,600-603`; inspector fields `RightInspector.tsx:51-77`; provider auto-detect `claude-provider.ts:51-54` / `codex-provider.ts:32-35`; packaging `electron-builder.yml:5,20-46`). Three drifts found and fixed:

- [x] **Privacy claim understated network calls** — README said "the only network calls are to Anthropic's API." Reworded to include GitHub update checks (`ipc-handlers.ts:674-682`, `electron-builder.yml:48-51`) and git remotes (`git-manager.ts:675`). "No telemetry" verified (no analytics endpoints found).
- [x] **Provider selector claim overstated** — README said the selector is "shown automatically when more than one provider is available," but `NewSessionSheet.tsx:483-505` renders a hardcoded, unconditional Claude/Codex toggle and never consults provider availability. Reworded README to match actual behavior (doc fix, not code change). **Latent code gap for later:** the new-session UI ignores the registry's `provider:available` detection — gating the toggle on `useProvider` availability would be the "intended" behavior.
- [x] **CLAUDE.md Design Language hexes stale** — claimed `bg #0D0E14` / `border #292E44`; actual is `--surface-base: #0A0B11` (`tokens.css:9`) and `rgba(255,255,255,0.035–0.12)` borders (`tokens.css:35-37`). Accent/danger were correct. Fixed.

**Not statically verifiable:** runtime rendering/visual correctness (needs the app running); README "macOS 10.13+" / "Linux libxtst6/libnss3" (Electron 28 runtime facts, confirm against Electron's support matrix).
