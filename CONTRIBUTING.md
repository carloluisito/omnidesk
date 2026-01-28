# Contributing to ClaudeDesk

Welcome! We appreciate your interest in contributing to ClaudeDesk. This guide will help you get set up and familiar with our development workflow.

## Development Setup

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- **Claude Code CLI** ([Install Guide](https://docs.anthropic.com/en/docs/claude-cli)) - Required for terminal features

### Getting Started

```bash
# Clone the repository
git clone https://github.com/carloluisito/claudedesk.git
cd claudedesk

# Install dependencies
npm install

# Start development servers
npm run dev
```

This runs both the Express backend and Vite frontend concurrently:
- **Backend**: Express server on http://localhost:8787
- **Frontend**: Vite dev server on http://localhost:5173 (proxies API requests to backend)

### Running Separately

```bash
# Backend only (with hot reload)
npm run dev:server

# Frontend only (Vite)
npm run dev:client
```

### Building for Production

```bash
# Build both server and client
npm run build

# Start production server
npm start
```

### Testing the CLI

The CLI entry point (`src/cli.ts`) is the primary way users run ClaudeDesk in production. To test it locally:

```bash
# Build TypeScript first
npm run build:server

# Test CLI help and version
node dist/cli.js --help
node dist/cli.js --version

# Test with custom options
node dist/cli.js --port 3000
node dist/cli.js --data-dir ./test-data --skip-wizard

# Test as npm package (creates global symlink)
npm link
claudedesk --help
claudedesk --port 9000

# Unlink when done
npm unlink -g claudedesk
```

**Note:** The CLI creates a data directory at `~/.claudedesk` (or `%APPDATA%\claudedesk` on Windows) on first run. Use `--data-dir` to specify a test directory to avoid polluting your real config.

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
claudedesk/
  src/
    cli.ts                # CLI entry point (npm package binary)
    index.ts              # Express server (exports startServer())
    types.ts              # Shared TypeScript types
    api/                  # Express routes
      routes.ts           # Main API routes
      middleware.ts       # Auth, rate limiting
      terminal-routes.ts  # Terminal/Claude session endpoints
      app-routes.ts       # App management endpoints
      settings-routes.ts  # Settings endpoints
      workspace-routes.ts # Workspace endpoints
      agent-routes.ts     # Agent management endpoints
      tunnel-routes.ts    # Remote tunnel control endpoints
      mcp-routes.ts       # MCP server management endpoints
      docker-routes.ts    # Docker environment endpoints
      skill-routes.ts     # Custom skill endpoints
      pin-auth.ts         # PIN-based authentication
    core/                 # Core backend modules
      claude-invoker.ts   # Claude CLI integration
      terminal-session.ts # Terminal session management
      git-sandbox.ts      # Git branch isolation
      process-runner.ts   # Command execution
      tunnel-manager.ts   # Cloudflare tunnel management
      ws-manager.ts       # WebSocket management
    config/               # Configuration management
      settings.ts         # App settings
      repos.ts            # Repository configuration
      workspaces.ts       # Workspace configuration
    ui/app/               # React frontend (Vite)
      App.tsx             # Root component
      main.tsx            # Entry point
      screens/            # Route pages
      components/         # Reusable UI components
      store/              # Zustand state stores
      hooks/              # Custom React hooks
      lib/                # Utilities and helpers
      types/              # Frontend TypeScript types
  config/                 # Runtime configuration files
    repos.json            # Repository definitions
    settings.json         # App settings
  dist/                   # Build output
```

## Code Style

### TypeScript

- **Strict mode** is enabled - avoid `any` types where possible
- Use explicit return types for functions
- Prefer interfaces over type aliases for object shapes
- Use ES modules (`import`/`export`)

### React Components

- Use **functional components** with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks (`src/ui/app/hooks/`)
- Use TypeScript for all component props

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
```

### State Management

- Use **Zustand** for global state (`src/ui/app/store/`)
- Keep stores focused on specific domains (app, terminal, theme)
- Use the `persist` middleware for state that should survive page refreshes

### Styling

- Use **Tailwind CSS** for all styling
- Use the `cn()` utility from `lib/cn.ts` for conditional classes
- Follow mobile-first responsive design
- Dark theme is the default

```tsx
import { cn } from '@/lib/cn';

<div className={cn(
  'p-4 rounded-lg',
  isActive && 'bg-blue-500',
  'hover:bg-gray-700'
)} />
```

### File Naming

- React components: `PascalCase.tsx` (e.g., `Button.tsx`, `MissionControl.tsx`)
- Hooks: `camelCase.ts` prefixed with `use` (e.g., `useTerminal.ts`)
- Utilities and stores: `camelCase.ts` (e.g., `appStore.ts`, `api.ts`, `cn.ts`)
- Types: `camelCase.ts` or grouped in `types/index.ts`

## Making Changes

### 1. Fork and Clone

```bash
# Fork via GitHub UI, then:
git clone https://github.com/carloluisito/claudedesk.git
cd claudedesk
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 3. Make Your Changes

- Follow the code style guidelines above
- Add tests for new functionality when applicable
- Update documentation if needed

### 4. Test Locally

```bash
# Run the test suite
npm test

# Start dev servers and test manually
npm run dev
```

### 5. Commit Your Changes

Write clear, concise commit messages:

```bash
git commit -m "Add keyboard shortcuts to terminal input"
git commit -m "Fix session persistence on page refresh"
```

### 6. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:
- A clear title describing the change
- Description of what changed and why
- Screenshots for UI changes
- Link to related issues (if any)

## Good First Issues

Looking for a place to start? Check out issues labeled [`good first issue`](https://github.com/carloluisito/claudedesk/labels/good%20first%20issue). These are smaller, well-scoped tasks ideal for first-time contributors.

## Code Review Process

After submitting a PR:

1. **Automated checks** run (linting, tests, build)
2. A maintainer will review your code
3. Address any feedback or requested changes
4. Once approved, your PR will be merged

Reviews typically focus on:
- Code correctness and functionality
- Adherence to project conventions
- Test coverage for new features
- Clear and maintainable code

## Questions?

If you have questions or need help:
- Open a [GitHub Discussion](https://github.com/carloluisito/claudedesk/discussions)
- Check existing issues for similar questions
- Review the [README](README.md) and [SETUP](SETUP.md) guides

Thank you for contributing!
