# Security Policy

This document describes the security model, considerations, and vulnerability reporting procedures for ClaudeDesk.

## Security Model

### API Authentication

ClaudeDesk uses token-based authentication for all API endpoints:

- **Authentication Token:** Set via the `CLAUDEDESK_TOKEN` environment variable
- **Default Behavior:** If not set, defaults to `claudedesk-local` (suitable only for local development)
- **Token Sources:** Tokens can be provided via:
  - `Authorization: Bearer <token>` header
  - `claudedesk_session` HTTP-only cookie (set after initial auth)
  - Query parameter `?token=<token>` (for HTTP API QR code login flow only)

### Rate Limiting

API endpoints are protected by rate limiting:

- Expensive operations (terminal sessions, GitHub publishing, PR creation): 5-10 requests per minute
- General API requests: 200 requests per minute per IP
- Rate limit responses include `Retry-After` header

### OAuth Token Storage

OAuth tokens for GitHub and GitLab integrations are encrypted at rest:

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key Storage:** Encryption key stored in `config/.secrets-key` with restricted file permissions (mode 0600)
- **Key Generation:** 256-bit random key generated on first use via `crypto.randomBytes(32)`
- **Token Format:** `iv:authTag:ciphertext` (hex-encoded)

### Claude CLI Integration

ClaudeDesk invokes the Claude CLI with the `--dangerously-skip-permissions` flag to enable autonomous operation. This flag:

- Bypasses interactive permission prompts
- Allows Claude to execute shell commands, read/write files, and make network requests without user confirmation
- Is required for the automated workflow features

## Security Considerations

### Network Exposure

**Warning:** ClaudeDesk is designed for local development use. If exposed to untrusted networks:

- Always set a strong, unique `CLAUDEDESK_TOKEN`
- Consider running behind a reverse proxy with TLS
- Do not expose ports 8787 (API) or 5173 (UI) to the public internet without additional authentication

### Token Security

Recommendations:

- Use a cryptographically random token of at least 32 characters
- Generate a secure token: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- Never commit tokens to version control
- Rotate tokens periodically

### Claude CLI Permissions

The `--dangerously-skip-permissions` flag grants Claude significant system access:

- Claude can execute arbitrary shell commands in repository directories
- Claude can read, write, and delete files
- Claude can make network requests

**Mitigations:**

- Claude operates within configured repository paths (workspaces)
- Commands are logged for audit purposes
- Critical ports (8787, 5173) are protected from being killed by Claude

### Sensitive Data

- OAuth tokens are encrypted at rest but decrypted in memory during use
- The encryption key file (`config/.secrets-key`) should be protected and excluded from backups/version control
- Database passwords for Docker services are randomly generated on first use

## Reporting Vulnerabilities

If you discover a security vulnerability in ClaudeDesk:

### Private Disclosure

1. **GitHub Security Advisory:** Create a private security advisory at the repository's Security tab
2. **Email:** Contact the maintainer directly (check repository for contact information)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 7 days
- **Fix Timeline:** Depends on severity; critical issues prioritized

### Scope

In scope:
- Authentication bypass
- Token exposure or leakage
- Encryption weaknesses
- Command injection
- Privilege escalation

Out of scope:
- Issues requiring physical access
- Social engineering
- Denial of service (rate limiting is in place)
- Issues in third-party dependencies (report to upstream)

## Security Updates

Security fixes are released as patch versions. Monitor the repository releases for security announcements.
