/**
 * Quota Service - Claude API Quota Query
 *
 * Fetches quota data from Anthropic OAuth API using
 * credentials stored by Claude Code CLI.
 *
 * Supports per-account quota tracking based on session working directory.
 * Different Claude config directories (~/.claude-work, ~/.claude-personal, ~/.claude)
 * are resolved from the active session's working directory.
 *
 * Burn rate calculation matches claude-desk's allocator-manager.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface QuotaBucket {
  utilization: number; // 0-1
  resets_at: string;
}

export interface ClaudeUsageQuota {
  five_hour: QuotaBucket;
  seven_day: QuotaBucket;
  lastUpdated: string;
}

export interface BurnRateData {
  ratePerHour5h: number | null;   // %/hr of 5h quota
  ratePerHour7d: number | null;   // %/hr of 7d quota
  trend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
  projectedTimeToLimit5h: number | null; // minutes until 100%
  projectedTimeToLimit7d: number | null;
  label: 'on-track' | 'elevated' | 'critical' | 'unknown';
  dataPoints: number;
}

interface ClaudeCredentialsFile {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    scopes: string[];
    subscriptionType: string;
    rateLimitTier: string;
  };
  accessToken?: string;
}

interface UtilizationSample {
  timestamp: string;
  fiveHour: number;  // 0-100 (percentage)
  sevenDay: number;  // 0-100 (percentage)
}

interface QuotaState {
  utilizationHistory: UtilizationSample[];
}

interface PerDirCache {
  quota: ClaudeUsageQuota | null;
  timestamp: number;
}

interface PerDirState {
  state: QuotaState;
  loaded: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_HISTORY_SAMPLES = 300; // ~5 hours at 1 sample/min
const QUOTA_CACHE_TTL_MS = 60_000; // 1 minute cache
const MIN_DELTA_MS = 60 * 1000; // 1 minute minimum for rate calculation
const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.claude');

// ═══════════════════════════════════════════════════════════════════════════════
// STATE (per-configDir)
// ═══════════════════════════════════════════════════════════════════════════════

const quotaCacheMap = new Map<string, PerDirCache>();
const stateMap = new Map<string, PerDirState>();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG DIR RESOLVER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the Claude config directory based on a session's working directory.
 * - Paths containing `/repositories/work/` → ~/.claude-work
 * - Paths containing `/repositories/personal/` or `/repositories/ispade/` → ~/.claude-personal
 * - Otherwise → ~/.claude (default)
 */
export function resolveClaudeConfigDir(workingDirectory?: string): string {
  if (!workingDirectory) return DEFAULT_CONFIG_DIR;

  // Normalize path separators for case-insensitive matching
  const normalized = workingDirectory.replace(/\\/g, '/').toLowerCase();

  if (normalized.includes('/repositories/work/')) {
    return path.join(os.homedir(), '.claude-work');
  }
  if (normalized.includes('/repositories/personal/') || normalized.includes('/repositories/ispade/')) {
    return path.join(os.homedir(), '.claude-personal');
  }

  return DEFAULT_CONFIG_DIR;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE (per-configDir)
// ═══════════════════════════════════════════════════════════════════════════════

/** Derive a short suffix from the config dir for state file naming */
function configDirSuffix(configDir: string): string {
  const base = path.basename(configDir); // e.g. ".claude-work", ".claude-personal", ".claude"
  if (base === '.claude') return '';
  // ".claude-work" → "-work", ".claude-personal" → "-personal"
  return base.replace('.claude', '');
}

function getStatePath(configDir: string): string {
  const userDataPath = app.getPath('userData');
  const suffix = configDirSuffix(configDir);
  return path.join(userDataPath, `quota-state${suffix}.json`);
}

function getPerDirState(configDir: string): PerDirState {
  let entry = stateMap.get(configDir);
  if (!entry) {
    entry = { state: { utilizationHistory: [] }, loaded: false };
    stateMap.set(configDir, entry);
  }
  return entry;
}

function loadState(configDir: string): void {
  const entry = getPerDirState(configDir);
  if (entry.loaded) return;
  entry.loaded = true;

  try {
    const statePath = getStatePath(configDir);
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      entry.state = {
        utilizationHistory: raw.utilizationHistory || [],
      };
      console.log(`[quota-service] Loaded ${entry.state.utilizationHistory.length} history samples from ${statePath}`);
    }
  } catch (error) {
    console.log('[quota-service] Error loading state:', error);
  }
}

function saveState(configDir: string): void {
  try {
    const statePath = getStatePath(configDir);
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const entry = getPerDirState(configDir);
    fs.writeFileSync(statePath, JSON.stringify(entry.state, null, 2));
  } catch (error) {
    console.log('[quota-service] Error saving state:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════════

export function getClaudeOAuthToken(configDir: string = DEFAULT_CONFIG_DIR): string | null {
  const credentialPaths = [
    path.join(configDir, '.credentials.json'),
    path.join(configDir, '.credentials'),
    path.join(configDir, 'credentials.json'),
  ];

  for (const credentialsPath of credentialPaths) {
    if (fs.existsSync(credentialsPath)) {
      try {
        const content = fs.readFileSync(credentialsPath, 'utf-8');
        const creds: ClaudeCredentialsFile = JSON.parse(content);
        const token = creds.claudeAiOauth?.accessToken || creds.accessToken;

        if (token) {
          console.log(`[quota-service] Found token in ${credentialsPath}`);
          return token;
        }
      } catch (error) {
        console.log(`[quota-service] Error reading ${credentialsPath}:`, error);
      }
    }
  }

  console.log(`[quota-service] No OAuth token found in ${configDir}`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTA API
// ═══════════════════════════════════════════════════════════════════════════════

export async function queryClaudeQuota(forceRefresh = false, configDir: string = DEFAULT_CONFIG_DIR): Promise<ClaudeUsageQuota | null> {
  loadState(configDir);
  const now = Date.now();

  // Get per-dir cache
  const cache = quotaCacheMap.get(configDir);

  // Return cached data if still valid
  if (!forceRefresh && cache && cache.quota && (now - cache.timestamp) < QUOTA_CACHE_TTL_MS) {
    return cache.quota;
  }

  try {
    const token = getClaudeOAuthToken(configDir);
    if (!token) {
      console.log(`[quota-service] No OAuth token available in ${configDir}`);
      return cache?.quota ?? null;
    }

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[quota-service] Quota API error (${response.status}):`, errorText);
      return cache?.quota ?? null;
    }

    interface ApiQuotaResponse {
      five_hour?: { utilization?: number; resets_at?: string };
      seven_day?: { utilization?: number; resets_at?: string };
    }

    const data = await response.json() as ApiQuotaResponse;

    // Parse the response - API returns utilization as 0-100, normalize to 0-1
    const quota: ClaudeUsageQuota = {
      five_hour: {
        utilization: (data.five_hour?.utilization ?? 0) / 100,
        resets_at: data.five_hour?.resets_at ?? new Date().toISOString(),
      },
      seven_day: {
        utilization: (data.seven_day?.utilization ?? 0) / 100,
        resets_at: data.seven_day?.resets_at ?? new Date().toISOString(),
      },
      lastUpdated: new Date().toISOString(),
    };

    // Update per-dir cache
    quotaCacheMap.set(configDir, { quota, timestamp: now });

    // Record utilization sample for burn rate calculation
    recordUtilizationSample(quota, configDir);

    console.log(`[quota-service] Quota fetched (${configDir}):`, {
      fiveHour: `${(quota.five_hour.utilization * 100).toFixed(1)}%`,
      sevenDay: `${(quota.seven_day.utilization * 100).toFixed(1)}%`,
      historySize: getPerDirState(configDir).state.utilizationHistory.length,
    });

    return quota;
  } catch (error) {
    if (error instanceof Error) {
      console.log('[quota-service] Error fetching quota:', error.message);
    }
    return cache?.quota ?? null;
  }
}

export function clearQuotaCache(configDir?: string): void {
  if (configDir) {
    const cache = quotaCacheMap.get(configDir);
    if (cache) cache.timestamp = 0;
  } else {
    // Clear all caches
    for (const cache of quotaCacheMap.values()) {
      cache.timestamp = 0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIZATION SAMPLING
// ═══════════════════════════════════════════════════════════════════════════════

function recordUtilizationSample(quota: ClaudeUsageQuota, configDir: string): void {
  const sample: UtilizationSample = {
    timestamp: new Date().toISOString(),
    // Store as percentage with 3 decimal places for precision
    fiveHour: Math.round(quota.five_hour.utilization * 100 * 1000) / 1000,
    sevenDay: Math.round(quota.seven_day.utilization * 100 * 1000) / 1000,
  };

  const entry = getPerDirState(configDir);
  entry.state.utilizationHistory.push(sample);

  // Trim old samples
  if (entry.state.utilizationHistory.length > MAX_HISTORY_SAMPLES) {
    entry.state.utilizationHistory = entry.state.utilizationHistory.slice(-MAX_HISTORY_SAMPLES);
  }

  saveState(configDir);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BURN RATE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

interface SamplesWithDelta {
  first: UtilizationSample;
  last: UtilizationSample;
  deltaMs: number;
}

function findSamplesWithDelta(
  samples: UtilizationSample[],
  minDeltaMs: number
): SamplesWithDelta | null {
  if (samples.length < 2) return null;

  const last = samples[samples.length - 1];
  // Search backwards for a sample with sufficient time delta
  for (let i = samples.length - 2; i >= 0; i--) {
    const deltaMs = new Date(last.timestamp).getTime() - new Date(samples[i].timestamp).getTime();
    if (deltaMs >= minDeltaMs) {
      return { first: samples[i], last, deltaMs };
    }
  }
  return null;
}

/** Drop samples from before the most recent quota reset.
 *  A reset is detected when utilization drops by more than RESET_DROP_THRESHOLD
 *  between consecutive samples. */
const RESET_DROP_THRESHOLD = 5; // percentage points

export function filterPostReset(samples: UtilizationSample[]): UtilizationSample[] {
  if (samples.length < 2) return samples;

  // Scan forward to find the LAST reset boundary
  let resetIndex = 0; // default: use all samples
  for (let i = 1; i < samples.length; i++) {
    const drop5h = samples[i - 1].fiveHour - samples[i].fiveHour;
    const drop7d = samples[i - 1].sevenDay - samples[i].sevenDay;
    if (drop5h > RESET_DROP_THRESHOLD || drop7d > RESET_DROP_THRESHOLD) {
      resetIndex = i; // keep only from this index onward
    }
  }

  return resetIndex > 0 ? samples.slice(resetIndex) : samples;
}

export function buildBurnRateResult(
  rate5h: number,
  rate7d: number,
  current: UtilizationSample,
  history: UtilizationSample[]
): BurnRateData {
  // Negative rates are artifacts of quota resets — clamp to 0
  rate5h = Math.max(0, rate5h);
  rate7d = Math.max(0, rate7d);

  // Projected time to 100%
  const remaining5h = 100 - current.fiveHour;
  const remaining7d = 100 - current.sevenDay;
  const projectedMinutes5h = rate5h > 0 ? (remaining5h / rate5h) * 60 : null;

  // For 7d projection: use direct rate if available, otherwise estimate from 5h rate
  let projectedMinutes7d: number | null = null;
  if (rate7d > 0.001) {
    // Use direct rate if it's measurable
    projectedMinutes7d = (remaining7d / rate7d) * 60;
  } else if (rate5h > 0 && remaining7d > 0) {
    // Fallback: estimate 7d rate from 5h rate
    // The 5h window is 5 hours, the 7d window is 168 hours (7*24)
    // Same usage pattern causes: rate7d ≈ rate5h * (5 / 168)
    const estimated7dRate = rate5h * (5 / 168);
    projectedMinutes7d = (remaining7d / estimated7dRate) * 60;
  }

  // Determine trend from recent deltas
  let trend: BurnRateData['trend'] = 'stable';
  if (history.length >= 4) {
    const recentRate = history[history.length - 1].fiveHour - history[history.length - 2].fiveHour;
    const olderRate = history[history.length - 3].fiveHour - history[history.length - 4].fiveHour;
    if (recentRate > olderRate + 0.5) trend = 'increasing';
    else if (recentRate < olderRate - 0.5) trend = 'decreasing';
  }

  // Label based on projected time to limit (worst of both quotas)
  let label: BurnRateData['label'] = 'on-track';
  const projections = [projectedMinutes5h, projectedMinutes7d].filter((v): v is number => v !== null);
  if (projections.length > 0) {
    const minProjected = Math.min(...projections);
    if (minProjected < 60) label = 'critical';
    else if (minProjected < 120) label = 'elevated';
  }

  return {
    ratePerHour5h: Math.round(rate5h * 10) / 10,
    ratePerHour7d: Math.round(rate7d * 10) / 10,
    trend,
    projectedTimeToLimit5h: projectedMinutes5h !== null ? Math.round(projectedMinutes5h) : null,
    projectedTimeToLimit7d: projectedMinutes7d !== null ? Math.round(projectedMinutes7d) : null,
    label,
    dataPoints: history.length,
  };
}

export function getBurnRate(configDir: string = DEFAULT_CONFIG_DIR): BurnRateData {
  loadState(configDir);
  const history = getPerDirState(configDir).state.utilizationHistory;

  const defaultResult: BurnRateData = {
    ratePerHour5h: null,
    ratePerHour7d: null,
    trend: 'unknown',
    projectedTimeToLimit5h: null,
    projectedTimeToLimit7d: null,
    label: 'unknown',
    dataPoints: history.length,
  };

  if (history.length < 2) {
    return defaultResult;
  }

  // Discard samples from before the most recent quota reset
  const postResetHistory = filterPostReset(history);

  if (postResetHistory.length < 2) {
    // Not enough post-reset data yet — return unknown
    return { ...defaultResult, dataPoints: postResetHistory.length };
  }

  // Try to use samples from the last 30 minutes
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const recentSamples = postResetHistory.filter(s => new Date(s.timestamp).getTime() >= thirtyMinAgo);

  // Try recent samples first
  let samplesWithDelta = findSamplesWithDelta(recentSamples, MIN_DELTA_MS);

  // If recent samples don't have sufficient delta, fall back to all post-reset history
  if (!samplesWithDelta) {
    samplesWithDelta = findSamplesWithDelta(postResetHistory, MIN_DELTA_MS);
  }

  // If still no samples with sufficient delta, return stable rate (0)
  if (!samplesWithDelta) {
    const last = postResetHistory[postResetHistory.length - 1];
    return buildBurnRateResult(0, 0, last, postResetHistory);
  }

  const { first, last, deltaMs } = samplesWithDelta;
  const hoursElapsed = deltaMs / (1000 * 60 * 60);
  const rate5h = (last.fiveHour - first.fiveHour) / hoursElapsed;
  const rate7d = (last.sevenDay - first.sevenDay) / hoursElapsed;

  return buildBurnRateResult(rate5h, rate7d, last, postResetHistory);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY ACCESS
// ═══════════════════════════════════════════════════════════════════════════════

export function getUtilizationHistory(configDir: string = DEFAULT_CONFIG_DIR): UtilizationSample[] {
  loadState(configDir);
  return [...getPerDirState(configDir).state.utilizationHistory];
}

export function clearHistory(configDir: string = DEFAULT_CONFIG_DIR): void {
  getPerDirState(configDir).state.utilizationHistory = [];
  saveState(configDir);
}
