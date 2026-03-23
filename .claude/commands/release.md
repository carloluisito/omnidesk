You are performing a release for the omnidesk project. The user will provide the version as $ARGUMENTS (e.g., "0.2.0" or "patch" or "minor" or "major").

Follow these steps exactly:

## 1. Determine the new version

- Read `package.json` to get the current version.
- If the user provided a semver keyword ("patch", "minor", "major"), compute the next version:
  - patch: 1.0.5 → 1.0.6
  - minor: 1.0.5 → 1.1.0
  - major: 1.0.5 → 2.0.0
- If the user provided an explicit version (e.g., "1.1.0"), use that directly.
- If no argument was provided, ask the user what version to release.

## 2. Collect changes since the last release

- Run `git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline` to get all commits since the last tag.
- If there are no commits since the last tag, stop and tell the user there's nothing to release.

## 3. Documentation check

Before proceeding, verify that user-facing documentation is up to date with the changes being released:

- Read `README.md` and check that any new CLI commands, features, configuration options, or API changes from the commits in step 2 are documented.
- Check that `CLAUDE.md` architecture section is consistent with any structural changes.
- If documentation is missing or outdated, update it now and include the changes in the release commit.
- Tell the user what documentation updates you made (if any). If everything is already documented, say so.

## 4. Update CHANGELOG.md

- Read the current `CHANGELOG.md`.
- Add a new section at the top (below the header), formatted as:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- (new features from commit log)

### Changed
- (modifications from commit log)

### Fixed
- (bug fixes from commit log)
```

- Only include sections (Added/Changed/Fixed) that have entries. Categorize commits by reading their messages:
  - `feat:` → Added
  - `fix:` → Fixed
  - `refactor:`, `perf:`, `docs:`, `ci:`, `chore:` → Changed
- Write concise, user-facing descriptions (not raw commit messages). Group related commits.
- Today's date should be used for the release date.

## 5. Bump version in package.json

- Update the `"version"` field in `package.json` to the new version.
- Do NOT run `npm version` (it creates its own commit/tag which conflicts with our flow).

## 6. Run checks

- Run `npm test` — stop if it fails.
- Run `npm run build` — stop if it fails.

If any check fails, tell the user what failed and do NOT proceed with the commit/tag/push.

## 7. Commit the release

- Stage `package.json`, `CHANGELOG.md`, and any documentation files updated in step 3 (e.g., `README.md`, `CLAUDE.md`).
- Commit with message: `release: vX.Y.Z`
- Do NOT use `--no-verify`.

## 8. Create the git tag

- Run `git tag vX.Y.Z` to create a lightweight tag on the release commit.

## 9. Push to GitHub

- Ask the user for confirmation before pushing.
- Push commits first: `git push origin main`
- Then push the tag separately: `git push origin vX.Y.Z`
- **Important**: Do NOT use `--follow-tags` — GitHub Actions may swallow the tag push event when commits and tags are pushed together, preventing the Release workflow from triggering.

## 10. Create GitHub release

- Run:
  ```
  gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(changelog_section)"
  ```
  where `changelog_section` is the new CHANGELOG section content you just wrote (the entries under `## [X.Y.Z]`, not the heading itself).

## 11. Summary

Print a summary:
- Version: X.Y.Z
- Tag: vX.Y.Z
- GitHub release URL
- Remind the user that the CI/CD pipeline will automatically build and package the Electron app once the release is created.

## Important rules

- NEVER skip the checks in step 6.
- NEVER force push.
- ALWAYS ask for confirmation before pushing (step 9).
- If anything fails, stop and report — do not try to work around failures.
