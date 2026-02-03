import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { usageManager } from './usage-manager.js';
import { queryClaudeQuota } from './claude-usage-query.js';

// Lazy path resolution
function getConfigPath(): string {
  return join(process.cwd(), 'config', 'allocator.json');
}

// --- Types ---

export type DegradationStep =
  | { type: 'require-confirmation' }
  | { type: 'switch-model'; model: string }
  | { type: 'require-plan-mode' }
  | { type: 'pause-queue' }
  | { type: 'suggest-split' }
  | { type: 'block-new-sessions' };

export interface AllocatorConfig {
  enabled: boolean;
  defaults: {
    sessionCapPercent5h: number;
    workspaceCapPercentWeekly: number;
    reservePercentWeekly: number;
    warnThresholds: [number, number, number];
  };
  defaultEnforcement: 'soft' | 'hard';
  degradationSteps: DegradationStep[];
  workspaceOverrides: Record<string, {
    capPercentWeekly?: number;
    enforcement?: 'soft' | 'hard';
  }>;
  queue: {
    autoPauseAtPercent5h: number;
    showProjectedCost: boolean;
  };
  estimation: {
    method: 'average' | 'conservative' | 'optimistic';
    showPreSendEstimate: boolean;
  };
}

export interface BurnRateData {
  ratePerHour5h: number | null;   // %/hr of 5h quota
  ratePerHour7d: number | null;   // %/hr of 7d quota
  trend: 'increasing' | 'stable' | 'decreasing' | 'unknown';
  projectedTimeToLimit5h: number | null; // minutes until 100%
  projectedTimeToLimit7d: number | null;
  label: 'on-track' | 'elevated' | 'critical' | 'unknown';
  dataPoints: number;
}

export interface CostEstimate {
  estimatedPercent5h: number;
  projectedAfter5h: number;  // current + estimated
  estimatedPercent7d: number;
  projectedAfter7d: number;
  confidence: 'low' | 'medium' | 'high';
  basis: string; // e.g. "Based on average costs"
}

interface UtilizationSample {
  timestamp: string;
  fiveHour: number;  // 0-100
  sevenDay: number;  // 0-100
}

interface AllocatorState {
  config: AllocatorConfig;
  utilizationHistory: UtilizationSample[];
  activeDegradations: DegradationStep[];
}

// --- Defaults ---

const DEFAULT_CONFIG: AllocatorConfig = {
  enabled: false,
  defaults: {
    sessionCapPercent5h: 25,
    workspaceCapPercentWeekly: 50,
    reservePercentWeekly: 15,
    warnThresholds: [70, 85, 95],
  },
  defaultEnforcement: 'soft',
  degradationSteps: [
    { type: 'require-confirmation' },
    { type: 'switch-model', model: 'claude-3-5-haiku-20241022' },
    { type: 'require-plan-mode' },
    { type: 'pause-queue' },
    { type: 'block-new-sessions' },
  ],
  workspaceOverrides: {},
  queue: {
    autoPauseAtPercent5h: 85,
    showProjectedCost: true,
  },
  estimation: {
    method: 'average',
    showPreSendEstimate: true,
  },
};

const MAX_HISTORY_SAMPLES = 300; // ~5 hours at 1 sample/min

// --- Manager ---

class AllocatorManager {
  private state: AllocatorState;

  constructor() {
    this.state = this.load();
  }

  private load(): AllocatorState {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
        return {
          config: { ...DEFAULT_CONFIG, ...raw.config },
          utilizationHistory: raw.utilizationHistory || [],
          activeDegradations: raw.activeDegradations || [],
        };
      } catch {
        // Fall through to defaults
      }
    }
    return {
      config: { ...DEFAULT_CONFIG },
      utilizationHistory: [],
      activeDegradations: [],
    };
  }

  private save(): void {
    const configPath = getConfigPath();
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(this.state, null, 2));
  }

  // --- Config CRUD ---

  getConfig(): AllocatorConfig {
    return { ...this.state.config };
  }

  updateConfig(updates: Partial<AllocatorConfig>): AllocatorConfig {
    if (updates.defaults) {
      this.state.config.defaults = { ...this.state.config.defaults, ...updates.defaults };
    }
    if (updates.enabled !== undefined) this.state.config.enabled = updates.enabled;
    if (updates.defaultEnforcement) this.state.config.defaultEnforcement = updates.defaultEnforcement;
    if (updates.degradationSteps) this.state.config.degradationSteps = updates.degradationSteps;
    if (updates.workspaceOverrides) {
      this.state.config.workspaceOverrides = {
        ...this.state.config.workspaceOverrides,
        ...updates.workspaceOverrides,
      };
    }
    if (updates.queue) {
      this.state.config.queue = { ...this.state.config.queue, ...updates.queue };
    }
    if (updates.estimation) {
      this.state.config.estimation = { ...this.state.config.estimation, ...updates.estimation };
    }
    this.save();
    return this.getConfig();
  }

  resetConfig(): AllocatorConfig {
    this.state.config = { ...DEFAULT_CONFIG };
    this.state.utilizationHistory = [];
    this.state.activeDegradations = [];
    this.save();
    return this.getConfig();
  }

  // --- Utilization Sampling ---

  async recordUtilizationSample(): Promise<void> {
    try {
      const quota = await queryClaudeQuota(false);
      if (!quota) return;

      const sample: UtilizationSample = {
        timestamp: new Date().toISOString(),
        fiveHour: Math.round(quota.five_hour.utilization * 100 * 10) / 10,
        sevenDay: Math.round(quota.seven_day.utilization * 100 * 10) / 10,
      };

      this.state.utilizationHistory.push(sample);

      // Trim old samples
      if (this.state.utilizationHistory.length > MAX_HISTORY_SAMPLES) {
        this.state.utilizationHistory = this.state.utilizationHistory.slice(-MAX_HISTORY_SAMPLES);
      }

      this.save();
    } catch {
      // Silently fail
    }
  }

  getUtilizationHistory(): UtilizationSample[] {
    return [...this.state.utilizationHistory];
  }

  // --- Burn Rate ---

  getBurnRate(): BurnRateData {
    const history = this.state.utilizationHistory;
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

    // Use samples from the last 30 minutes
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const recentSamples = history.filter(s => new Date(s.timestamp).getTime() >= thirtyMinAgo);

    if (recentSamples.length < 2) {
      // Fall back to last 2 samples
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      const deltaMs = new Date(last.timestamp).getTime() - new Date(prev.timestamp).getTime();
      if (deltaMs <= 0) return defaultResult;

      const hoursElapsed = deltaMs / (1000 * 60 * 60);
      const rate5h = (last.fiveHour - prev.fiveHour) / hoursElapsed;
      const rate7d = (last.sevenDay - prev.sevenDay) / hoursElapsed;

      return this.buildBurnRateResult(rate5h, rate7d, last, history.length);
    }

    const first = recentSamples[0];
    const last = recentSamples[recentSamples.length - 1];
    const deltaMs = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
    if (deltaMs <= 0) return defaultResult;

    const hoursElapsed = deltaMs / (1000 * 60 * 60);
    const rate5h = (last.fiveHour - first.fiveHour) / hoursElapsed;
    const rate7d = (last.sevenDay - first.sevenDay) / hoursElapsed;

    return this.buildBurnRateResult(rate5h, rate7d, last, history.length);
  }

  private buildBurnRateResult(
    rate5h: number,
    rate7d: number,
    current: UtilizationSample,
    dataPoints: number
  ): BurnRateData {
    // Projected time to 100%
    const remaining5h = 100 - current.fiveHour;
    const remaining7d = 100 - current.sevenDay;
    const projectedMinutes5h = rate5h > 0 ? (remaining5h / rate5h) * 60 : null;
    const projectedMinutes7d = rate7d > 0 ? (remaining7d / rate7d) * 60 : null;

    // Determine trend from recent deltas
    const history = this.state.utilizationHistory;
    let trend: BurnRateData['trend'] = 'stable';
    if (history.length >= 4) {
      const recentRate = (history[history.length - 1].fiveHour - history[history.length - 2].fiveHour);
      const olderRate = (history[history.length - 3].fiveHour - history[history.length - 4].fiveHour);
      if (recentRate > olderRate + 0.5) trend = 'increasing';
      else if (recentRate < olderRate - 0.5) trend = 'decreasing';
    }

    // Label based on projected time
    let label: BurnRateData['label'] = 'on-track';
    if (projectedMinutes5h !== null) {
      if (projectedMinutes5h < 60) label = 'critical';
      else if (projectedMinutes5h < 120) label = 'elevated';
    }

    return {
      ratePerHour5h: Math.round(rate5h * 10) / 10,
      ratePerHour7d: Math.round(rate7d * 10) / 10,
      trend,
      projectedTimeToLimit5h: projectedMinutes5h !== null ? Math.round(projectedMinutes5h) : null,
      projectedTimeToLimit7d: projectedMinutes7d !== null ? Math.round(projectedMinutes7d) : null,
      label,
      dataPoints,
    };
  }

  // --- Cost Estimation ---

  estimateMessageCost(sessionId?: string): CostEstimate {
    const config = this.state.config;
    const history = this.state.utilizationHistory;

    // Get historical average cost per message (as % of quota)
    let avgPercent5h = 0.8; // Default fallback: ~0.8% per message
    let avgPercent7d = 0.3;
    let confidence: CostEstimate['confidence'] = 'low';
    let basis = 'Based on default estimates';

    if (history.length >= 3) {
      // Calculate average delta between consecutive samples
      let totalDelta5h = 0;
      let totalDelta7d = 0;
      let sampleCount = 0;

      for (let i = 1; i < history.length; i++) {
        const delta5h = history[i].fiveHour - history[i - 1].fiveHour;
        const delta7d = history[i].sevenDay - history[i - 1].sevenDay;

        // Only count positive deltas (actual usage increases)
        if (delta5h > 0) {
          totalDelta5h += delta5h;
          totalDelta7d += delta7d;
          sampleCount++;
        }
      }

      if (sampleCount > 0) {
        // Average delta per sample (each sample represents ~1 API call/message)
        avgPercent5h = totalDelta5h / sampleCount;
        avgPercent7d = totalDelta7d / sampleCount;
        confidence = sampleCount >= 5 ? 'high' : sampleCount >= 3 ? 'medium' : 'low';
        basis = `Based on ${sampleCount} recent samples`;
      }
    }

    // Apply method multiplier
    if (config.estimation.method === 'conservative') {
      avgPercent5h *= 1.5;
      avgPercent7d *= 1.5;
    } else if (config.estimation.method === 'optimistic') {
      avgPercent5h *= 0.7;
      avgPercent7d *= 0.7;
    }

    // Current utilization
    const current5h = history.length > 0 ? history[history.length - 1].fiveHour : 0;
    const current7d = history.length > 0 ? history[history.length - 1].sevenDay : 0;

    return {
      estimatedPercent5h: Math.round(avgPercent5h * 10) / 10,
      projectedAfter5h: Math.round((current5h + avgPercent5h) * 10) / 10,
      estimatedPercent7d: Math.round(avgPercent7d * 10) / 10,
      projectedAfter7d: Math.round((current7d + avgPercent7d) * 10) / 10,
      confidence,
      basis,
    };
  }

  // --- Budget Enforcement ---

  checkBudgetLimits(currentQuota?: { fiveHour: number; sevenDay: number }): {
    allowed: boolean;
    reason?: string;
    enforcement: 'none' | 'soft' | 'hard';
    activeDegradations: DegradationStep[];
    thresholdHit?: number;
  } {
    const config = this.state.config;
    if (!config.enabled) {
      return { allowed: true, enforcement: 'none', activeDegradations: [] };
    }

    const fiveHour = currentQuota?.fiveHour ?? (this.state.utilizationHistory.length > 0
      ? this.state.utilizationHistory[this.state.utilizationHistory.length - 1].fiveHour
      : 0);
    const sevenDay = currentQuota?.sevenDay ?? (this.state.utilizationHistory.length > 0
      ? this.state.utilizationHistory[this.state.utilizationHistory.length - 1].sevenDay
      : 0);

    const thresholds = config.defaults.warnThresholds;
    const sessionCap = config.defaults.sessionCapPercent5h;
    const reservePct = config.defaults.reservePercentWeekly || 0;
    const weeklyCap = config.defaults.workspaceCapPercentWeekly - reservePct;

    // Check hard limits
    if (fiveHour >= sessionCap && config.defaultEnforcement === 'hard') {
      return {
        allowed: false,
        reason: `5-hour budget hard limit exceeded (${fiveHour.toFixed(1)}% >= ${sessionCap}% cap)`,
        enforcement: 'hard',
        activeDegradations: this.getActiveDegradations(fiveHour),
        thresholdHit: sessionCap,
      };
    }
    if (sevenDay >= weeklyCap && config.defaultEnforcement === 'hard') {
      return {
        allowed: false,
        reason: `Weekly budget hard limit exceeded (${sevenDay.toFixed(1)}% >= ${weeklyCap}% cap)`,
        enforcement: 'hard',
        activeDegradations: this.getActiveDegradations(fiveHour),
        thresholdHit: weeklyCap,
      };
    }

    // Check soft limits / warn thresholds
    if (fiveHour >= thresholds[2]) {
      return {
        allowed: true,
        reason: `5-hour usage at ${fiveHour.toFixed(1)}% (threshold: ${thresholds[2]}%)`,
        enforcement: 'soft',
        activeDegradations: this.getActiveDegradations(fiveHour),
        thresholdHit: thresholds[2],
      };
    }
    if (fiveHour >= thresholds[1]) {
      return {
        allowed: true,
        reason: `5-hour usage at ${fiveHour.toFixed(1)}% (threshold: ${thresholds[1]}%)`,
        enforcement: 'soft',
        activeDegradations: this.getActiveDegradations(fiveHour),
        thresholdHit: thresholds[1],
      };
    }
    if (fiveHour >= thresholds[0]) {
      return {
        allowed: true,
        reason: `5-hour usage at ${fiveHour.toFixed(1)}% (threshold: ${thresholds[0]}%)`,
        enforcement: 'soft',
        activeDegradations: this.getActiveDegradations(fiveHour),
        thresholdHit: thresholds[0],
      };
    }

    return { allowed: true, enforcement: 'none', activeDegradations: [] };
  }

  private getActiveDegradations(fiveHourPct: number): DegradationStep[] {
    const steps = this.state.config.degradationSteps;
    const thresholds = this.state.config.defaults.warnThresholds;

    // Activate degradation steps progressively
    const active: DegradationStep[] = [];
    if (fiveHourPct >= thresholds[0] && steps.length > 0) active.push(steps[0]);
    if (fiveHourPct >= thresholds[1] && steps.length > 1) active.push(steps[1]);
    if (fiveHourPct >= thresholds[2] && steps.length > 2) {
      for (let i = 2; i < steps.length; i++) {
        active.push(steps[i]);
      }
    }

    this.state.activeDegradations = active;
    return active;
  }

  getActiveDegradationSteps(): DegradationStep[] {
    return [...this.state.activeDegradations];
  }

  // --- Queue Budget Check ---

  shouldPauseQueue(currentFiveHourPct: number): boolean {
    const config = this.state.config;
    if (!config.enabled) return false;
    return currentFiveHourPct >= config.queue.autoPauseAtPercent5h;
  }

  // --- Estimate batch cost ---

  estimateQueueCost(messageCount: number): {
    totalEstimatedPercent5h: number;
    totalEstimatedPercent7d: number;
    current5h: number;
    projected5h: number;
    current7d: number;
    projected7d: number;
    wouldExceedAt?: number; // message index that would cause overrun
  } {
    const estimate = this.estimateMessageCost();
    const current5h = this.state.utilizationHistory.length > 0
      ? this.state.utilizationHistory[this.state.utilizationHistory.length - 1].fiveHour
      : 0;
    const current7d = this.state.utilizationHistory.length > 0
      ? this.state.utilizationHistory[this.state.utilizationHistory.length - 1].sevenDay
      : 0;

    const total5h = estimate.estimatedPercent5h * messageCount;
    const total7d = estimate.estimatedPercent7d * messageCount;
    const projected5h = current5h + total5h;
    const projected7d = current7d + total7d;

    // Find which message would cause overrun
    const cap = this.state.config.defaults.sessionCapPercent5h;
    let wouldExceedAt: number | undefined;
    for (let i = 0; i < messageCount; i++) {
      const projAtI = current5h + estimate.estimatedPercent5h * (i + 1);
      if (projAtI >= cap) {
        wouldExceedAt = i;
        break;
      }
    }

    return {
      totalEstimatedPercent5h: Math.round(total5h * 10) / 10,
      totalEstimatedPercent7d: Math.round(total7d * 10) / 10,
      current5h: Math.round(current5h * 10) / 10,
      projected5h: Math.round(projected5h * 10) / 10,
      current7d: Math.round(current7d * 10) / 10,
      projected7d: Math.round(projected7d * 10) / 10,
      wouldExceedAt,
    };
  }
}

// Lazy singleton
let _allocatorManager: AllocatorManager | null = null;

function getAllocatorManagerInstance(): AllocatorManager {
  if (!_allocatorManager) {
    _allocatorManager = new AllocatorManager();
  }
  return _allocatorManager;
}

export const allocatorManager = new Proxy({} as AllocatorManager, {
  get(_, prop) {
    const instance = getAllocatorManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
