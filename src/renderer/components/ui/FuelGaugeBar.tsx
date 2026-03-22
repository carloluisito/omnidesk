/**
 * FuelGaugeBar - 5-segment horizontal gauge visualization
 *
 * Fills based on utilization (0-1), color-coded by severity.
 * Decorative only (aria-hidden).
 */

interface FuelGaugeBarProps {
  utilization: number; // 0-1
  severity: 'normal' | 'elevated' | 'critical';
}

const SEGMENT_COUNT = 5;

const severityColors: Record<FuelGaugeBarProps['severity'], string> = {
  normal:   'var(--semantic-success)',
  elevated: 'var(--semantic-warning)',
  critical: 'var(--semantic-error)',
};

export function FuelGaugeBar({ utilization, severity }: FuelGaugeBarProps) {
  const clamped = Math.max(0, Math.min(1, utilization));
  const filledSegments = Math.round(clamped * SEGMENT_COUNT);
  const color = severityColors[severity];

  return (
    <div className="fuel-gauge-bar" aria-hidden="true">
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <div
          key={i}
          className={`fuel-gauge-segment ${i < filledSegments ? 'filled' : 'empty'}`}
          style={{
            background: i < filledSegments ? color : 'transparent',
            borderColor: i < filledSegments ? color : 'var(--border-default)',
            boxShadow: i < filledSegments && severity === 'critical'
              ? `0 0 4px ${color}60`
              : 'none',
          }}
        />
      ))}

      <style>{`
        .fuel-gauge-bar {
          display: flex;
          gap: 2px;
          align-items: center;
        }

        .fuel-gauge-segment {
          width: 6px;
          height: 16px;
          border-radius: 1px;
          border: 1px solid var(--border-default);
          transition: background 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
        }
      `}</style>
    </div>
  );
}
