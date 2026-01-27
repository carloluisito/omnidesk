# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.9]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.9
[1.0.0]: https://github.com/carloluisito/claudedesk/releases/tag/v1.0.0
