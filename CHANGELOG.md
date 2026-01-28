# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-28

### Added

#### File Review & Approval UI
- Full-screen file review interface at `/review` route for approving changes before shipping
- Individual file approval with prominent "Approve" button in diff viewer header
- "Approve All Files" bulk action for quick approval of all changes
- Progress bar showing approval completion percentage (X% complete)
- Color-coded status dots replacing icons (green=created, yellow=modified, red=deleted, blue=renamed)
- Full file path display in natural order (directory/filename)
- New files now display complete content as additions (previously showed "No changes to display")
- Help text explaining the approval workflow requirement
- Visual feedback: approved files show green tint and "Approved" badge

#### MCP Server Integration
- Full Model Context Protocol (MCP) support for connecting Claude to external tools
- MCP server configuration management (add, edit, delete, enable/disable)
- Support for two transport types: stdio (command-based) and SSE (HTTP-based)
- Automatic tool discovery from connected MCP servers
- Connection status tracking with real-time updates

#### MCP Server Catalog
- Built-in catalog of 15 pre-configured MCP servers
- Catalog browser with category filtering and search
- Server detail sheets with prerequisites and configuration requirements
- 4-step setup wizard for guided server configuration
- Platform-specific prerequisite detection (Windows, macOS, Linux)

#### Catalog Servers Included
- **Development**: GitHub, GitLab
- **Database**: PostgreSQL, MySQL, SQLite, Redis, MongoDB
- **Communication**: Slack
- **Productivity**: Notion, Linear
- **Design**: Figma
- **Monitoring**: Sentry
- **Automation**: Puppeteer
- **Utilities**: Filesystem, Memory

#### MCP API Endpoints
- `GET /api/mcp/servers` - List all configured servers
- `POST /api/mcp/servers` - Create new server
- `PUT /api/mcp/servers/:id` - Update server configuration
- `DELETE /api/mcp/servers/:id` - Delete server
- `GET /api/mcp/servers/:id/status` - Get connection status
- `POST /api/mcp/servers/:id/connect` - Connect to server
- `POST /api/mcp/servers/:id/disconnect` - Disconnect from server
- `GET /api/mcp/tools` - List all available tools
- `GET /api/mcp/settings` - Get global MCP settings
- `PUT /api/mcp/settings` - Update MCP settings
- `GET /api/mcp/catalog` - Get predefined server templates

### Known Limitations
- **MCP tools are not yet available to Claude during terminal sessions.** This release includes MCP server configuration, connection management, and tool discovery. Integration with Claude Code CLI for autonomous tool usage in conversations is planned for a future release.

### Fixed
- Terminal session preservation across app restarts

## [1.0.9] - 2025-01-28

### Added

#### Message Queue Display
- Queue indicator badge shows above Composer when messages are queued during Claude processing
- Expandable Queue Manager Panel with full queue visibility
- Each queued message shows: position number, content preview (60 chars), timestamp, remove button
- "Clear All" action to remove all queued messages at once
- Maximum queue limit of 10 messages with visual feedback when full
- Queue persists across page refreshes

#### Stop/Cancel Running Prompt
- Stop button (red, Square icon) replaces Send button during generation
- Escape key keyboard shortcut to stop Claude mid-generation
- "Press Esc to stop" hint displayed below button during generation
- Partial responses preserved with "[Cancelled by user]" marker appended
- Clean process termination using tree-kill

#### Resume Queue After Stop
- Amber warning controls appear when stopped with queued messages
- "Resume Queue" button to continue processing queued messages
- "Clear Queue" button to discard all pending messages
- Queue does NOT auto-process after stop (requires explicit user action)
- `wasRecentlyStopped` flag tracks manual cancellation state

### Changed
- Queue no longer auto-processes after user cancellation (explicit resume required)
- Send button disabled when queue reaches 10 message limit

## [1.0.0] - 2025-01-27

### Initial Public Release

#### Added
- Web interface for Claude Code CLI with visual tool timeline
- Session persistence and resume capability
- Git worktree isolation for experimental branches
- Guided ship workflow (review, commit, push, PR)
- Multi-repository workspace management
- GitHub and GitLab OAuth integration
- Mobile access via Cloudflare tunnels
- Docker deployment support
- CLI entry point with npm package distribution
- Usage tracking and quota monitoring
- Plan mode with approval workflow
- Cross-platform support (Windows, macOS, Linux)

#### Documentation
- README with installation and usage instructions
- SETUP guide for quick start
- CONTRIBUTING guidelines for developers
- SECURITY policy for vulnerability reporting
- ARCHITECTURE overview

[1.1.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.1.0
[1.0.9]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.9
[1.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.0
