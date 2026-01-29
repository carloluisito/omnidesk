/**
 * System Settings Page - Update preferences and Cache management
 */

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { api } from '../../lib/api';
import { UpdateSettings } from '../../components/settings/UpdateSettings';
import { CacheManagement } from '../../components/settings/CacheManagement';
import { useToast } from '../../hooks/useToast';
import { VStack } from '../../design-system/primitives/Stack';
import { Text } from '../../design-system/primitives/Text';

export default function System() {
  const prefersReduced = useReducedMotion();
  const toast = useToast();
  const [autoCheck, setAutoCheck] = useState(true);
  const [interval, setInterval] = useState(6);

  // Load settings on mount
  useState(() => {
    api<any>('GET', '/settings')
      .then((settings) => {
        if (settings?.update) {
          setAutoCheck(settings.update.autoCheck ?? true);
          setInterval(settings.update.checkIntervalHours ?? 6);
        }
      })
      .catch(() => {});
  });

  const handleAutoCheckChange = async (enabled: boolean) => {
    setAutoCheck(enabled);
    try {
      await api('PUT', '/settings', { update: { autoCheck: enabled } });
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleIntervalChange = async (hours: number) => {
    setInterval(hours);
    try {
      await api('PUT', '/settings', { update: { checkIntervalHours: hours } });
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
            checkIntervalHours={interval}
            onAutoCheckChange={handleAutoCheckChange}
            onIntervalChange={handleIntervalChange}
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
