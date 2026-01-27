import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MessageUsage, SessionUsageStats, GlobalUsageStats, WeeklyUsageStats } from '../types.js';

// Lazy path resolution - evaluated when needed, not at module load time
function getUsageDir(): string {
  return join(process.cwd(), 'config', 'usage');
}
function getGlobalUsageFile(): string {
  return join(getUsageDir(), 'global-usage.json');
}
function getWeeklyUsageFile(): string {
  return join(getUsageDir(), 'weekly-usage.json');
}
function getSessionsUsageDir(): string {
  return join(getUsageDir(), 'sessions');
}

// Model pricing per 1M tokens (input / output)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 1, output: 5 },
  // Default pricing if model not found
  'default': { input: 3, output: 15 },
};

interface SessionUsageData {
  sessionId: string;
  messages: MessageUsage[];
  toolUseCount: number;
  filesChanged: number;
}

interface GlobalUsageData {
  periodStart: string;
  messages: MessageUsage[];
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

interface WeeklyUsageData {
  weekStart: string;   // Sunday 00:00:00 ISO string
  weekEnd: string;     // Saturday 23:59:59 ISO string
  messages: MessageUsage[];
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; apiCalls: number }>;
  dailyBreakdown: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; apiCalls: number }>;
}

/**
 * Get the start of the week (Sunday 00:00:00) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the week (Saturday 23:59:59) for a given date
 */
function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

class UsageManager {
  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(getUsageDir())) {
      mkdirSync(getUsageDir(), { recursive: true });
    }
    if (!existsSync(getSessionsUsageDir())) {
      mkdirSync(getSessionsUsageDir(), { recursive: true });
    }
  }

  /**
   * Calculate cost based on model and token usage
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Find pricing for the model
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];

    // Cost = (tokens / 1M) * price per 1M tokens
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get model short name for display
   */
  getModelShortName(model: string): string {
    if (model.includes('opus')) return 'Opus';
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('haiku')) return 'Haiku';
    return model.split('-').slice(0, 2).join(' ');
  }

  /**
   * Record usage for a message in a session
   */
  recordMessageUsage(
    sessionId: string,
    data: {
      messageId: string;
      model?: string;
      usage?: {
        inputTokens: number;
        outputTokens: number;
      };
      costUsd?: number;
      durationMs?: number;
    },
    toolUseCount: number = 0,
    filesChanged: number = 0
  ): void {
    if (!data.usage) return;

    const model = data.model || 'unknown';
    const cost = data.costUsd ?? this.calculateCost(model, data.usage.inputTokens, data.usage.outputTokens);

    const messageUsage: MessageUsage = {
      messageId: data.messageId,
      timestamp: new Date().toISOString(),
      model,
      usage: data.usage,
      costUsd: cost,
      durationMs: data.durationMs || 0,
    };

    // Update session usage
    this.updateSessionUsage(sessionId, messageUsage, toolUseCount, filesChanged);

    // Update global usage (daily)
    this.updateGlobalUsage(messageUsage);

    // Update weekly usage
    this.updateWeeklyUsage(messageUsage);
  }

  /**
   * Update session-specific usage data
   */
  private updateSessionUsage(
    sessionId: string,
    messageUsage: MessageUsage,
    toolUseCount: number,
    filesChanged: number
  ): void {
    const sessionFile = join(getSessionsUsageDir(), `${sessionId}.json`);
    let sessionData: SessionUsageData = {
      sessionId,
      messages: [],
      toolUseCount: 0,
      filesChanged: 0,
    };

    if (existsSync(sessionFile)) {
      try {
        sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));
      } catch {
        // Use default
      }
    }

    sessionData.messages.push(messageUsage);
    sessionData.toolUseCount += toolUseCount;
    sessionData.filesChanged += filesChanged;

    writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
  }

  /**
   * Update global usage data
   */
  private updateGlobalUsage(messageUsage: MessageUsage): void {
    const today = new Date().toISOString().split('T')[0];
    let globalData: GlobalUsageData = {
      periodStart: today,
      messages: [],
      byModel: {},
    };

    if (existsSync(getGlobalUsageFile())) {
      try {
        globalData = JSON.parse(readFileSync(getGlobalUsageFile(), 'utf-8'));

        // Reset if it's a new day
        if (globalData.periodStart !== today) {
          globalData = {
            periodStart: today,
            messages: [],
            byModel: {},
          };
        }
      } catch {
        // Use default
      }
    }

    globalData.messages.push(messageUsage);

    // Update by-model stats
    const model = messageUsage.model;
    if (!globalData.byModel[model]) {
      globalData.byModel[model] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
    globalData.byModel[model].inputTokens += messageUsage.usage.inputTokens;
    globalData.byModel[model].outputTokens += messageUsage.usage.outputTokens;
    globalData.byModel[model].costUsd += messageUsage.costUsd;

    writeFileSync(getGlobalUsageFile(), JSON.stringify(globalData, null, 2));
  }

  /**
   * Update weekly usage data
   */
  private updateWeeklyUsage(messageUsage: MessageUsage): void {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);
    const weekStartStr = weekStart.toISOString();
    const weekEndStr = weekEnd.toISOString();
    const today = now.toISOString().split('T')[0];

    let weeklyData: WeeklyUsageData = {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      messages: [],
      byModel: {},
      dailyBreakdown: {},
    };

    if (existsSync(getWeeklyUsageFile())) {
      try {
        weeklyData = JSON.parse(readFileSync(getWeeklyUsageFile(), 'utf-8'));

        // Reset if it's a new week
        const storedWeekStart = new Date(weeklyData.weekStart);
        if (storedWeekStart.getTime() !== weekStart.getTime()) {
          weeklyData = {
            weekStart: weekStartStr,
            weekEnd: weekEndStr,
            messages: [],
            byModel: {},
            dailyBreakdown: {},
          };
        }
      } catch {
        // Use default
      }
    }

    weeklyData.messages.push(messageUsage);

    // Update by-model stats
    const model = messageUsage.model;
    if (!weeklyData.byModel[model]) {
      weeklyData.byModel[model] = { inputTokens: 0, outputTokens: 0, costUsd: 0, apiCalls: 0 };
    }
    weeklyData.byModel[model].inputTokens += messageUsage.usage.inputTokens;
    weeklyData.byModel[model].outputTokens += messageUsage.usage.outputTokens;
    weeklyData.byModel[model].costUsd += messageUsage.costUsd;
    weeklyData.byModel[model].apiCalls += 1;

    // Update daily breakdown
    if (!weeklyData.dailyBreakdown[today]) {
      weeklyData.dailyBreakdown[today] = { inputTokens: 0, outputTokens: 0, costUsd: 0, apiCalls: 0 };
    }
    weeklyData.dailyBreakdown[today].inputTokens += messageUsage.usage.inputTokens;
    weeklyData.dailyBreakdown[today].outputTokens += messageUsage.usage.outputTokens;
    weeklyData.dailyBreakdown[today].costUsd += messageUsage.costUsd;
    weeklyData.dailyBreakdown[today].apiCalls += 1;

    writeFileSync(getWeeklyUsageFile(), JSON.stringify(weeklyData, null, 2));
  }

  /**
   * Get usage stats for a specific session
   */
  getSessionUsage(sessionId: string): SessionUsageStats {
    const sessionFile = join(getSessionsUsageDir(), `${sessionId}.json`);
    const defaultStats: SessionUsageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      messageCount: 0,
      toolUseCount: 0,
      filesChanged: 0,
    };

    if (!existsSync(sessionFile)) {
      return defaultStats;
    }

    try {
      const sessionData: SessionUsageData = JSON.parse(readFileSync(sessionFile, 'utf-8'));

      let totalInput = 0;
      let totalOutput = 0;
      let totalCost = 0;
      let lastModel: string | undefined;

      for (const msg of sessionData.messages) {
        totalInput += msg.usage.inputTokens;
        totalOutput += msg.usage.outputTokens;
        totalCost += msg.costUsd;
        lastModel = msg.model;
      }

      return {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCostUsd: totalCost,
        messageCount: sessionData.messages.length,
        toolUseCount: sessionData.toolUseCount,
        filesChanged: sessionData.filesChanged,
        model: lastModel,
      };
    } catch {
      return defaultStats;
    }
  }

  /**
   * Get global usage stats for today
   */
  getGlobalUsage(): GlobalUsageStats {
    const today = new Date().toISOString().split('T')[0];
    const defaultStats: GlobalUsageStats = {
      periodStart: today,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalApiCalls: 0,
      byModel: {},
    };

    if (!existsSync(getGlobalUsageFile())) {
      return defaultStats;
    }

    try {
      const globalData: GlobalUsageData = JSON.parse(readFileSync(getGlobalUsageFile(), 'utf-8'));

      // Return default if data is from a different day
      if (globalData.periodStart !== today) {
        return defaultStats;
      }

      let totalInput = 0;
      let totalOutput = 0;
      let totalCost = 0;

      for (const msg of globalData.messages) {
        totalInput += msg.usage.inputTokens;
        totalOutput += msg.usage.outputTokens;
        totalCost += msg.costUsd;
      }

      return {
        periodStart: globalData.periodStart,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCostUsd: totalCost,
        totalApiCalls: globalData.messages.length,
        byModel: globalData.byModel,
      };
    } catch {
      return defaultStats;
    }
  }

  /**
   * Get weekly usage stats (resets on Sunday)
   */
  getWeeklyUsage(): WeeklyUsageStats {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(now);

    const defaultStats: WeeklyUsageStats = {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalApiCalls: 0,
      byModel: {},
      dailyBreakdown: {},
    };

    if (!existsSync(getWeeklyUsageFile())) {
      return defaultStats;
    }

    try {
      const weeklyData: WeeklyUsageData = JSON.parse(readFileSync(getWeeklyUsageFile(), 'utf-8'));

      // Return default if data is from a different week
      const storedWeekStart = new Date(weeklyData.weekStart);
      if (storedWeekStart.getTime() !== weekStart.getTime()) {
        return defaultStats;
      }

      let totalInput = 0;
      let totalOutput = 0;
      let totalCost = 0;

      for (const msg of weeklyData.messages) {
        totalInput += msg.usage.inputTokens;
        totalOutput += msg.usage.outputTokens;
        totalCost += msg.costUsd;
      }

      return {
        weekStart: weeklyData.weekStart,
        weekEnd: weeklyData.weekEnd,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCostUsd: totalCost,
        totalApiCalls: weeklyData.messages.length,
        byModel: weeklyData.byModel,
        dailyBreakdown: weeklyData.dailyBreakdown,
      };
    } catch {
      return defaultStats;
    }
  }

  /**
   * Delete session usage data when session is closed
   */
  deleteSessionUsage(sessionId: string): void {
    const sessionFile = join(getSessionsUsageDir(), `${sessionId}.json`);
    if (existsSync(sessionFile)) {
      try {
        const fs = require('fs');
        fs.unlinkSync(sessionFile);
      } catch {
        // Ignore deletion errors
      }
    }
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
let _usageManager: UsageManager | null = null;

function getUsageManagerInstance(): UsageManager {
  if (!_usageManager) {
    _usageManager = new UsageManager();
  }
  return _usageManager;
}

export const usageManager = new Proxy({} as UsageManager, {
  get(_, prop) {
    const instance = getUsageManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
