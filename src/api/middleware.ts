import { Request, Response, NextFunction } from 'express';
import { settingsManager } from '../config/settings.js';

// Default token for local development (as documented in SECURITY.md)
const DEFAULT_LOCAL_TOKEN = 'claudedesk-local';

// Cookie name for persistent sessions
const AUTH_COOKIE_NAME = 'claudedesk_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// Rate limiting for failed auth attempts (remote access security)
const failedAuthAttempts: Map<string, { count: number; blockedUntil: number | null }> = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes

export function getAuthToken(): string {
  // For remote access, use tunnel token if enabled
  const tunnelSettings = settingsManager.getTunnel();
  if (tunnelSettings.enabled && tunnelSettings.authToken) {
    return tunnelSettings.authToken;
  }

  // Environment variable takes precedence
  if (process.env.CLAUDEDESK_TOKEN) {
    return process.env.CLAUDEDESK_TOKEN;
  }

  // Default to 'claudedesk-local' for local development
  // As documented in SECURITY.md - suitable only for local development
  return DEFAULT_LOCAL_TOKEN;
}

/**
 * Check if request is from remote (via Cloudflare Tunnel)
 */
export function isRemoteRequest(req: Request): boolean {
  // Cloudflare adds X-Forwarded-For header
  const forwardedFor = req.headers['x-forwarded-for'];
  return !!forwardedFor;
}

/**
 * Get client IP for rate limiting
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can be a comma-separated list, take the first IP
    const ips = typeof forwardedFor === 'string' ? forwardedFor.split(',') : forwardedFor;
    return ips[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Check if IP is blocked due to failed auth attempts
 */
function isIpBlocked(ip: string): boolean {
  const record = failedAuthAttempts.get(ip);
  if (!record) return false;

  if (record.blockedUntil && Date.now() < record.blockedUntil) {
    return true;
  }

  // Block expired, reset
  if (record.blockedUntil && Date.now() >= record.blockedUntil) {
    failedAuthAttempts.delete(ip);
    return false;
  }

  return false;
}

/**
 * Record failed auth attempt
 */
function recordFailedAuth(ip: string): void {
  const record = failedAuthAttempts.get(ip) || { count: 0, blockedUntil: null };
  record.count++;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = Date.now() + BLOCK_DURATION;
    console.warn(`[Auth] IP ${ip} blocked for ${BLOCK_DURATION / 1000}s after ${MAX_FAILED_ATTEMPTS} failed attempts`);
  }

  failedAuthAttempts.set(ip, record);
}

/**
 * Clear failed auth attempts for IP (on successful auth)
 */
function clearFailedAuth(ip: string): void {
  failedAuthAttempts.delete(ip);
}

/**
 * Extract token from various sources (header, cookie, query param)
 */
function extractToken(req: Request): string | null {
  // 1. Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // 2. Check cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match) {
      return match[1];
    }
  }

  // 3. Check query param (for QR code login)
  const queryToken = req.query.token;
  if (queryToken && typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
}

// REL-01: Enhanced rate limiting
// Sliding window rate limiter with per-endpoint and global limits
interface RateLimitConfig {
  window: number;  // Time window in ms
  max: number;     // Max requests per window
}

const rateLimitBuckets: Map<string, number[]> = new Map();

// Rate limit configurations by endpoint pattern
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Expensive operations - strict limits
  'POST:/api/terminal/sessions': { window: 60000, max: 10 },        // Terminal session creation
  'POST:/api/terminal/sessions/*/send': { window: 60000, max: 60 }, // Claude messages
  'POST:/api/repos/*/publish': { window: 60000, max: 5 },           // GitHub repo creation
  'POST:/api/terminal/sessions/*/create-pr': { window: 60000, max: 10 }, // PR creation
  'POST:/api/terminal/sessions/*/ship': { window: 60000, max: 10 }, // Ship (commit+push+PR)
  // Docker operations
  'POST:/api/docker/start': { window: 60000, max: 5 },
  'POST:/api/docker/stop': { window: 60000, max: 5 },
  // Default for all other API routes
  'default': { window: 60000, max: 200 },  // 200 requests per minute
};

/**
 * Get the rate limit configuration for a given request
 */
function getRateLimitConfig(method: string, path: string): { key: string; config: RateLimitConfig } {
  // Try exact match first
  const exactKey = `${method}:${path}`;
  if (RATE_LIMITS[exactKey]) {
    return { key: exactKey, config: RATE_LIMITS[exactKey] };
  }

  // Try pattern match (replace UUIDs/IDs with *)
  const normalizedPath = path.replace(/\/[a-f0-9-]{36}/gi, '/*').replace(/\/\d+/g, '/*');
  const patternKey = `${method}:${normalizedPath}`;
  if (RATE_LIMITS[patternKey]) {
    return { key: patternKey, config: RATE_LIMITS[patternKey] };
  }

  // Fall back to default
  return { key: 'default', config: RATE_LIMITS['default'] };
}

/**
 * Check if request is rate limited
 */
function isRateLimited(bucketKey: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  let timestamps = rateLimitBuckets.get(bucketKey);

  if (!timestamps) {
    timestamps = [];
    rateLimitBuckets.set(bucketKey, timestamps);
  }

  // Remove timestamps outside the window
  while (timestamps.length > 0 && timestamps[0] < now - config.window) {
    timestamps.shift();
  }

  if (timestamps.length >= config.max) {
    return true;
  }

  timestamps.push(now);
  return false;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow health check without auth
  if (req.path === '/api/health') {
    next();
    return;
  }

  // Allow health status endpoint without auth (for setup wizard)
  if (req.path === '/api/health/status') {
    next();
    return;
  }

  // Allow session check without auth (for PWA cookie restore)
  if (req.path === '/api/auth/session') {
    next();
    return;
  }

  // Allow PIN validation without auth (it's the auth entry point)
  if (req.path === '/api/auth/pin/validate') {
    next();
    return;
  }

  // Allow remote status check without auth (needed for local auto-auth)
  if (req.path === '/api/system/remote-status') {
    next();
    return;
  }

  // Allow static files without auth (UI assets)
  if (!req.path.startsWith('/api/')) {
    // Check for token in query param for initial page load (QR code login)
    const queryToken = req.query.token;
    if (queryToken && typeof queryToken === 'string') {
      const expectedToken = getAuthToken();
      if (queryToken === expectedToken) {
        // Set auth cookie for persistent session
        res.cookie(AUTH_COOKIE_NAME, queryToken, {
          httpOnly: true,
          secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE,
        });
      }
    }
    next();
    return;
  }

  // Allow screenshot artifacts without auth (job ID is already a hard-to-guess UUID)
  if (req.path.match(/^\/api\/jobs\/[^/]+\/artifacts\/screenshot$/)) {
    next();
    return;
  }

  const expectedToken = getAuthToken();
  const providedToken = extractToken(req);
  const clientIp = getClientIp(req);
  const isRemote = isRemoteRequest(req);

  // Check if IP is blocked
  if (isIpBlocked(clientIp)) {
    res.status(429).json({
      success: false,
      error: 'Too many failed authentication attempts. Please try again later.',
    });
    return;
  }

  // Security: For remote requests, reject default local token
  if (isRemote && providedToken === DEFAULT_LOCAL_TOKEN) {
    console.warn('[Auth] Remote request attempted with default local token - rejecting');
    recordFailedAuth(clientIp);
    res.status(403).json({
      success: false,
      error: 'Remote access requires a secure authentication token. Please enable remote access in settings.',
    });
    return;
  }

  if (!providedToken) {
    if (isRemote) {
      recordFailedAuth(clientIp);
    }
    res.status(401).json({ success: false, error: 'Missing authorization' });
    return;
  }

  // For local requests: accept either the default token OR the secure token
  // For remote requests: only accept the secure token (default already rejected above)
  const isValidToken = providedToken === expectedToken ||
                       (!isRemote && providedToken === DEFAULT_LOCAL_TOKEN);

  if (!isValidToken) {
    if (isRemote) {
      recordFailedAuth(clientIp);
    }
    res.status(403).json({ success: false, error: 'Invalid token' });
    return;
  }

  // Successful auth - clear failed attempts
  if (isRemote) {
    clearFailedAuth(clientIp);
  }

  // If token came from query param, set cookie for future requests
  if (req.query.token && typeof req.query.token === 'string') {
    res.cookie(AUTH_COOKIE_NAME, providedToken, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
    });
  }

  next();
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only rate limit API routes
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // Skip rate limiting for read-only health checks
  if (req.path === '/api/health' || req.path === '/api/health/status') {
    next();
    return;
  }

  // Get rate limit configuration for this endpoint
  const { key, config } = getRateLimitConfig(req.method, req.path);

  // Check if rate limited
  // Use IP address as additional bucketing for global limits
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const bucketKey = key === 'default' ? `${key}:${clientIp}` : key;

  if (isRateLimited(bucketKey, config)) {
    const retryAfter = Math.ceil(config.window / 1000);
    res.setHeader('Retry-After', retryAfter.toString());
    res.status(429).json({
      success: false,
      error: `Rate limit exceeded. Max ${config.max} requests per ${config.window / 1000}s for this endpoint.`,
    });
    return;
  }

  next();
}

// Error handler
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('API Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
}
