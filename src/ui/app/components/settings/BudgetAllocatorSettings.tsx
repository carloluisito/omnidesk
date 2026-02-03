/**
 * BudgetAllocatorSettings - Token Usage Allocator configuration
 *
 * Controls for:
 * - Master enable/disable toggle
 * - Default budget caps (session/workspace/reserve)
 * - Enforcement mode (soft/hard)
 * - Warning thresholds
 * - Degradation ladder
 * - Queue behavior
 * - Cost estimation method
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GripVertical, Plus, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { VStack, HStack } from '../../design-system/primitives/Stack';
import { Text } from '../../design-system/primitives/Text';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';

interface DegradationStep {
  type: string;
  model?: string;
}

interface AllocatorConfig {
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

const STEP_LABELS: Record<string, string> = {
  'require-confirmation': 'Require Confirmation',
  'switch-model': 'Switch Model (Haiku)',
  'require-plan-mode': 'Require Plan Mode',
  'pause-queue': 'Pause Queue',
  'suggest-split': 'Suggest Session Split',
  'block-new-sessions': 'Block New Sessions',
};

const STEP_TYPES = Object.keys(STEP_LABELS);

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        checked ? 'bg-blue-600' : 'bg-white/10'
      )}
    >
      <span className={cn(
        'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
        checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        'mt-[2px]'
      )} />
    </button>
  );
}

function SliderRow({ label, description, value, min, max, step, format, onChange }: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
      <div>
        <Text variant="bodySm" color="primary">{label}</Text>
        <Text variant="bodyXs" color="muted" className="mt-0.5">{description}</Text>
      </div>
      <HStack gap={2} align="center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={local}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => onChange(local)}
          onTouchEnd={() => onChange(local)}
          className="w-24 h-1 appearance-none rounded-full bg-white/10 accent-blue-500 cursor-pointer"
          aria-label={label}
        />
        <span className="w-12 text-right text-xs text-white/60 font-mono">
          {format(local)}
        </span>
      </HStack>
    </div>
  );
}

export function BudgetAllocatorSettings() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [config, setConfig] = useState<AllocatorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const hasFetched = useRef(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api<AllocatorConfig>('GET', '/terminal/usage/budget-config');
      setConfig(result);
    } catch {
      toastRef.current.error('Failed to load allocator settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchConfig();
    }
  }, [fetchConfig]);

  const saveConfig = useCallback(async (updates: Partial<AllocatorConfig>) => {
    try {
      const result = await api<AllocatorConfig>('PUT', '/terminal/usage/budget-config', updates);
      setConfig(result);
      setDirty(false);
    } catch {
      toastRef.current.error('Failed to save setting');
    }
  }, []);

  const resetDefaults = useCallback(async () => {
    try {
      const result = await api<AllocatorConfig>('POST', '/terminal/usage/budget-config/reset');
      setConfig(result);
      setDirty(false);
      toastRef.current.success('Reset to defaults');
    } catch {
      toastRef.current.error('Failed to reset settings');
    }
  }, []);

  if (loading || !config) {
    return (
      <VStack gap={4}>
        <div className="animate-pulse h-16 bg-white/[0.03] rounded-2xl" />
        <div className="animate-pulse h-16 bg-white/[0.03] rounded-2xl" />
      </VStack>
    );
  }

  const isDisabled = !config.enabled;

  const updateDefaults = (updates: Partial<AllocatorConfig['defaults']>) => {
    saveConfig({ defaults: { ...config.defaults, ...updates } });
  };

  const moveDegradationStep = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= config.degradationSteps.length) return;
    const steps = [...config.degradationSteps];
    [steps[fromIndex], steps[toIndex]] = [steps[toIndex], steps[fromIndex]];
    saveConfig({ degradationSteps: steps });
  };

  const removeDegradationStep = (index: number) => {
    const steps = config.degradationSteps.filter((_, i) => i !== index);
    saveConfig({ degradationSteps: steps });
  };

  const addDegradationStep = (type: string) => {
    const step: DegradationStep = type === 'switch-model'
      ? { type, model: 'claude-3-5-haiku-20241022' }
      : { type };
    saveConfig({ degradationSteps: [...config.degradationSteps, step] });
  };

  return (
    <VStack gap={4}>
      {/* 1. Master Toggle */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">Enable Budget Allocator</Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Track and manage Claude API quota usage with budgets and degradation rules
          </Text>
        </div>
        <Toggle
          checked={config.enabled}
          onChange={(enabled) => saveConfig({ enabled })}
          label="Enable budget allocator"
        />
      </div>

      {/* All sub-sections gray out when disabled */}
      <div className={cn(isDisabled && 'opacity-40 pointer-events-none')}>
        {/* 2. Default Budget Caps */}
        <VStack gap={3}>
          <Text variant="bodyXs" color="secondary" className="font-semibold uppercase tracking-wider text-[10px] px-1">
            Budget Caps
          </Text>

          <SliderRow
            label="Session Cap (5h)"
            description="Max % of 5-hour quota per session"
            value={config.defaults.sessionCapPercent5h}
            min={10} max={100} step={5}
            format={(v) => `${v}%`}
            onChange={(v) => updateDefaults({ sessionCapPercent5h: v })}
          />

          <SliderRow
            label="Workspace Cap (Weekly)"
            description="Max % of weekly quota per workspace"
            value={config.defaults.workspaceCapPercentWeekly}
            min={10} max={100} step={5}
            format={(v) => `${v}%`}
            onChange={(v) => updateDefaults({ workspaceCapPercentWeekly: v })}
          />

          <SliderRow
            label="Reserve Budget"
            description="Reserve % of weekly quota for urgent tasks"
            value={config.defaults.reservePercentWeekly}
            min={0} max={50} step={5}
            format={(v) => `${v}%`}
            onChange={(v) => updateDefaults({ reservePercentWeekly: v })}
          />
        </VStack>

        {/* 3. Warning Thresholds */}
        <VStack gap={3} className="mt-6">
          <Text variant="bodyXs" color="secondary" className="font-semibold uppercase tracking-wider text-[10px] px-1">
            Warning Thresholds
          </Text>

          {['Caution', 'Warning', 'Critical'].map((label, i) => (
            <SliderRow
              key={label}
              label={`${label} Threshold`}
              description={`Trigger ${label.toLowerCase()} alert at this usage %`}
              value={config.defaults.warnThresholds[i]}
              min={i === 0 ? 30 : config.defaults.warnThresholds[i - 1] + 5}
              max={100}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => {
                const thresholds = [...config.defaults.warnThresholds] as [number, number, number];
                thresholds[i] = v;
                updateDefaults({ warnThresholds: thresholds });
              }}
            />
          ))}
        </VStack>

        {/* 4. Enforcement Mode */}
        <VStack gap={3} className="mt-6">
          <Text variant="bodyXs" color="secondary" className="font-semibold uppercase tracking-wider text-[10px] px-1">
            Enforcement Mode
          </Text>

          <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
            <Text variant="bodySm" color="primary" className="mb-2">Default Enforcement</Text>
            <div className="flex gap-2">
              {(['soft', 'hard'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => saveConfig({ defaultEnforcement: mode })}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium rounded-lg ring-1 transition-colors',
                    config.defaultEnforcement === mode
                      ? mode === 'soft'
                        ? 'bg-amber-500/10 ring-amber-500/30 text-amber-300'
                        : 'bg-red-500/10 ring-red-500/30 text-red-300'
                      : 'bg-zinc-800 ring-zinc-700 text-zinc-400 hover:ring-zinc-600'
                  )}
                >
                  {mode === 'soft' ? 'Soft (warn + allow override)' : 'Hard (block at limit)'}
                </button>
              ))}
            </div>
          </div>
        </VStack>

        {/* 5. Degradation Ladder */}
        <VStack gap={3} className="mt-6">
          <Text variant="bodyXs" color="secondary" className="font-semibold uppercase tracking-wider text-[10px] px-1">
            Degradation Ladder
          </Text>
          <Text variant="bodyXs" color="muted" className="px-1">
            Steps activate progressively as usage increases. Drag to reorder.
          </Text>

          <div className="space-y-2">
            {config.degradationSteps.map((step, index) => (
              <div
                key={`${step.type}-${index}`}
                className="flex items-center gap-2 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3"
              >
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveDegradationStep(index, -1)}
                    disabled={index === 0}
                    className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-[10px]"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveDegradationStep(index, 1)}
                    disabled={index === config.degradationSteps.length - 1}
                    className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-[10px]"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <GripVertical className="h-4 w-4 text-zinc-600 shrink-0" />
                <span className="text-xs text-zinc-200 flex-1">
                  {index + 1}. {STEP_LABELS[step.type] || step.type}
                </span>
                <button
                  onClick={() => removeDegradationStep(index)}
                  className="p-1 rounded hover:bg-white/5 text-zinc-600 hover:text-red-400"
                  aria-label={`Remove ${STEP_LABELS[step.type]}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Add step */}
            {config.degradationSteps.length < STEP_TYPES.length && (
              <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/[0.04] p-3">
                <Text variant="bodyXs" color="muted" className="mb-2">Add step:</Text>
                <div className="flex flex-wrap gap-1.5">
                  {STEP_TYPES.filter(t => !config.degradationSteps.some(s => s.type === t)).map(type => (
                    <button
                      key={type}
                      onClick={() => addDegradationStep(type)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 ring-1 ring-zinc-700 transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {STEP_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </VStack>

        {/* 6. Queue Behavior */}
        <VStack gap={3} className="mt-6">
          <Text variant="bodyXs" color="secondary" className="font-semibold uppercase tracking-wider text-[10px] px-1">
            Queue Behavior
          </Text>

          <SliderRow
            label="Auto-Pause Threshold"
            description="Pause queue when 5h usage reaches this %"
            value={config.queue.autoPauseAtPercent5h}
            min={50} max={100} step={5}
            format={(v) => `${v}%`}
            onChange={(v) => saveConfig({ queue: { ...config.queue, autoPauseAtPercent5h: v } })}
          />

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
            <div>
              <Text variant="bodySm" color="primary">Show Projected Cost</Text>
              <Text variant="bodyXs" color="muted" className="mt-0.5">
                Display estimated cost for queued messages
              </Text>
            </div>
            <Toggle
              checked={config.queue.showProjectedCost}
              onChange={(v) => saveConfig({ queue: { ...config.queue, showProjectedCost: v } })}
              label="Show projected cost"
            />
          </div>
        </VStack>

        {/* 7. Cost Estimation */}
        <VStack gap={3} className="mt-6">
          <Text variant="bodyXs" color="secondary" className="font-semibold uppercase tracking-wider text-[10px] px-1">
            Cost Estimation
          </Text>

          <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
            <Text variant="bodySm" color="primary" className="mb-2">Estimation Method</Text>
            <div className="flex gap-2">
              {(['optimistic', 'average', 'conservative'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => saveConfig({ estimation: { ...config.estimation, method } })}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium rounded-lg ring-1 transition-colors capitalize',
                    config.estimation.method === method
                      ? 'bg-blue-500/10 ring-blue-500/30 text-blue-300'
                      : 'bg-zinc-800 ring-zinc-700 text-zinc-400 hover:ring-zinc-600'
                  )}
                >
                  {method}
                </button>
              ))}
            </div>
            <Text variant="bodyXs" color="muted" className="mt-2">
              {config.estimation.method === 'conservative'
                ? 'Estimates 1.5x the average — safer but more restrictive'
                : config.estimation.method === 'optimistic'
                  ? 'Estimates 0.7x the average — allows more messages'
                  : 'Uses historical average cost per message'}
            </Text>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
            <div>
              <Text variant="bodySm" color="primary">Show Pre-Send Estimate</Text>
              <Text variant="bodyXs" color="muted" className="mt-0.5">
                Display approximate cost before sending messages
              </Text>
            </div>
            <Toggle
              checked={config.estimation.showPreSendEstimate}
              onChange={(v) => saveConfig({ estimation: { ...config.estimation, showPreSendEstimate: v } })}
              label="Show pre-send estimate"
            />
          </div>
        </VStack>

        {/* 8. Action Bar */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={resetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 ring-1 ring-zinc-700 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="px-1">
        <Text variant="bodyXs" color="muted">
          Budget allocator tracks Claude API quota usage as percentages. All estimates are approximate and based on historical averages. Anthropic does not expose absolute token budgets.
        </Text>
      </div>
    </VStack>
  );
}
