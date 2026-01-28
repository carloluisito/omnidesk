import { memo } from 'react';
import { Bot, ChevronDown, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/cn';
import { ToolActivity } from '../../store/terminalStore';
import { ToolActivityItem } from './ToolActivityItem';

interface AgentActivityGroupProps {
  agentActivity: ToolActivity;
  childActivities: ToolActivity[];
  agentName: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const AgentActivityGroup = memo(function AgentActivityGroup({
  agentActivity,
  childActivities,
  agentName,
  isExpanded,
  onToggleExpand,
}: AgentActivityGroupProps) {
  const isRunning = agentActivity.status === 'running';
  const isComplete = agentActivity.status === 'complete';
  const isError = agentActivity.status === 'error';

  // Calculate duration for completed activities
  const duration = agentActivity.timestamp && agentActivity.completedAt
    ? Math.round(
        (new Date(agentActivity.completedAt).getTime() -
          new Date(agentActivity.timestamp).getTime()) /
          1000
      )
    : null;

  return (
    <div>
      {/* Minimal inline header row */}
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-1.5 w-full text-left py-0.5 group/agent"
      >
        <Bot className="h-3.5 w-3.5 text-blue-400/70 flex-shrink-0" />

        <span className="text-xs text-white/60 truncate flex-1">
          {agentName}
        </span>

        {/* Status icon */}
        {isRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
        {isComplete && <CheckCircle className="h-3 w-3 text-white/30" />}
        {isError && <XCircle className="h-3 w-3 text-red-400" />}

        {/* Duration */}
        {duration !== null && (
          <span className="text-[10px] text-white/30">{duration}s</span>
        )}

        <ChevronDown
          className={cn(
            'h-3 w-3 text-white/30 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Child activities */}
      <AnimatePresence initial={false}>
        {isExpanded && childActivities.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-5 space-y-0.5">
              {childActivities.map((activity) => (
                <ToolActivityItem
                  key={activity.id}
                  activity={activity}
                  isNested
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
