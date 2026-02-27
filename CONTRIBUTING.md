# Contributing to OmniDesk

Thank you for your interest in contributing to OmniDesk! We welcome contributions from the community and appreciate your help in making this project better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Development Workflow](#development-workflow)

---

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to carlo.adap@hotmail.com.

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title** - Describe the issue concisely
- **Detailed description** - What happened vs. what you expected
- **Steps to reproduce** - Numbered list of steps to trigger the bug
- **Environment** - OS version, Node.js version, OmniDesk version
- **Screenshots** - If applicable, add screenshots to illustrate the problem
- **Logs** - Include relevant console output or error messages

**Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)** when available.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear title** - Describe the enhancement
- **Provide detailed explanation** - Why is this enhancement useful?
- **Describe current behavior** - What happens now?
- **Describe desired behavior** - What should happen instead?
- **Include mockups** - If UI-related, sketch or describe the design

**Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)** when available.

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `documentation` - Improvements or additions to docs
- `bug` - Something isn't working

---

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Git** for version control
- **Claude Code CLI** installed globally (`npm install -g @anthropic-ai/claude-code`)
- **Code editor** - We recommend VS Code with TypeScript/ESLint extensions

### Initial Setup

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/claudedesk.git
cd claudedesk

# 3. Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/claudedesk.git

# 4. Install dependencies
npm install

# 5. Run in development mode
npm run electron:dev
```

### Development Commands

```bash
# Start development server with hot reload
npm run electron:dev

# Build TypeScript (main process)
npm run build:electron

# Build renderer (React app)
npm run build

# Package for current platform
npm run package

# Run tests (when available)
npm test

# Lint code
npm run lint

# Format code (if configured)
npm run format
```

---

## Project Architecture

OmniDesk is an Electron application with three main layers and 16 domain managers:

### Main Process (`src/main/`)
- **index.ts** - App lifecycle, window management
- **cli-manager.ts** - PTY spawning, provider-aware CLI interaction
- **session-manager.ts** - Session state management
- **ipc-handlers.ts** - IPC communication handlers (~191 methods)
- **quota-service.ts** - Anthropic API integration
- **sharing-manager.ts** - Real-time session sharing via WebSocket relay
- **providers/** - Pluggable CLI provider abstraction (Claude, Codex, etc.)
- **\*-persistence.ts** - File-based state persistence

### Preload (`src/preload/`)
- **index.ts** - Context bridge exposing APIs to renderer

### Renderer (`src/renderer/`)
- **components/** - React components (Terminal, TabBar, etc.)
- **hooks/** - Custom React hooks (useSessionManager, etc.)
- **utils/** - Utility functions (fuzzy search, variable resolution)

### Shared (`src/shared/`)
- **ipc-types.ts** - TypeScript contracts for IPC communication
- **types/** - Shared type definitions

**Key architectural principles:**
- Strict TypeScript - No `any` types
- Functional React components with hooks (no classes)
- IPC communication via typed contracts
- Separation of concerns (main handles I/O, renderer handles UI)

---

## Coding Standards

### TypeScript

- **Strict mode enabled** - All code must pass `tsc --strict`
- **Explicit types** - Avoid `any`, use proper types
- **Interfaces over types** - Use `interface` for object shapes
- **Named exports** - Prefer named exports over default exports

### React

- **Functional components** - No class components
- **Hooks** - Use hooks for state and effects
- **Component naming** - PascalCase (e.g., `Terminal.tsx`)
- **Props interfaces** - Define props as interfaces, not inline
- **No prop drilling** - Use context or hooks for deep state

### File Naming

- **Components**: `PascalCase.tsx` (e.g., `CommandPalette.tsx`)
- **Hooks**: `useCamelCase.ts` (e.g., `useSessionManager.ts`)
- **Utilities**: `kebab-case.ts` (e.g., `fuzzy-search.ts`)
- **Types**: `PascalCase.ts` or `kebab-case.ts` (e.g., `ipc-types.ts`)

### Code Style

```typescript
// ✅ Good
interface SessionProps {
  sessionId: string;
  onClose: () => void;
}

export function Session({ sessionId, onClose }: SessionProps) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Effect logic
  }, [sessionId]);

  return <div>...</div>;
}

// ❌ Bad
export default function Session(props: any) {
  const [isActive, setIsActive] = React.useState(false);
  return <div>...</div>;
}
```

### IPC Communication

Always use typed IPC contracts from `src/shared/ipc-types.ts`:

```typescript
// Main process
ipcMain.handle('session:create', async (_, name: string, dir: string) => {
  // Implementation
});

// Renderer
await window.electronAPI.createSession(name, dir);
```

---

## Testing Guidelines

### Current State

OmniDesk has **475+ tests across 24+ test files**, using Vitest 4 with 3 workspace projects:

| Project | Environment | Pattern |
|---------|-------------|---------|
| `shared` | node | `src/shared/**/*.test.ts` |
| `main` | node | `src/main/**/*.test.ts` |
| `renderer` | jsdom | `src/renderer/**/*.test.{ts,tsx}` |

### Running Tests

```bash
npm test                    # All unit + integration tests
npm run test:unit           # shared + main only
npm run test:integration    # renderer only (jsdom)
npm run test:e2e            # Playwright E2E (requires built app)
npm run test:coverage       # With coverage report
```

### Writing Tests

- Place test files next to the source file (e.g., `foo.test.ts` alongside `foo.ts`)
- Use `test/helpers/electron-api-mock.ts` for renderer tests — auto-derives `window.electronAPI` from the IPC contract
- Main process tests use `test/setup-main.ts` which mocks `electron` and `node-pty`
- All test scripts use `--config vitest.workspace.ts` explicitly

```typescript
// Example unit test
describe('fuzzySearch', () => {
  it('should match exact string', () => {
    const result = fuzzySearch('hello', ['hello', 'world']);
    expect(result).toContain('hello');
  });
});
```

---

## Pull Request Process

### Before Submitting

1. **Fork and create a branch** - Use descriptive branch names:
   - `feature/add-vim-mode`
   - `fix/terminal-crash`
   - `docs/update-readme`

2. **Follow coding standards** - Match existing code style

3. **Test your changes** - Manually test affected functionality

4. **Update documentation** - If you change behavior, update README/docs

5. **Add changelog entry** - Update CHANGELOG.md under `[Unreleased]`

### PR Guidelines

1. **Create PR from your fork** to the main repository's `main` branch

2. **Fill out PR template** - Provide:
   - Description of changes
   - Related issue number (if applicable)
   - Testing performed
   - Screenshots (if UI changes)

3. **Keep PRs focused** - One feature/fix per PR

4. **Respond to feedback** - Address review comments promptly

5. **Ensure CI passes** - Once CI is set up, all checks must pass

### Keeping the Atlas Current

If your PR adds, removes, or renames source files:
- Update `docs/repo-index.md` with the new file(s)
- If a new domain is introduced, add it to the Domain Map in `CLAUDE.md`

### PR Title Format

Use conventional commit style:

- `feat: Add vim mode support`
- `fix: Resolve terminal crash on resize`
- `docs: Update installation instructions`
- `refactor: Simplify session manager logic`
- `test: Add tests for fuzzy search`
- `chore: Update dependencies`

### Review Process

1. **Maintainer review** - PRs will be reviewed within 3-5 days
2. **Feedback cycle** - Address comments and push updates
3. **Approval required** - At least one maintainer approval needed
4. **Merge** - Maintainer will merge once approved

---

## Issue Reporting

### Bug Reports

Use the bug report template and include:
- OS and version (Windows 11, macOS 13.5, Ubuntu 22.04, etc.)
- Node.js version (`node --version`)
- OmniDesk version
- Steps to reproduce
- Expected vs. actual behavior
- Error messages or logs

### Feature Requests

Use the feature request template and include:
- Problem statement - What problem does this solve?
- Proposed solution - How should it work?
- Alternatives considered - What other approaches did you think about?
- Additional context - Screenshots, mockups, examples

### Questions and Support

For general questions:
- Check existing issues and README first
- Open a Discussion (not an Issue) for Q&A
- Be specific about what you're trying to achieve

---

## Development Workflow

### Typical Development Cycle

```bash
# 1. Sync with upstream
git checkout main
git pull upstream main

# 2. Create feature branch
git checkout -b feature/my-feature

# 3. Make changes and test
npm run electron:dev
# ...make changes...
# ...test changes...

# 4. Commit changes
git add .
git commit -m "feat: add my feature"

# 5. Push to your fork
git push origin feature/my-feature

# 6. Create Pull Request on GitHub
```

### Commit Message Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style changes (formatting, no logic change)
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `test` - Adding or updating tests
- `chore` - Maintenance tasks (deps, config, etc.)

**Examples:**
```
feat(terminal): add vim mode support

Implements basic vim mode with insert and normal modes.
Supports common navigation commands (hjkl, w, b).

Closes #123
```

```
fix(session): prevent crash on directory change

Fixed issue where changing directory in locked session
would crash the app instead of showing error message.

Fixes #456
```

---

## Development Tips

### Debugging

- **Main process**: Use VS Code debugger or `console.log` (shows in terminal)
- **Renderer**: Use Chrome DevTools (open with `Ctrl+Shift+I` in dev mode)
- **IPC**: Add logging in `ipc-handlers.ts` to trace communication

### Hot Reload

`npm run electron:dev` supports hot reload for renderer code, but **not** for main process. Restart the app after changing main process code.

### Common Pitfalls

1. **Don't use Node.js APIs in renderer** - Use IPC to communicate with main process
2. **Don't forget to clean up** - Remove event listeners in `useEffect` cleanup
3. **Escape Windows paths** - Use `.replace(/\\/g, '\\\\')` for PowerShell
4. **PowerShell line endings** - Use `\r`, not `\n`

---

## Recognition

Contributors will be recognized in:
- GitHub Contributors page
- CHANGELOG.md for significant contributions
- Release notes

---

## Questions?

- **General questions**: Open a Discussion
- **Bug reports**: Open an Issue
- **Feature ideas**: Open an Issue or Discussion
- **Security issues**: See [SECURITY.md](SECURITY.md)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to OmniDesk! 🎉
