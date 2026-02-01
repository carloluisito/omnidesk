/**
 * ContextSettings - Context Management settings panel
 *
 * Controls for:
 * - Auto Summarize toggle
 * - Summarization Threshold slider (50%-95%)
 * - Split Threshold slider (70%-100%)
 * - Recent Messages to Keep slider (1-20)
 * - Max Message Length number input
 * - Max Prompt Tokens number input
 */

import { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
import { cn } from '../../lib/cn';
import { VStack, HStack } from '../../design-system/primitives/Stack';
import { Text } from '../../design-system/primitives/Text';

interface ContextSettingsProps {
  autoSummarize: boolean;
  summarizationThreshold: number;
  splitThreshold: number;
  verbatimRecentCount: number;
  maxMessageLength: number;
  maxPromptTokens: number;
  onAutoSummarizeChange: (enabled: boolean) => void;
  onSummarizationThresholdChange: (value: number) => void;
  onSplitThresholdChange: (value: number) => void;
  onVerbatimRecentCountChange: (value: number) => void;
  onMaxMessageLengthChange: (value: number) => void;
  onMaxPromptTokensChange: (value: number) => void;
}

export function ContextSettings({
  autoSummarize,
  summarizationThreshold,
  splitThreshold,
  verbatimRecentCount,
  maxMessageLength,
  maxPromptTokens,
  onAutoSummarizeChange,
  onSummarizationThresholdChange,
  onSplitThresholdChange,
  onVerbatimRecentCountChange,
  onMaxMessageLengthChange,
  onMaxPromptTokensChange,
}: ContextSettingsProps) {
  const [localSummarizationThreshold, setLocalSummarizationThreshold] = useState(summarizationThreshold);
  const [localSplitThreshold, setLocalSplitThreshold] = useState(splitThreshold);
  const [localVerbatimRecentCount, setLocalVerbatimRecentCount] = useState(verbatimRecentCount);

  useEffect(() => {
    setLocalSummarizationThreshold(summarizationThreshold);
  }, [summarizationThreshold]);

  useEffect(() => {
    setLocalSplitThreshold(splitThreshold);
  }, [splitThreshold]);

  useEffect(() => {
    setLocalVerbatimRecentCount(verbatimRecentCount);
  }, [verbatimRecentCount]);

  const handleSummarizationThresholdCommit = () => {
    const clamped = Math.max(0.5, Math.min(0.95, localSummarizationThreshold));
    setLocalSummarizationThreshold(clamped);
    onSummarizationThresholdChange(clamped);
  };

  const handleSplitThresholdCommit = () => {
    const clamped = Math.max(0.7, Math.min(1.0, localSplitThreshold));
    setLocalSplitThreshold(clamped);
    onSplitThresholdChange(clamped);
  };

  const handleVerbatimRecentCountCommit = () => {
    const clamped = Math.max(1, Math.min(20, localVerbatimRecentCount));
    setLocalVerbatimRecentCount(clamped);
    onVerbatimRecentCountChange(clamped);
  };

  return (
    <VStack gap={4}>
      {/* Auto Summarize toggle */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Auto-Summarize
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Automatically summarize older messages when context fills up
          </Text>
        </div>
        <button
          role="switch"
          aria-checked={autoSummarize}
          aria-label="Auto-summarize"
          onClick={() => onAutoSummarizeChange(!autoSummarize)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
            autoSummarize ? 'bg-blue-600' : 'bg-white/10'
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
              autoSummarize ? 'translate-x-[22px]' : 'translate-x-[2px]',
              'mt-[2px]'
            )}
          />
        </button>
      </div>

      {/* Summarization Threshold */}
      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4 transition-opacity duration-200',
          !autoSummarize && 'opacity-40 pointer-events-none'
        )}
      >
        <div>
          <Text variant="bodySm" color="primary">
            Summarization Threshold
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Start summarizing when context reaches this percentage (50%-95%)
          </Text>
        </div>
        <HStack gap={2} align="center">
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.05}
            value={localSummarizationThreshold}
            onChange={(e) => setLocalSummarizationThreshold(Number(e.target.value))}
            onMouseUp={handleSummarizationThresholdCommit}
            onTouchEnd={handleSummarizationThresholdCommit}
            className="w-24 h-1 appearance-none rounded-full bg-white/10 accent-blue-500 cursor-pointer"
            aria-label="Summarization threshold"
          />
          <span className="w-10 text-right text-xs text-white/60 font-mono">
            {Math.round(localSummarizationThreshold * 100)}%
          </span>
        </HStack>
      </div>

      {/* Split Threshold */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Split Threshold
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Split session when context reaches this percentage (70%-100%)
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5 italic">
            Must be &gt;= summarization threshold
          </Text>
        </div>
        <HStack gap={2} align="center">
          <input
            type="range"
            min={0.7}
            max={1.0}
            step={0.05}
            value={localSplitThreshold}
            onChange={(e) => setLocalSplitThreshold(Number(e.target.value))}
            onMouseUp={handleSplitThresholdCommit}
            onTouchEnd={handleSplitThresholdCommit}
            className="w-24 h-1 appearance-none rounded-full bg-white/10 accent-blue-500 cursor-pointer"
            aria-label="Split threshold"
          />
          <span className="w-10 text-right text-xs text-white/60 font-mono">
            {Math.round(localSplitThreshold * 100)}%
          </span>
        </HStack>
      </div>

      {/* Recent Messages to Keep */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Recent Messages to Keep
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Number of recent messages kept verbatim during summarization (1-20)
          </Text>
        </div>
        <HStack gap={2} align="center">
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={localVerbatimRecentCount}
            onChange={(e) => setLocalVerbatimRecentCount(Number(e.target.value))}
            onMouseUp={handleVerbatimRecentCountCommit}
            onTouchEnd={handleVerbatimRecentCountCommit}
            className="w-24 h-1 appearance-none rounded-full bg-white/10 accent-blue-500 cursor-pointer"
            aria-label="Recent messages to keep"
          />
          <span className="w-10 text-right text-xs text-white/60 font-mono">
            {localVerbatimRecentCount}
          </span>
        </HStack>
      </div>

      {/* Max Message Length */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Max Message Length
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Maximum characters per message before truncation (1000-10000)
          </Text>
        </div>
        <input
          type="number"
          min={1000}
          max={10000}
          step={500}
          value={maxMessageLength}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!isNaN(val)) onMaxMessageLengthChange(val);
          }}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-right text-sm text-white/80 w-28 font-mono"
          aria-label="Max message length"
        />
      </div>

      {/* Max Prompt Tokens */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Max Prompt Tokens
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Maximum tokens allowed in prompt before context management (50k-200k)
          </Text>
        </div>
        <input
          type="number"
          min={50000}
          max={200000}
          step={10000}
          value={maxPromptTokens}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!isNaN(val)) onMaxPromptTokensChange(val);
          }}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-right text-sm text-white/80 w-28 font-mono"
          aria-label="Max prompt tokens"
        />
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 px-1">
        <Brain className="w-4 h-4 text-white/40 mt-0.5 shrink-0" />
        <Text variant="bodyXs" color="muted">
          Context management tracks token usage and automatically summarizes older messages to stay within model limits. Sessions can be split when context fills up.
        </Text>
      </div>
    </VStack>
  );
}
