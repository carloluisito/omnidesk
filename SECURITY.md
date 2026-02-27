# Security Policy

## Supported Versions

Currently, only the latest version of OmniDesk receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of OmniDesk seriously. If you discover a security vulnerability, please follow these steps:

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email security reports to: **carlo.adap@hotmail.com**
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Suggested fix (if you have one)

### What to Expect

- **Acknowledgment**: You will receive a response within 48 hours acknowledging receipt of your report
- **Updates**: We will keep you informed about the progress of fixing the vulnerability
- **Timeline**: We aim to release a fix within 7-14 days for critical vulnerabilities
- **Credit**: We will credit you for the discovery (unless you prefer to remain anonymous)

## Security Considerations

### Credentials and API Access

OmniDesk reads Claude Code CLI credentials from `~/.claude/.credentials.json` to:
- Display API quota usage
- Monitor burn rate
- Provide session management features

**Important notes:**
- Credentials are read locally and never transmitted except to Anthropic's official API endpoints and LaunchTunnel endpoints (for tunnel/sharing features only)
- All API calls use HTTPS
- No credentials are logged or stored by OmniDesk
- You can disable quota monitoring in Settings if you prefer

### Data Privacy

- **Session data**: Stored locally in your user data directory
- **No telemetry**: OmniDesk does not collect or transmit usage data
- **No third-party services**: All data stays on your machine, except official Anthropic API calls and optional LaunchTunnel API calls for tunnels and session sharing (`api.launchtunnel.dev`, `relay.launchtunnel.dev`)

### Development Dependencies

OmniDesk uses Electron and related build tools. Some development dependencies may have security advisories. These tools are only used during development and building - they are not included in the distributed application.

We regularly monitor and update dependencies to address security issues.

## Known Issues

### Development Dependency Vulnerabilities (As of 2026-02-08)

The following vulnerabilities exist in development dependencies (not shipped with the application):

- **electron** (v28.0.0): Moderate severity - ASAR integrity bypass (requires upgrade to v35.7.5+)
- **esbuild/vite**: Moderate severity - dev server request vulnerability (requires vite v7.x)
- **electron-builder/tar**: High severity - file overwrite vulnerabilities (requires electron-builder v26.7.0+)

**Impact**: These affect development and build processes only, not end users of the application.

**Mitigation**: We are evaluating the breaking changes required for these updates and will upgrade in a future release.

## Best Practices for Users

1. **Keep OmniDesk updated**: Always use the latest version
2. **Download from official sources**: Only download releases from the official GitHub repository
3. **Verify checksums**: Check release checksums when available
4. **Review permissions**: OmniDesk requires access to your filesystem and Claude CLI credentials
5. **Report suspicious behavior**: If OmniDesk behaves unexpectedly, report it immediately

## Security Update Policy

Security updates will be released as patch versions (e.g., 1.0.1) and announced via:
- GitHub Releases
- Security advisories on the repository
- CHANGELOG.md

Thank you for helping keep OmniDesk secure!
