/**
 * System Settings Page - Update preferences and Cache management
 */

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { api } from '../../lib/api';
import { UpdateSettings } from '../../components/settings/UpdateSettings';
import { CacheManagement } from '../../components/settings/CacheManagement';
import { CICDSettings } from '../../components/settings/CICDSettings';
import { ContextSettings } from '../../components/settings/ContextSettings';
import { BudgetAllocatorSettings } from '../../components/settings/BudgetAllocatorSettings';
import { WorkflowSettings } from '../../components/settings/WorkflowSettings';
import { useToast } from '../../hooks/useToast';
import { VStack } from '../../design-system/primitives/Stack';
import { Text } from '../../design-system/primitives/Text';

export default function System() {
  const prefersReduced = useReducedMotion();
  const toast = useToast();
  const [autoCheck, setAutoCheck] = useState(true);
  const [checkInterval, setCheckInterval] = useState(6);

  // Context management settings
  const [ctxAutoSummarize, setCtxAutoSummarize] = useState(true);
  const [ctxSummarizationThreshold, setCtxSummarizationThreshold] = useState(0.7);
  const [ctxSplitThreshold, setCtxSplitThreshold] = useState(0.85);
  const [ctxVerbatimRecentCount, setCtxVerbatimRecentCount] = useState(6);
  const [ctxMaxMessageLength, setCtxMaxMessageLength] = useState(4000);
  const [ctxMaxPromptTokens, setCtxMaxPromptTokens] = useState(150000);

  // CI/CD settings
  const [cicdAutoMonitor, setCicdAutoMonitor] = useState(true);
  const [cicdPollInterval, setCicdPollInterval] = useState(10000);
  const [cicdMaxDuration, setCicdMaxDuration] = useState(1800000);
  const [cicdNotifications, setCicdNotifications] = useState(true);

  // Load settings on mount
  useEffect(() => {
    api<any>('GET', '/settings')
      .then((settings) => {
        if (settings?.update) {
          setAutoCheck(settings.update.autoCheck ?? true);
          setCheckInterval(settings.update.checkIntervalHours ?? 6);
        }
        if (settings?.context) {
          setCtxAutoSummarize(settings.context.autoSummarize ?? true);
          setCtxSummarizationThreshold(settings.context.summarizationThreshold ?? 0.7);
          setCtxSplitThreshold(settings.context.splitThreshold ?? 0.85);
          setCtxVerbatimRecentCount(settings.context.verbatimRecentCount ?? 6);
          setCtxMaxMessageLength(settings.context.maxMessageLength ?? 4000);
          setCtxMaxPromptTokens(settings.context.maxPromptTokens ?? 150000);
        }
        if (settings?.cicd) {
          setCicdAutoMonitor(settings.cicd.autoMonitor ?? true);
          setCicdPollInterval(settings.cicd.pollIntervalMs ?? 10000);
          setCicdMaxDuration(settings.cicd.maxPollDurationMs ?? 1800000);
          setCicdNotifications(settings.cicd.showNotifications ?? true);
        }
      })
      .catch(() => {});
  }, []);

  const handleAutoCheckChange = async (enabled: boolean) => {
    setAutoCheck(enabled);
    try {
      await api('PUT', '/settings', { update: { autoCheck: enabled } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleIntervalChange = async (hours: number) => {
    setCheckInterval(hours);
    try {
      await api('PUT', '/settings', { update: { checkIntervalHours: hours } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  // CI/CD handlers
  const handleCicdAutoMonitor = async (enabled: boolean) => {
    setCicdAutoMonitor(enabled);
    try {
      await api('PUT', '/settings', { cicd: { autoMonitor: enabled } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCicdPollInterval = async (ms: number) => {
    setCicdPollInterval(ms);
    try {
      await api('PUT', '/settings', { cicd: { pollIntervalMs: ms } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCicdMaxDuration = async (ms: number) => {
    setCicdMaxDuration(ms);
    try {
      await api('PUT', '/settings', { cicd: { maxPollDurationMs: ms } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCicdNotifications = async (enabled: boolean) => {
    setCicdNotifications(enabled);
    try {
      await api('PUT', '/settings', { cicd: { showNotifications: enabled } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  // Context management handlers
  const handleCtxAutoSummarize = async (enabled: boolean) => {
    setCtxAutoSummarize(enabled);
    try {
      await api('PUT', '/settings', { context: { autoSummarize: enabled } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCtxSummarizationThreshold = async (value: number) => {
    setCtxSummarizationThreshold(value);
    try {
      await api('PUT', '/settings', { context: { summarizationThreshold: value } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCtxSplitThreshold = async (value: number) => {
    setCtxSplitThreshold(value);
    try {
      await api('PUT', '/settings', { context: { splitThreshold: value } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCtxVerbatimRecentCount = async (value: number) => {
    setCtxVerbatimRecentCount(value);
    try {
      await api('PUT', '/settings', { context: { verbatimRecentCount: value } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCtxMaxMessageLength = async (value: number) => {
    setCtxMaxMessageLength(value);
    try {
      await api('PUT', '/settings', { context: { maxMessageLength: value } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleCtxMaxPromptTokens = async (value: number) => {
    setCtxMaxPromptTokens(value);
    try {
      await api('PUT', '/settings', { context: { maxPromptTokens: value } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.2 }}
    >
      <VStack gap={8}>
        {/* Workflow Enforcement Section */}
        <VStack gap={3}>
          <div>
            <Text variant="bodySm" color="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
              Workflow Enforcement
            </Text>
            <div className="mt-1 h-px bg-white/5" />
          </div>
          <WorkflowSettings />
        </VStack>

        {/* Budget Allocator Section */}
        <VStack gap={3}>
          <div>
            <Text variant="bodySm" color="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
              Budget Allocator
            </Text>
            <div className="mt-1 h-px bg-white/5" />
          </div>
          <BudgetAllocatorSettings />
        </VStack>

        {/* Updates Section */}
        <VStack gap={3}>
          <div>
            <Text variant="bodySm" color="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
              Updates
            </Text>
            <div className="mt-1 h-px bg-white/5" />
          </div>
          <UpdateSettings
            autoCheckEnabled={autoCheck}
            checkIntervalHours={checkInterval}
            onAutoCheckChange={handleAutoCheckChange}
            onIntervalChange={handleIntervalChange}
          />
        </VStack>

        {/* CI/CD Section */}
        <VStack gap={3}>
          <div>
            <Text variant="bodySm" color="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
              CI/CD Pipeline Monitoring
            </Text>
            <div className="mt-1 h-px bg-white/5" />
          </div>
          <CICDSettings
            autoMonitor={cicdAutoMonitor}
            pollIntervalMs={cicdPollInterval}
            maxPollDurationMs={cicdMaxDuration}
            showNotifications={cicdNotifications}
            onAutoMonitorChange={handleCicdAutoMonitor}
            onPollIntervalChange={handleCicdPollInterval}
            onMaxDurationChange={handleCicdMaxDuration}
            onNotificationsChange={handleCicdNotifications}
          />
        </VStack>

        {/* Context Management Section */}
        <VStack gap={3}>
          <div>
            <Text variant="bodySm" color="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
              Context Management
            </Text>
            <div className="mt-1 h-px bg-white/5" />
          </div>
          <ContextSettings
            autoSummarize={ctxAutoSummarize}
            summarizationThreshold={ctxSummarizationThreshold}
            splitThreshold={ctxSplitThreshold}
            verbatimRecentCount={ctxVerbatimRecentCount}
            maxMessageLength={ctxMaxMessageLength}
            maxPromptTokens={ctxMaxPromptTokens}
            onAutoSummarizeChange={handleCtxAutoSummarize}
            onSummarizationThresholdChange={handleCtxSummarizationThreshold}
            onSplitThresholdChange={handleCtxSplitThreshold}
            onVerbatimRecentCountChange={handleCtxVerbatimRecentCount}
            onMaxMessageLengthChange={handleCtxMaxMessageLength}
            onMaxPromptTokensChange={handleCtxMaxPromptTokens}
          />
        </VStack>

        {/* Cache Section */}
        <VStack gap={3}>
          <div>
            <Text variant="bodySm" color="secondary" className="font-semibold uppercase tracking-wider text-[11px]">
              Cache & Storage
            </Text>
            <div className="mt-1 h-px bg-white/5" />
          </div>
          <CacheManagement />
        </VStack>
      </VStack>
    </motion.div>
  );
}
