/**
 * BudgetSettings - Neon Fuel Cell Configuration
 *
 * Configuration panel for budget allocator with
 * plasma-styled controls and Tokyo Night aesthetics.
 */

import { useState, useEffect } from 'react';
import {
  Gauge,
  AlertTriangle,
  Shield,
  TrendingDown,
  List,
  Clock,
  Calculator,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DegradationStep {
  type: string;
  model?: string;
}

export interface BudgetConfig {
  enabled: boolean;
  defaults: {
    sessionCapPercent5h: number;
    workspaceCapPercentWeekly: number;
    reservePercentWeekly: number;
    warnThresholds: [number, number, number];
  };
  defaultEnforcement: 'soft' | 'hard';
  degradationSteps: DegradationStep[];
  queue: {
    autoPauseAtPercent5h: number;
    showProjectedCost: boolean;
  };
  estimation: {
    method: 'average' | 'conservative' | 'optimistic';
    showPreSendEstimate: boolean;
  };
}

interface BudgetSettingsProps {
  config: BudgetConfig | null;
  isLoading?: boolean;
  onSave: (updates: Partial<BudgetConfig>) => void;
  onReset: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const STEP_LABELS: Record<string, string> = {
  'require-confirmation': 'Require Confirmation',
  'switch-model': 'Switch to Haiku',
  'require-plan-mode': 'Require Plan Mode',
  'pause-queue': 'Pause Queue',
  'suggest-split': 'Suggest Split',
  'block-new-sessions': 'Block Sessions',
};

const STEP_TYPES = Object.keys(STEP_LABELS);

// Default config for when none is provided
const DEFAULT_CONFIG: BudgetConfig = {
  enabled: false,
  defaults: {
    sessionCapPercent5h: 50,
    workspaceCapPercentWeekly: 80,
    reservePercentWeekly: 10,
    warnThresholds: [50, 70, 90],
  },
  defaultEnforcement: 'soft',
  degradationSteps: [
    { type: 'require-confirmation' },
    { type: 'switch-model', model: 'claude-3-5-haiku-20241022' },
  ],
  queue: {
    autoPauseAtPercent5h: 85,
    showProjectedCost: true,
  },
  estimation: {
    method: 'average',
    showPreSendEstimate: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function SectionHeader({ title, icon: Icon }: { title: string; icon?: typeof Gauge }) {
  return (
    <div className="section-header-budget">
      <div className="section-header-line" />
      <div className="section-header-content">
        {Icon && <Icon size={12} />}
        <span>{title}</span>
      </div>
      <div className="section-header-line" />
    </div>
  );
}

function NeonToggle({
  checked,
  onChange,
  label,
  color = '#00C9A7',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`neon-toggle ${checked ? 'active' : ''}`}
      style={{
        '--toggle-color': color,
        '--toggle-glow': `${color}66`,
      } as React.CSSProperties}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
        <span className="toggle-glow" />
      </span>
    </button>
  );
}

function NeonSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
  color = '#00C9A7',
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
  color?: string;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const percentage = ((localValue - min) / (max - min)) * 100;

  return (
    <div className={`neon-slider-container ${disabled ? 'disabled' : ''}`}>
      <div className="slider-header">
        <div className="slider-info">
          <span className="slider-label">{label}</span>
          <span className="slider-description">{description}</span>
        </div>
        <span
          className="slider-value"
          style={{ color, textShadow: `0 0 8px ${color}66` }}
        >
          {format(localValue)}
        </span>
      </div>
      <div className="slider-track-wrapper">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => setLocalValue(Number(e.target.value))}
          onMouseUp={() => onChange(localValue)}
          onTouchEnd={() => onChange(localValue)}
          disabled={disabled}
          className="neon-slider"
          style={{
            '--slider-progress': `${percentage}%`,
            '--slider-color': color,
          } as React.CSSProperties}
        />
        <div
          className="slider-fill"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 12px ${color}44`,
          }}
        />
      </div>
    </div>
  );
}

function SettingCard({
  label,
  description,
  icon: Icon,
  children,
  disabled,
}: {
  label: string;
  description?: string;
  icon?: typeof Gauge;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`setting-card ${disabled ? 'disabled' : ''}`}>
      <div className="setting-card-left">
        {Icon && (
          <div className="setting-icon">
            <Icon size={14} />
          </div>
        )}
        <div className="setting-text">
          <span className="setting-label">{label}</span>
          {description && <span className="setting-description">{description}</span>}
        </div>
      </div>
      <div className="setting-card-right">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function BudgetSettings({
  config: providedConfig,
  isLoading,
  onSave,
  onReset,
}: BudgetSettingsProps) {
  // Use default config if none provided
  const config = providedConfig || DEFAULT_CONFIG;
  const isDisabled = !config.enabled;

  const updateDefaults = (updates: Partial<BudgetConfig['defaults']>) => {
    onSave({ defaults: { ...config.defaults, ...updates } });
  };

  const moveDegradationStep = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= config.degradationSteps.length) return;
    const steps = [...config.degradationSteps];
    [steps[fromIndex], steps[toIndex]] = [steps[toIndex], steps[fromIndex]];
    onSave({ degradationSteps: steps });
  };

  const removeDegradationStep = (index: number) => {
    const steps = config.degradationSteps.filter((_, i) => i !== index);
    onSave({ degradationSteps: steps });
  };

  const addDegradationStep = (type: string) => {
    const step: DegradationStep = type === 'switch-model'
      ? { type, model: 'claude-3-5-haiku-20241022' }
      : { type };
    onSave({ degradationSteps: [...config.degradationSteps, step] });
  };

  if (isLoading) {
    return (
      <div className="budget-settings-loading">
        <div className="loading-pulse" />
        <div className="loading-pulse" />
        <div className="loading-pulse" />
      </div>
    );
  }

  return (
    <div className="budget-settings">
      {/* Master Toggle */}
      <div className="master-toggle-card">
        <div className="master-toggle-info">
          <div className="master-icon">
            <Gauge size={20} />
          </div>
          <div className="master-text">
            <span className="master-label">Budget Allocator</span>
            <span className="master-description">
              Track and manage Claude API quota usage
            </span>
          </div>
        </div>
        <NeonToggle
          checked={config.enabled}
          onChange={(enabled) => onSave({ enabled })}
          label="Enable budget allocator"
        />
      </div>

      {/* All settings gray out when disabled */}
      <div className={`settings-sections ${isDisabled ? 'disabled' : ''}`}>
        {/* Budget Caps */}
        <section>
          <SectionHeader title="FUEL RESERVES" icon={Gauge} />
          <div className="sliders-group">
            <NeonSlider
              label="Session Cap"
              description="Max 5h quota per session"
              value={config.defaults.sessionCapPercent5h}
              min={10} max={100} step={5}
              format={(v) => `${v}%`}
              onChange={(v) => updateDefaults({ sessionCapPercent5h: v })}
              disabled={isDisabled}
              color="#00C9A7"
            />
            <NeonSlider
              label="Workspace Cap"
              description="Max weekly quota per workspace"
              value={config.defaults.workspaceCapPercentWeekly}
              min={10} max={100} step={5}
              format={(v) => `${v}%`}
              onChange={(v) => updateDefaults({ workspaceCapPercentWeekly: v })}
              disabled={isDisabled}
              color="#9DA3BE"
            />
            <NeonSlider
              label="Reserve Buffer"
              description="Reserved for urgent tasks"
              value={config.defaults.reservePercentWeekly}
              min={0} max={50} step={5}
              format={(v) => `${v}%`}
              onChange={(v) => updateDefaults({ reservePercentWeekly: v })}
              disabled={isDisabled}
              color="#3DD68C"
            />
          </div>
        </section>

        {/* Warning Thresholds */}
        <section>
          <SectionHeader title="ALERT THRESHOLDS" icon={AlertTriangle} />
          <div className="sliders-group">
            {[
              { label: 'Caution', color: '#9DA3BE', index: 0 },
              { label: 'Warning', color: '#F7A84A', index: 1 },
              { label: 'Critical', color: '#F7678E', index: 2 },
            ].map(({ label, color, index }) => (
              <NeonSlider
                key={label}
                label={`${label} Level`}
                description={`Trigger ${label.toLowerCase()} at this usage`}
                value={config.defaults.warnThresholds[index]}
                min={index === 0 ? 30 : config.defaults.warnThresholds[index - 1] + 5}
                max={100}
                step={5}
                format={(v) => `${v}%`}
                onChange={(v) => {
                  const thresholds = [...config.defaults.warnThresholds] as [number, number, number];
                  thresholds[index] = v;
                  updateDefaults({ warnThresholds: thresholds });
                }}
                disabled={isDisabled}
                color={color}
              />
            ))}
          </div>
        </section>

        {/* Enforcement Mode */}
        <section>
          <SectionHeader title="ENFORCEMENT" icon={Shield} />
          <div className="enforcement-toggle">
            <button
              className={`enforcement-option ${config.defaultEnforcement === 'soft' ? 'active' : ''}`}
              onClick={() => onSave({ defaultEnforcement: 'soft' })}
              disabled={isDisabled}
            >
              <span className="enforcement-label">SOFT</span>
              <span className="enforcement-desc">Warns but allows override</span>
            </button>
            <button
              className={`enforcement-option hard ${config.defaultEnforcement === 'hard' ? 'active' : ''}`}
              onClick={() => onSave({ defaultEnforcement: 'hard' })}
              disabled={isDisabled}
            >
              <span className="enforcement-label">HARD</span>
              <span className="enforcement-desc">Blocks at limits</span>
            </button>
          </div>
        </section>

        {/* Degradation Ladder */}
        <section>
          <SectionHeader title="DEGRADATION LADDER" icon={TrendingDown} />
          <p className="section-note">Steps activate as usage increases</p>

          <div className="degradation-list">
            {config.degradationSteps.map((step, index) => (
              <div key={`${step.type}-${index}`} className="degradation-item">
                <div className="degradation-order">
                  <button
                    onClick={() => moveDegradationStep(index, -1)}
                    disabled={isDisabled || index === 0}
                    className="order-btn"
                  >
                    <ChevronUp size={10} />
                  </button>
                  <span className="order-num">{index + 1}</span>
                  <button
                    onClick={() => moveDegradationStep(index, 1)}
                    disabled={isDisabled || index === config.degradationSteps.length - 1}
                    className="order-btn"
                  >
                    <ChevronDown size={10} />
                  </button>
                </div>
                <span className="degradation-label">
                  {STEP_LABELS[step.type] || step.type}
                </span>
                <button
                  onClick={() => removeDegradationStep(index)}
                  disabled={isDisabled}
                  className="degradation-remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {/* Add step */}
            {config.degradationSteps.length < STEP_TYPES.length && !isDisabled && (
              <div className="add-step-container">
                <span className="add-step-label">Add step:</span>
                <div className="add-step-options">
                  {STEP_TYPES.filter(t => !config.degradationSteps.some(s => s.type === t)).map(type => (
                    <button
                      key={type}
                      onClick={() => addDegradationStep(type)}
                      className="add-step-btn"
                    >
                      <Plus size={10} />
                      {STEP_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Queue Behavior */}
        <section>
          <SectionHeader title="QUEUE CONTROL" icon={List} />
          <div className="sliders-group">
            <NeonSlider
              label="Auto-Pause"
              description="Pause queue at 5h usage level"
              value={config.queue.autoPauseAtPercent5h}
              min={50} max={100} step={5}
              format={(v) => `${v}%`}
              onChange={(v) => onSave({ queue: { ...config.queue, autoPauseAtPercent5h: v } })}
              disabled={isDisabled}
              color="#F7A84A"
            />
          </div>
          <SettingCard
            label="Show Projected Cost"
            description="Display cost estimates for queue"
            icon={Clock}
            disabled={isDisabled}
          >
            <NeonToggle
              checked={config.queue.showProjectedCost}
              onChange={(v) => onSave({ queue: { ...config.queue, showProjectedCost: v } })}
              label="Show projected cost"
            />
          </SettingCard>
        </section>

        {/* Cost Estimation */}
        <section>
          <SectionHeader title="ESTIMATION" icon={Calculator} />
          <div className="estimation-toggle">
            {(['optimistic', 'average', 'conservative'] as const).map(method => (
              <button
                key={method}
                className={`estimation-option ${config.estimation.method === method ? 'active' : ''}`}
                onClick={() => onSave({ estimation: { ...config.estimation, method } })}
                disabled={isDisabled}
              >
                {method}
              </button>
            ))}
          </div>
          <p className="section-note">
            {config.estimation.method === 'conservative'
              ? '1.5× average — safer but restrictive'
              : config.estimation.method === 'optimistic'
                ? '0.7× average — allows more messages'
                : 'Historical average cost per message'}
          </p>
          <SettingCard
            label="Pre-Send Estimate"
            description="Show cost before sending"
            icon={Zap}
            disabled={isDisabled}
          >
            <NeonToggle
              checked={config.estimation.showPreSendEstimate}
              onChange={(v) => onSave({ estimation: { ...config.estimation, showPreSendEstimate: v } })}
              label="Show pre-send estimate"
            />
          </SettingCard>
        </section>

        {/* Reset */}
        <section>
          <button onClick={onReset} className="reset-btn" disabled={isDisabled}>
            <RotateCcw size={12} />
            Reset All to Defaults
          </button>
        </section>
      </div>

      {/* Info note */}
      <div className="budget-info-note">
        <AlertTriangle size={12} />
        <span>
          All estimates are approximate. Claude API does not expose absolute token budgets.
        </span>
      </div>

      <style>{budgetSettingsStyles}</style>
    </div>
  );
}

const budgetSettingsStyles = `
  .budget-settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .budget-settings-loading {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .loading-pulse {
    height: 48px;
    background: linear-gradient(90deg, var(--surface-raised, #13141C) 25%, var(--surface-overlay, #1A1B26) 50%, var(--surface-raised, #13141C) 75%);
    background-size: 200% 100%;
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MASTER TOGGLE
     ═══════════════════════════════════════════════════════════════════════════ */

  .master-toggle-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background: linear-gradient(135deg, var(--surface-raised, #13141C) 0%, var(--surface-overlay, #1A1B26) 100%);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 10px;
  }

  .master-toggle-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .master-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--accent-primary, #00C9A7) 0%, var(--text-secondary, #9DA3BE) 100%);
    border-radius: 8px;
    color: var(--surface-overlay, #1A1B26);
  }

  .master-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .master-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #E2E4F0);
  }

  .master-description {
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SECTION HEADER
     ═══════════════════════════════════════════════════════════════════════════ */

  .section-header-budget {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .section-header-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-default, #292E44), transparent);
  }

  .section-header-content {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--text-tertiary, #5C6080);
  }

  .settings-sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
    transition: opacity 0.2s ease;
  }

  .settings-sections.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .section-note {
    font-size: 10px;
    color: var(--border-strong, #3D4163);
    margin-bottom: 12px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     NEON TOGGLE
     ═══════════════════════════════════════════════════════════════════════════ */

  .neon-toggle {
    width: 44px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .toggle-track {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 12px;
    position: relative;
    transition: all 0.2s ease;
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: var(--text-tertiary, #5C6080);
    border-radius: 9px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .toggle-glow {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 9px;
    opacity: 0;
    transition: all 0.2s ease;
  }

  .neon-toggle.active .toggle-track {
    border-color: var(--toggle-color);
    box-shadow: 0 0 12px var(--toggle-glow);
  }

  .neon-toggle.active .toggle-thumb {
    left: 22px;
    background: var(--toggle-color);
    box-shadow: 0 0 8px var(--toggle-glow);
  }

  .neon-toggle.active .toggle-glow {
    left: 22px;
    opacity: 0.5;
    background: var(--toggle-color);
    filter: blur(6px);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     NEON SLIDER
     ═══════════════════════════════════════════════════════════════════════════ */

  .sliders-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .neon-slider-container {
    padding: 12px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 8px;
    transition: opacity 0.2s ease;
  }

  .neon-slider-container.disabled {
    opacity: 0.5;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .slider-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slider-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-primary, #E2E4F0);
  }

  .slider-description {
    font-size: 9px;
    color: var(--border-strong, #3D4163);
  }

  .slider-value {
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .slider-track-wrapper {
    position: relative;
    height: 6px;
  }

  .neon-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    background: var(--surface-base, #0D0E14);
    border-radius: 3px;
    outline: none;
    position: relative;
    z-index: 2;
  }

  .neon-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--slider-color);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px var(--slider-color);
    position: relative;
    z-index: 3;
  }

  .neon-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--slider-color);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px var(--slider-color);
  }

  .slider-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 6px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SETTING CARD
     ═══════════════════════════════════════════════════════════════════════════ */

  .setting-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 8px;
    margin-top: 12px;
    transition: opacity 0.2s ease;
  }

  .setting-card.disabled {
    opacity: 0.5;
  }

  .setting-card-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .setting-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    color: var(--text-tertiary, #5C6080);
  }

  .setting-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary, #9DA3BE);
  }

  .setting-description {
    font-size: 9px;
    color: var(--border-strong, #3D4163);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ENFORCEMENT TOGGLE
     ═══════════════════════════════════════════════════════════════════════════ */

  .enforcement-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .enforcement-option {
    padding: 12px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    font-family: inherit;
  }

  .enforcement-option:hover:not(:disabled) {
    border-color: var(--border-strong, #3D4163);
  }

  .enforcement-option.active {
    border-color: var(--semantic-warning, #F7A84A);
    background: rgba(247, 168, 74, 0.05);
    box-shadow: 0 0 12px rgba(247, 168, 74, 0.15);
  }

  .enforcement-option.hard.active {
    border-color: var(--semantic-error, #F7678E);
    background: rgba(247, 103, 142, 0.05);
    box-shadow: 0 0 12px rgba(247, 103, 142, 0.15);
  }

  .enforcement-label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-tertiary, #5C6080);
    margin-bottom: 4px;
  }

  .enforcement-option.active .enforcement-label {
    color: var(--semantic-warning, #F7A84A);
  }

  .enforcement-option.hard.active .enforcement-label {
    color: var(--semantic-error, #F7678E);
  }

  .enforcement-desc {
    font-size: 9px;
    color: var(--border-strong, #3D4163);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DEGRADATION LADDER
     ═══════════════════════════════════════════════════════════════════════════ */

  .degradation-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .degradation-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
  }

  .degradation-order {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .order-btn {
    width: 16px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--border-strong, #3D4163);
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
  }

  .order-btn:hover:not(:disabled) {
    color: var(--accent-primary, #00C9A7);
  }

  .order-btn:disabled {
    opacity: 0.3;
  }

  .order-num {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent-primary, #00C9A7);
    text-shadow: 0 0 6px rgba(0, 201, 167, 0.4);
  }

  .degradation-label {
    flex: 1;
    font-size: 10px;
    color: var(--text-secondary, #9DA3BE);
  }

  .degradation-remove {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--border-strong, #3D4163);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .degradation-remove:hover:not(:disabled) {
    background: rgba(247, 103, 142, 0.1);
    color: var(--semantic-error, #F7678E);
  }

  .add-step-container {
    padding: 10px;
    background: var(--surface-base, #0D0E14);
    border: 1px dashed var(--border-default, #292E44);
    border-radius: 6px;
    margin-top: 6px;
  }

  .add-step-label {
    display: block;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--border-strong, #3D4163);
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .add-step-options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .add-step-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 9px;
    font-family: inherit;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 4px;
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-step-btn:hover {
    border-color: var(--accent-primary, #00C9A7);
    color: var(--accent-primary, #00C9A7);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ESTIMATION TOGGLE
     ═══════════════════════════════════════════════════════════════════════════ */

  .estimation-toggle {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 8px;
  }

  .estimation-option {
    padding: 10px 8px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    text-transform: capitalize;
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .estimation-option:hover:not(:disabled) {
    border-color: var(--border-strong, #3D4163);
  }

  .estimation-option.active {
    border-color: var(--accent-primary, #00C9A7);
    color: var(--accent-primary, #00C9A7);
    background: rgba(0, 201, 167, 0.05);
    box-shadow: 0 0 10px rgba(0, 201, 167, 0.15);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESET BUTTON
     ═══════════════════════════════════════════════════════════════════════════ */

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    background: transparent;
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    font-family: inherit;
    font-size: 11px;
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-btn:hover:not(:disabled) {
    border-color: var(--border-strong, #3D4163);
    color: var(--text-secondary, #9DA3BE);
  }

  .reset-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     INFO NOTE
     ═══════════════════════════════════════════════════════════════════════════ */

  .budget-info-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    background: rgba(247, 168, 74, 0.05);
    border: 1px solid rgba(247, 168, 74, 0.2);
    border-radius: 8px;
  }

  .budget-info-note svg {
    color: var(--semantic-warning, #F7A84A);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .budget-info-note span {
    font-size: 10px;
    color: var(--text-secondary, #9DA3BE);
    line-height: 1.4;
  }
`;

export default BudgetSettings;
