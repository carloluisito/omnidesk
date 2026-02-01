import { randomUUID } from 'crypto';
import { wsManager } from './ws-manager.js';
import { claudeInvoker } from './claude-invoker.js';
import { settingsManager } from '../config/settings.js';
import type { ContextSummary, ContextState } from '../types.js';

// Model context window sizes (in tokens)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
};

const DEFAULT_CONTEXT_WINDOW = 200000;
const SUMMARIZATION_MODEL = 'claude-3-5-haiku-20241022';
const SUMMARIZATION_TIMEOUT_MS = 60000;

interface SessionContextData {
  lastActualInputTokens: number;
  summaries: ContextSummary[];
  summarizationStatus: ContextState['summarizationStatus'];
  isSummarizing: boolean;
  splitSuggested: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

class ContextManager {
  private sessionData: Map<string, SessionContextData> = new Map();

  private getOrCreateSession(sessionId: string): SessionContextData {
    let data = this.sessionData.get(sessionId);
    if (!data) {
      data = {
        lastActualInputTokens: 0,
        summaries: [],
        summarizationStatus: 'none',
        isSummarizing: false,
        splitSuggested: false,
      };
      this.sessionData.set(sessionId, data);
    }
    return data;
  }

  /**
   * Estimate tokens for a set of messages using chars/4 heuristic
   */
  estimateTokensForMessages(messages: ChatMessage[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
    }
    return Math.ceil(totalChars / 4);
  }

  /**
   * Get the context window size for a given model
   */
  getModelContextWindow(model?: string): number {
    if (model && MODEL_CONTEXT_WINDOWS[model]) {
      return MODEL_CONTEXT_WINDOWS[model];
    }
    return DEFAULT_CONTEXT_WINDOW;
  }

  /**
   * Build the current context state for a session
   */
  getContextState(sessionId: string, messages: ChatMessage[], model?: string): ContextState {
    const data = this.getOrCreateSession(sessionId);
    const settings = settingsManager.getContext();
    const contextWindow = this.getModelContextWindow(model);
    const maxPromptTokens = settings.maxPromptTokens;

    // Estimate current prompt tokens
    const nonStreamingMessages = messages.filter(m => !m.isStreaming);
    const estimatedTokens = this.estimateTokensForMessages(nonStreamingMessages);

    // Add summary tokens
    let summaryTokens = 0;
    for (const summary of data.summaries) {
      summaryTokens += summary.tokenEstimate;
    }

    const totalEstimatedTokens = estimatedTokens + summaryTokens;

    // Use actual input tokens if available and more recent, otherwise estimate
    const effectiveTokens = data.lastActualInputTokens > 0
      ? data.lastActualInputTokens
      : totalEstimatedTokens;

    const utilization = Math.min(effectiveTokens / maxPromptTokens, 1.0);

    // Count summarized vs verbatim messages
    const summarizedIds = new Set<string>();
    for (const summary of data.summaries) {
      for (const id of summary.summarizedMessageIds) {
        summarizedIds.add(id);
      }
    }

    const verbatimCount = nonStreamingMessages.filter(m => !summarizedIds.has(m.id)).length;

    return {
      modelContextWindow: contextWindow,
      estimatedPromptTokens: effectiveTokens,
      lastActualInputTokens: data.lastActualInputTokens,
      contextUtilizationPercent: Math.round(utilization * 100),
      summarizationStatus: data.summarizationStatus,
      summaryCount: data.summaries.length,
      verbatimMessageCount: verbatimCount,
      totalMessageCount: nonStreamingMessages.length,
    };
  }

  /**
   * Update with actual usage from Claude result event
   */
  updateActualUsage(sessionId: string, inputTokens: number): void {
    const data = this.getOrCreateSession(sessionId);
    data.lastActualInputTokens = inputTokens;
  }

  /**
   * Broadcast context state to WebSocket clients
   */
  broadcastContextState(sessionId: string, state: ContextState): void {
    wsManager.broadcastToSession(sessionId, {
      type: 'context_state_update',
      sessionId,
      contextState: state,
    });
  }

  /**
   * Broadcast split suggestion to WebSocket clients
   */
  broadcastSplitSuggested(sessionId: string): void {
    wsManager.broadcastToSession(sessionId, {
      type: 'context_split_suggested',
      sessionId,
    });
  }

  /**
   * Check if summarization should be triggered
   */
  shouldSummarize(state: ContextState): boolean {
    const settings = settingsManager.getContext();
    return (
      state.contextUtilizationPercent >= settings.summarizationThreshold * 100 &&
      state.summarizationStatus === 'none' &&
      state.totalMessageCount > settings.verbatimRecentCount * 2
    );
  }

  /**
   * Check if session split should be suggested
   */
  shouldSuggestSplit(state: ContextState): boolean {
    const settings = settingsManager.getContext();
    return state.contextUtilizationPercent >= settings.splitThreshold * 100;
  }

  /**
   * Get summaries for a session
   */
  getSummaries(sessionId: string): ContextSummary[] {
    const data = this.getOrCreateSession(sessionId);
    return [...data.summaries];
  }

  /**
   * Add a summary to the session
   */
  addSummary(sessionId: string, summary: ContextSummary): void {
    const data = this.getOrCreateSession(sessionId);
    data.summaries.push(summary);
  }

  /**
   * Set summarization status for a session
   */
  setSummarizationStatus(sessionId: string, status: ContextState['summarizationStatus']): void {
    const data = this.getOrCreateSession(sessionId);
    data.summarizationStatus = status;
  }

  /**
   * Get the latest summary content for prompt building
   */
  getLatestSummary(sessionId: string): ContextSummary | undefined {
    const data = this.sessionData.get(sessionId);
    if (!data || data.summaries.length === 0) return undefined;
    return data.summaries[data.summaries.length - 1];
  }

  /**
   * Check if split has been suggested for this session
   */
  isSplitSuggested(sessionId: string): boolean {
    const data = this.sessionData.get(sessionId);
    return data?.splitSuggested ?? false;
  }

  /**
   * Mark split as suggested
   */
  markSplitSuggested(sessionId: string): void {
    const data = this.getOrCreateSession(sessionId);
    data.splitSuggested = true;
  }

  /**
   * Summarize conversation messages using Haiku
   */
  async summarize(
    sessionId: string,
    messages: ChatMessage[],
    repoPath: string,
    artifactsDir: string
  ): Promise<ContextSummary> {
    const data = this.getOrCreateSession(sessionId);
    const settings = settingsManager.getContext();

    // Guard: only one summarization at a time per session
    if (data.isSummarizing) {
      throw new Error('Summarization already in progress');
    }

    data.isSummarizing = true;
    data.summarizationStatus = 'in_progress';

    // Broadcast status
    const currentState = this.getContextState(sessionId, messages);
    this.broadcastContextState(sessionId, currentState);

    try {
      // Select messages to summarize: all except the most recent verbatimRecentCount * 2
      const nonStreaming = messages.filter(m => !m.isStreaming);
      const keepCount = settings.verbatimRecentCount * 2;
      const toSummarize = nonStreaming.slice(0, Math.max(0, nonStreaming.length - keepCount));

      if (toSummarize.length === 0) {
        throw new Error('No messages to summarize');
      }

      // Build summarization prompt
      const conversationText = toSummarize.map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const content = m.content.length > 3000 ? m.content.slice(0, 3000) + '...' : m.content;
        return `**${role}:** ${content}`;
      }).join('\n\n');

      const summarizationPrompt = `You are summarizing a conversation between a user and an AI coding assistant for context continuity. Create a structured summary that preserves:

1. **Project Context**: What project/codebase is being worked on
2. **Key Decisions**: Important technical decisions made
3. **Current State**: What has been accomplished so far
4. **Technical Details**: Specific files, functions, APIs, or patterns discussed
5. **Open Items**: Any unresolved questions or next steps

Be concise but thorough. Focus on information needed to continue the conversation effectively.

## Conversation to Summarize

${conversationText}

## Summary`;

      // Invoke Claude with Haiku model
      let summaryContent = '';

      const result = await Promise.race([
        claudeInvoker.invoke({
          repoPath,
          prompt: summarizationPrompt,
          artifactsDir,
          model: SUMMARIZATION_MODEL,
          onStreamEvent: (event) => {
            if (event.type === 'text' && event.content) {
              summaryContent += event.content;
            }
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Summarization timed out')), SUMMARIZATION_TIMEOUT_MS)
        ),
      ]);

      if (!result.success && !summaryContent) {
        throw new Error(result.error || 'Summarization failed');
      }

      // Create summary object
      const summary: ContextSummary = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        summarizedMessageIds: toSummarize.map(m => m.id),
        tokenEstimate: Math.ceil(summaryContent.length / 4),
        content: summaryContent,
        model: SUMMARIZATION_MODEL,
      };

      // Store summary
      this.addSummary(sessionId, summary);
      data.summarizationStatus = 'completed';
      data.isSummarizing = false;

      // Broadcast updated state
      const updatedState = this.getContextState(sessionId, messages);
      this.broadcastContextState(sessionId, updatedState);

      console.log(`[ContextManager] Summarized ${toSummarize.length} messages for session ${sessionId} (${summary.tokenEstimate} est. tokens)`);

      return summary;
    } catch (error) {
      data.summarizationStatus = 'failed';
      data.isSummarizing = false;

      // Broadcast failure
      const failedState = this.getContextState(sessionId, messages);
      this.broadcastContextState(sessionId, failedState);

      console.error(`[ContextManager] Summarization failed for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up session data
   */
  clearSession(sessionId: string): void {
    this.sessionData.delete(sessionId);
  }
}

// Singleton export
export const contextManager = new ContextManager();
