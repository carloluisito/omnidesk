/**
 * PhaseNavigator - Mission Control workflow stepper
 *
 * Shows PROMPT → REVIEW → SHIP phases with visual indicators,
 * badge counts, and keyboard navigation (1, 2, 3).
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, GitCompare, Rocket, ChevronRight, GitPullRequest, GitMerge } from 'lucide-react';
import { cn } from '../../lib/cn';

export type Phase = 'prompt' | 'review' | 'ship';

interface PhaseConfig {
  id: Phase;
  label: string;
  shortcut: string;
  icon: React.ElementType;
}

const phases: PhaseConfig[] = [
  { id: 'prompt', label: 'Prompt', shortcut: '1', icon: MessageSquare },
  { id: 'review', label: 'Review', shortcut: '2', icon: GitCompare },
  { id: 'ship', label: 'Ship', shortcut: '3', icon: Rocket },
];

export interface ExistingPR {
  url: string;
  number: number;
  title: string;
  state: string;
}

interface PhaseNavigatorProps {
  activePhase: Phase;
  onPhaseChange: (phase: Phase) => void;
  messageCount?: number;
  fileCount?: number;
  warningCount?: number;
  isRunning?: boolean;
  canReview?: boolean;
  canShip?: boolean;
  existingPR?: ExistingPR | null;
}

export function PhaseNavigator({
  activePhase,
  onPhaseChange,
  messageCount = 0,
  fileCount = 0,
  warningCount = 0,
  isRunning = false,
  canReview = true,
  canShip = true,
  existingPR = null,
}: PhaseNavigatorProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === '1') onPhaseChange('prompt');
      if (e.key === '2' && canReview) onPhaseChange('review');
      if (e.key === '3' && canShip) onPhaseChange('ship');
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPhaseChange, canReview, canShip]);

  const getBadge = (phase: Phase): number | undefined => {
    switch (phase) {
      case 'prompt':
        return messageCount > 0 ? messageCount : undefined;
      case 'review':
        return fileCount > 0 ? fileCount : undefined;
      case 'ship':
        return warningCount > 0 ? warningCount : undefined;
      default:
        return undefined;
    }
  };

  const isDisabled = (phase: Phase): boolean => {
    if (phase === 'review') return !canReview;
    if (phase === 'ship') return !canShip;
    return false;
  };

  const getPhaseColors = (phase: Phase, isActive: boolean) => {
    const colorMap = {
      prompt: {
        bg: isActive ? 'bg-blue-500/20' : 'bg-white/5',
        ring: isActive ? 'ring-blue-500/40' : 'ring-white/10',
        text: isActive ? 'text-blue-400' : 'text-white/60',
        glow: isActive ? 'shadow-[0_0_20px_rgba(59,130,246,0.3)]' : '',
      },
      review: {
        bg: isActive ? 'bg-amber-500/20' : 'bg-white/5',
        ring: isActive ? 'ring-amber-500/40' : 'ring-white/10',
        text: isActive ? 'text-amber-400' : 'text-white/60',
        glow: isActive ? 'shadow-[0_0_20px_rgba(245,158,11,0.3)]' : '',
      },
      ship: {
        bg: isActive ? 'bg-emerald-500/20' : 'bg-white/5',
        ring: isActive ? 'ring-emerald-500/40' : 'ring-white/10',
        text: isActive ? 'text-emerald-400' : 'text-white/60',
        glow: isActive ? 'shadow-[0_0_20px_rgba(16,185,129,0.3)]' : '',
      },
    };
    return colorMap[phase];
  };

  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.03] p-1.5 ring-1 ring-white/10">
        {phases.map((phase, index) => {
          const isActive = activePhase === phase.id;
          const disabled = isDisabled(phase.id);
          const badge = getBadge(phase.id);
          const colors = getPhaseColors(phase.id, isActive);
          const Icon = phase.icon;

          return (
            <div key={phase.id} className="flex items-center">
              <motion.button
                onClick={() => !disabled && onPhaseChange(phase.id)}
                disabled={disabled}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ring-1',
                  colors.bg,
                  colors.ring,
                  colors.text,
                  colors.glow,
                  disabled && 'opacity-40 cursor-not-allowed',
                  !disabled && !isActive && 'hover:bg-white/10 hover:ring-white/20'
                )}
                whileHover={!disabled ? { scale: 1.02 } : undefined}
                whileTap={!disabled ? { scale: 0.98 } : undefined}
              >
                {/* Running indicator */}
                {phase.id === 'prompt' && isRunning && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                  </span>
                )}

                {/* PR exists indicator on Ship phase */}
                {phase.id === 'ship' && existingPR && (
                  <span
                    className={cn(
                      'absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[#05070c]',
                      existingPR.state === 'merged'
                        ? 'bg-purple-500'
                        : existingPR.state === 'closed'
                        ? 'bg-red-500'
                        : 'bg-emerald-500'
                    )}
                    title={`PR #${existingPR.number}: ${existingPR.title} (${existingPR.state || 'open'})`}
                  >
                    {existingPR.state === 'merged' ? (
                      <GitMerge className="h-3 w-3 text-white" />
                    ) : (
                      <GitPullRequest className="h-3 w-3 text-white" />
                    )}
                  </span>
                )}

                <Icon className="h-4 w-4" />
                <span>{phase.label}</span>

                {/* Badge */}
                {badge !== undefined && (
                  <span
                    className={cn(
                      'ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                      phase.id === 'ship' && warningCount > 0
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-white/10 text-white/70'
                    )}
                  >
                    {badge}
                  </span>
                )}

                {/* Keyboard hint */}
                <span className="hidden sm:inline-flex ml-1 text-xs opacity-50 font-mono">
                  {phase.shortcut}
                </span>
              </motion.button>

              {/* Connector */}
              {index < phases.length - 1 && (
                <ChevronRight className="mx-1 h-4 w-4 text-white/20" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
