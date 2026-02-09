# ClaudeDesk

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
![Version](https://img.shields.io/badge/version-4.1.1-green.svg)

> A powerful desktop terminal for Claude Code CLI with multi-session management, split-view layouts, and advanced productivity features.

**ClaudeDesk** is an Electron-based desktop application that wraps the Claude Code CLI in a feature-rich terminal interface. Manage multiple Claude sessions simultaneously, organize your workspace with split views, use prompt templates, and monitor your API usage—all in one beautiful desktop app.

---

## 📸 Screenshots

<!-- TODO: Add screenshots here -->
<!-- Suggested screenshots:
1. Main interface showing multi-session tabs
2. Split-view with multiple terminal panes
3. Command palette with prompt templates
4. Settings dialog with quota monitoring
-->

_Screenshots coming soon! For now, see [Features](#-features) for a detailed overview._

---

## ✨ Features

### Multi-Session Management
- **Multiple Claude sessions** in tabbed interface
- **Session persistence** - resume sessions after app restart
- **Named sessions** for better organization
- **Session history** - search and export conversation logs
- **Checkpoints** - save and restore session states

### Split-View Terminal
- **Split screen** support with up to 4 terminal panes
- **Flexible layouts** - horizontal and vertical splits
- **Drag-and-drop** session assignment to panes
- **Independent sessions** per pane

### Directory Locking
- **Lock sessions** to their creation directory
- **Prevents accidental directory changes** in Claude sessions
- **Workspace support** - save favorite directories for quick access
- **Per-session working directories**

### Prompt Templates & Command Palette
- **Keyboard shortcut** (`Ctrl/Cmd+Shift+P`) to launch command palette
- **Prompt template library** for common tasks
- **Variable substitution** - `{{clipboard}}`, `{{currentDir}}`, `{{selection}}`, etc.
- **Custom templates** - create and edit your own
- **Fuzzy search** for quick template access

### API Quota Monitoring
- **Real-time quota display** - see your Claude API usage at a glance
- **Burn rate tracking** - monitor spending over time
- **Budget alerts** - get notified when approaching limits
- **Session-level tracking** (optional)

### Terminal Features
- **Full xterm.js terminal** with rich text formatting
- **Clickable links** - URLs automatically detected
- **Copy/paste support** with keyboard shortcuts
- **Search** within terminal output
- **Custom theme** - Tokyo Night inspired dark theme
- **Monospace font** - JetBrains Mono for optimal readability

### Session Control
- **Permission modes** - control Claude's access level per session
- **Ctrl+C handling** - graceful session termination with confirmation
- **Session export** - save conversations to markdown
- **Session search** - find past conversations

---

## 🚀 Why ClaudeDesk?

While Claude Code CLI is powerful, managing multiple sessions, switching contexts, and organizing prompts becomes unwieldy in a terminal. ClaudeDesk solves this by adding:

✅ **Multi-session management** - Run multiple Claude conversations in tabs
✅ **Directory locking** - Each session stays in its project directory
✅ **Prompt library** - Reusable templates for common tasks
✅ **Quota monitoring** - See your API usage at a glance
✅ **Split view** - Work on multiple projects side-by-side
✅ **Persistent state** - Never lose your session history

---

## 📋 Prerequisites

Before installing ClaudeDesk, ensure you have:

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Claude Code CLI** - Install via:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
   Or follow the [official installation guide](https://claude.ai/claude-code)
3. **Claude API credentials** - ClaudeDesk reads from `~/.claude/.credentials.json` (set up by Claude CLI)

---

## 💻 Installation

### Option 1: Download Pre-built Binary (Recommended)

**Coming soon!** Download the latest release for your platform from the [Releases](https://github.com/carloluisito/claudedesk/releases) page.

- **Windows**: `ClaudeDesk-Setup-1.0.0.exe`
- **macOS**: `ClaudeDesk-1.0.0.dmg`
- **Linux**: `ClaudeDesk-1.0.0.AppImage` or `.deb`

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/carloluisito/claudedesk.git
cd claudedesk

# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Or build for production
npm run package
```

**Build for specific platforms:**
```bash
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

Built packages will be in the `release/` directory.

---

## 🎯 Quick Start

1. **Launch ClaudeDesk** from your applications menu or run `npm run electron:dev`

2. **Create your first session:**
   - Click "New Session" or press `Ctrl/Cmd+N`
   - Name your session (e.g., "My Project")
   - Select working directory
   - Choose permission mode (Ask, Auto-approve, or Auto-deny)

3. **Start using Claude:**
   - Type your prompt in the terminal
   - Claude responds just like the CLI
   - Your session is automatically saved

4. **Try the command palette:**
   - Press `Ctrl/Cmd+Shift+P`
   - Browse or search prompt templates
   - Select a template to insert it

5. **Enable split view:**
   - Click the split view icon in the header
   - Create multiple panes for parallel work
   - Drag sessions between panes

---

## 🎨 Key Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+N` | New Session |
| `Ctrl/Cmd+W` | Close Current Session |
| `Ctrl/Cmd+Tab` | Next Session Tab |
| `Ctrl/Cmd+Shift+Tab` | Previous Session Tab |
| `Ctrl/Cmd+Shift+P` | Open Command Palette |
| `Ctrl/Cmd+F` | Search in Terminal |
| `Ctrl/Cmd+,` | Open Settings |
| `Ctrl+C` | Session Termination Dialog |

---

## 🔒 Privacy & Security

ClaudeDesk is designed with privacy in mind:

- **Local-first**: All session data stored on your machine
- **No telemetry**: We don't collect or transmit usage data
- **No third-party services**: Only communicates with Anthropic's official API
- **Credential security**: Reads Claude CLI credentials locally, never logs or stores them
- **HTTPS only**: All API calls use secure connections

### Credentials Handling

ClaudeDesk reads Claude Code CLI credentials from `~/.claude/.credentials.json` to:
- Display API quota usage
- Monitor burn rate
- Provide session management features

**Your credentials are:**
- ✅ Read locally only
- ✅ Never logged or stored by ClaudeDesk
- ✅ Only sent to Anthropic's official API endpoints (api.anthropic.com)
- ✅ Transmitted over HTTPS

You can disable quota monitoring in Settings if you prefer.

For more details, see [SECURITY.md](SECURITY.md).

---

## 🗂️ Project Structure

```
claudedesk/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # App entry point
│   │   ├── cli-manager.ts # PTY spawning & Claude CLI lifecycle
│   │   ├── session-manager.ts
│   │   ├── ipc-handlers.ts   # Handler implementations (uses IPCRegistry)
│   │   ├── ipc-registry.ts   # Typed handler registration + auto-cleanup
│   │   ├── ipc-emitter.ts    # Type-safe main→renderer push events
│   │   └── quota-service.ts
│   ├── preload/           # Context bridge (auto-generated from contract)
│   │   └── index.ts
│   ├── renderer/          # React app (UI)
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/
│   └── shared/            # Shared types & IPC contract
│       ├── ipc-contract.ts   # Single source of truth for all IPC methods
│       └── ipc-types.ts      # Data type definitions
├── resources/             # Icons and assets
├── dist/                  # Build output
└── release/               # Packaged apps
```

---

## 🛠️ Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run electron:dev

# Run tests (when available)
npm test

# Lint code
npm run lint
```

### Tech Stack

- **Framework**: Electron 28
- **Frontend**: React 18 + TypeScript
- **Terminal**: xterm.js with fit and web-links addons
- **PTY**: node-pty for cross-platform shell spawning
- **Styling**: Tailwind CSS (Tokyo Night theme)
- **Build**: Vite + electron-builder

### Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Development setup
- Code style and standards
- How to submit pull requests
- Issue reporting

---

## 🐛 Known Issues

### Development Dependency Vulnerabilities

Some development dependencies (electron, vite, electron-builder) have known security advisories. These affect development and build processes only—**not the distributed application**. See [SECURITY.md](SECURITY.md#known-issues) for details.

### Platform-Specific Notes

- **Windows**: PowerShell is used as the default shell. Ensure `claude` is in your PATH.
- **macOS**: Requires macOS 10.13+ (High Sierra or later).
- **Linux**: Tested on Ubuntu 20.04+. May require `libxtst6` and `libnss3` packages.

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** - [Open an issue](https://github.com/carloluisito/claudedesk/issues/new?template=bug_report.md)
2. **Suggest features** - [Request a feature](https://github.com/carloluisito/claudedesk/issues/new?template=feature_request.md)
3. **Submit PRs** - See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
4. **Improve docs** - Help make the documentation better

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
Copyright (c) 2026 Carlo Luisito Adap
```

---

## 🙏 Acknowledgments

- **Anthropic** for creating Claude and Claude Code CLI
- **xterm.js** for the excellent terminal emulation library
- **Electron** for making desktop apps easy
- **node-pty** for cross-platform PTY support

---

## ⚠️ Disclaimer

**ClaudeDesk is an unofficial community project and is not endorsed, affiliated with, or supported by Anthropic.**

This is an independent wrapper around the Claude Code CLI. For official support, refer to [Anthropic's documentation](https://claude.ai/claude-code).

---

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/carloluisito/claudedesk/issues)
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities
- **Email**: carlo.adap@hotmail.com

---

## 🌟 Star this repo!

If you find ClaudeDesk useful, please consider starring the repository to help others discover it!

[![GitHub stars](https://img.shields.io/github/stars/carloluisito/claudedesk?style=social)](https://github.com/carloluisito/claudedesk/stargazers)

---

**Made with ❤️ by [Carlo Luisito Adap](https://github.com/carloluisito)**
