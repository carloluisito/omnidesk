---
description: Interactively create a new custom Claude Code command in .claude/commands/
---

Create a new reusable custom command that can be invoked with `/<name>` in Claude Code or OmniDesk's command palette. Walk the user through providing a name, description, and instruction body — validate everything, write the Markdown file, and confirm success.

If `$ARGUMENTS` is provided, use it as the proposed command name and skip to Step 2 (gathering description and body).

---

## Background

Custom commands live as `.md` files in one of two places:

| Scope | Location | Notes |
|-------|----------|-------|
| **project** | `<project-root>/.claude/commands/<name>.md` | Git-tracked; shared with the whole team |
| **user** | `~/.claude/commands/<name>.md` | Personal; available in all your projects |

When invoked, the file's content is used as a prompt template sent to Claude. Use `$ARGUMENTS` anywhere in the body as a placeholder for runtime input (e.g., `/my-command foo bar` → `$ARGUMENTS` becomes `foo bar`).

OmniDesk watches both directories and surfaces commands in the command palette (Ctrl+Shift+P) within ~1 second of the file being written.

---

## Step 1 — Gather the command name

If `$ARGUMENTS` is non-empty, use it as the proposed name. Otherwise ask:

```
What should the command be called?
(Use kebab-case, e.g. "deploy-staging", "review-pr", "fix-types")
```

Name rules (validated in Step 4):
- Only lowercase letters, numbers, and hyphens
- Must start and end with a letter or number
- 1–60 characters after slugification
- Cannot conflict with Claude Code built-ins: `help`, `init`, `config`, `login`, `logout`, `version`, `update`

---

## Step 2 — Gather description and body

Ask for the **description** (required, 1–200 characters):

```
Short description shown in the command palette:
```

Then ask for the **instruction body** (required, non-empty):

```
Instruction body — what Claude should do when /<name> is invoked.
You can use $ARGUMENTS as a placeholder for runtime input.
(Example: "Explain this code: $ARGUMENTS")

Body:
```

If the user provides an empty value for either field, say **"That field is required."** and ask again.

---

## Step 3 — Ask for scope

```
Where should this command be saved?
  1. project  →  .claude/commands/<name>.md   (git-tracked, shared with team)  [default]
  2. user     →  ~/.claude/commands/<name>.md  (personal, all your projects)

Choice [1]:
```

Default to `project` if the user presses Enter or types `1`.

---

## Step 4 — Validate the name

### 4a. Slugify
Apply: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`

Examples:
- `"My Deploy Script"` → `"my-deploy-script"`
- `"run_tests!"` → `"run-tests"`
- `"  fix bug  "` → `"fix-bug"`

If the slug differs from what the user typed, confirm before proceeding:

```
I'll save this as /<slug> — is that OK? [y/n]
```

If the user says no, ask for a new name and restart from Step 1.

### 4b. Check forbidden names
If the slug is any of: `help`, `init`, `config`, `login`, `logout`, `version`, `update`

→ Reject: *"That name conflicts with a Claude Code built-in command. Please choose a different name."*

### 4c. Check length
- Empty after slugification → ask for a valid name
- Longer than 60 characters → ask for a shorter name, suggest the first 60 characters as a starting point

### 4d. Check for an existing file
Determine the full target path:
- Project scope: `<current_working_directory>/.claude/commands/<slug>.md`
- User scope: `~/.claude/commands/<slug>.md`

Run:
```bash
test -f "<full_target_path>" && echo "EXISTS" || echo "NEW"
```

**If EXISTS**, present this choice:

```
⚠️  A command named /<slug> already exists at:
    <full_target_path>

What would you like to do?
  1. Overwrite it with the new content
  2. Choose a different name        [default]
  3. Cancel

Choice [2]:
```

- Overwrite → continue to Step 5
- Rename → go back to Step 1
- Cancel → print *"No command was created."* and stop

---

## Step 5 — Preview and confirm

**Before writing anything**, show the user the exact content:

```
About to create: <full_target_path>

─────────────────────────────────────────
---
description: <description>
---

<body>
─────────────────────────────────────────

Proceed? [y/n]
```

If the user says no, ask what they want to change and loop back to the relevant step.

---

## Step 6 — Write the file

### 6a. Ensure the directory exists
```bash
mkdir -p "<target_directory>"
```

### 6b. Write the file
Write to `<full_target_path>` using this exact format:

```
---
description: <description>
---

<body>
```

Rules:
- The `---` frontmatter block must be the very first thing in the file
- There must be a blank line between the closing `---` and the body
- The body is written verbatim — preserve all line breaks and formatting

If the user explicitly asked for formal parameters (only prompt if they ask), extend the frontmatter:

```
---
description: <description>
parameters:
  - name: <param_name>
    description: <param_description>
    required: true
    default: <default_value_if_any>
---

<body>
```

---

## Step 7 — Verify and confirm

After writing, verify the file was created:
```bash
cat "<full_target_path>"
```

**On success**, print:

```
✅ Command /<slug> created!

  File:  <full_target_path>
  Scope: <Project | User>

  How to use it:
    Claude Code:      /<slug>
    With arguments:   /<slug> your args here
    OmniDesk palette: Ctrl+Shift+P → type /<slug>

OmniDesk will auto-detect the new command within ~1 second.
For standalone Claude Code CLI, the command is available immediately.
```

**On failure** (file missing or content mismatch), report the error and provide the content for manual creation:

```
❌ Failed to write the file.
Error: <error message>

You can create it manually by saving this content to:
  <full_target_path>

---
description: <description>
---

<body>
```

---

## Edge case reference

| Situation | Action |
|-----------|--------|
| Name has uppercase letters | Auto-lowercase, show result, ask confirmation |
| Name has spaces or special chars | Slugify, show result, ask confirmation |
| Slug is empty after slugification | Ask for a valid name (letters/numbers required) |
| Slug exceeds 60 characters | Ask for a shorter name; suggest first 60 characters |
| Slug matches a built-in command | Reject; suggest a prefixed alternative (e.g., `my-config` instead of `config`) |
| Empty description | Re-prompt: *"Description is required"* |
| Empty body | Re-prompt: *"Instruction body cannot be empty"* |
| File already exists | Offer overwrite / rename / cancel; default rename (safer) |
| `.claude/commands/` directory missing | Create automatically with `mkdir -p` |
| `~/.claude/commands/` directory missing | Create automatically with `mkdir -p` |
| Body starts with `---` on the first line | Warn: may confuse frontmatter parsers; suggest wrapping in a heading |
| User cancels at any point | Print *"No command was created."* and stop |
| Write permission denied | Report the error and full path; show content for manual creation |

---

## Important rules

- **Never write outside** `.claude/commands/` (project) or `~/.claude/commands/` (user). Do not accept arbitrary paths.
- **Always show the preview** before writing and wait for explicit confirmation.
- **Always confirm slug transformations** with the user before proceeding.
- If you cannot determine the current working directory (for project scope), use `pwd` to find it.
