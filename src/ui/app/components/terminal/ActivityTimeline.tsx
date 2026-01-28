import { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ToolActivity } from '../../store/terminalStore';
import { ToolActivityItem } from './ToolActivityItem';
import { AgentActivityGroup } from './AgentActivityGroup';

// Types for grouped activities
interface AgentGroup {
  type: 'agent';
  agentActivity: ToolActivity;
  childActivities: ToolActivity[];
  agentName: string;
}

type GroupedActivity = { type: 'regular'; activity: ToolActivity } | AgentGroup;

// Extract agent name from Task tool target (format: "agent-name: description" or just "description")
function extractAgentName(target: string): string {
  const colonIndex = target.indexOf(':');
  if (colonIndex > 0) {
    return target.slice(0, colonIndex).trim();
  }
  return 'Agent';
}

// Group activities: Task tool activities become AgentGroups with subsequent activities as children
// Activities are grouped based on timing - activities that start after an agent starts
// and before it completes (or another agent starts) are children of that agent
function groupActivities(activities: ToolActivity[]): GroupedActivity[] {
  const result: GroupedActivity[] = [];
  let currentAgentGroup: AgentGroup | null = null;

  for (const activity of activities) {
    if (activity.tool === 'Task') {
      // If we had a previous agent group, push it
      if (currentAgentGroup) {
        result.push(currentAgentGroup);
      }
      // Start a new agent group
      currentAgentGroup = {
        type: 'agent',
        agentActivity: activity,
        childActivities: [],
        agentName: extractAgentName(activity.target),
      };
    } else if (currentAgentGroup) {
      // We're inside an agent group - always add as child
      currentAgentGroup.childActivities.push(activity);
    } else {
      // Regular activity, not inside an agent group
      result.push({ type: 'regular', activity });
    }
  }

  // Don't forget the last agent group if it exists
  if (currentAgentGroup) {
    result.push(currentAgentGroup);
  }

  return result;
}

interface ActivityTimelineProps {
  activities: ToolActivity[];
  isStreaming: boolean;
  highlighted?: boolean;
}

export const ActivityTimeline = memo(function ActivityTimeline({ activities, isStreaming, highlighted }: ActivityTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Track expanded state for each agent group (keyed by agent activity ID)
  const [agentExpanded, setAgentExpanded] = useState<Record<string, boolean>>({});

  // Track completion times for auto-collapse (keyed by agent activity ID)
  const completionTimesRef = useRef<Record<string, number>>({});

  // Group activities for rendering
  const groupedActivities = useMemo(() => groupActivities(activities), [activities]);

  // Handle auto-expand when running, auto-collapse 3s after completion
  useEffect(() => {
    const newExpanded = { ...agentExpanded };
    let hasChanges = false;

    for (const grouped of groupedActivities) {
      if (grouped.type !== 'agent') continue;

      const agentId = grouped.agentActivity.id;
      const isRunning = grouped.agentActivity.status === 'running';
      const isError = grouped.agentActivity.status === 'error';
      const isComplete = grouped.agentActivity.status === 'complete';

      // Auto-expand when running
      if (isRunning && !newExpanded[agentId]) {
        newExpanded[agentId] = true;
        hasChanges = true;
        // Clear any pending collapse
        delete completionTimesRef.current[agentId];
      }

      // Keep expanded on error
      if (isError && newExpanded[agentId] === undefined) {
        newExpanded[agentId] = true;
        hasChanges = true;
      }

      // Track completion time for auto-collapse
      if (isComplete && !completionTimesRef.current[agentId]) {
        completionTimesRef.current[agentId] = Date.now();
      }
    }

    if (hasChanges) {
      setAgentExpanded(newExpanded);
    }
  }, [groupedActivities]);

  // Set up auto-collapse timer
  useEffect(() => {
    const checkAutoCollapse = () => {
      const now = Date.now();
      const toCollapse: string[] = [];

      for (const [agentId, completionTime] of Object.entries(completionTimesRef.current)) {
        // Find the corresponding grouped activity
        const grouped = groupedActivities.find(
          (g) => g.type === 'agent' && g.agentActivity.id === agentId
        );

        // Only auto-collapse if not error and 3s have passed
        if (
          grouped &&
          grouped.type === 'agent' &&
          grouped.agentActivity.status === 'complete' &&
          now - completionTime >= 3000
        ) {
          toCollapse.push(agentId);
        }
      }

      if (toCollapse.length > 0) {
        setAgentExpanded((prev) => {
          const updated = { ...prev };
          for (const id of toCollapse) {
            updated[id] = false;
            delete completionTimesRef.current[id];
          }
          return updated;
        });
      }
    };

    const timer = setInterval(checkAutoCollapse, 1000);
    return () => clearInterval(timer);
  }, [groupedActivities]);

  // Toggle handler for agent groups
  const handleToggleAgent = useCallback((agentId: string) => {
    setAgentExpanded((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
    // If manually toggling, cancel any pending auto-collapse
    delete completionTimesRef.current[agentId];
  }, []);

  // Don't show anything if no activities and not streaming
  if (activities.length === 0 && !isStreaming) return null;

  // Count running vs complete activities
  const runningCount = activities.filter((a) => a.status === 'running').length;
  const completeCount = activities.filter((a) => a.status === 'complete').length;
  const errorCount = activities.filter((a) => a.status === 'error').length;
  const totalCount = activities.length;
  const doneCount = completeCount + errorCount;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Calculate elapsed time for running activities
  const elapsedTime = useMemo(() => {
    if (!isStreaming || activities.length === 0) return null;
    const firstActivity = activities[0];
    if (!firstActivity?.timestamp) return null;
    const start = new Date(firstActivity.timestamp).getTime();
    const now = Date.now();
    const seconds = Math.floor((now - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }, [isStreaming, activities]);

  return (
    <div
      id="activity-timeline"
      tabIndex={0}
      className={cn(
        "outline-none focus:ring-1 focus:ring-white/20 rounded-lg",
        highlighted && "highlight-activity"
      )}
    >
      {/* Minimal header */}
      <div className="space-y-1.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center gap-1.5 text-xs transition-colors w-full',
            'text-white/50 hover:text-white/80'
          )}
        >
          <ChevronRight
            className={cn(
              'h-3 w-3 transition-transform flex-shrink-0',
              isExpanded && 'rotate-90'
            )}
          />
          <span className="text-white/40">
            {doneCount}/{totalCount} steps
          </span>

          {/* Status indicators */}
          <div className="flex items-center gap-2 ml-auto">
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Loader2 className="h-3 w-3 animate-spin" />
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <XCircle className="h-3 w-3" />
                {errorCount}
              </span>
            )}
            {elapsedTime && (
              <span className="text-white/30 text-[10px]">
                {elapsedTime}
              </span>
            )}
          </div>
        </button>

        {/* Thinner progress bar */}
        {isStreaming && totalCount > 0 && (
          <div className="h-px bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                errorCount > 0 ? "bg-red-500" : "bg-emerald-500"
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Activities list - thread line style */}
      {isExpanded && activities.length > 0 && (
        <div className="border-l border-white/[0.06] pl-4 ml-2 mt-2 space-y-1">
          {groupedActivities.map((grouped) => {
            if (grouped.type === 'agent') {
              const agentId = grouped.agentActivity.id;
              const isAgentExpanded = agentExpanded[agentId] ?? grouped.agentActivity.status === 'running';
              return (
                <AgentActivityGroup
                  key={agentId}
                  agentActivity={grouped.agentActivity}
                  childActivities={grouped.childActivities}
                  agentName={grouped.agentName}
                  isExpanded={isAgentExpanded}
                  onToggleExpand={() => handleToggleAgent(agentId)}
                />
              );
            } else {
              return (
                <ToolActivityItem key={grouped.activity.id} activity={grouped.activity} />
              );
            }
          })}
        </div>
      )}

      {/* Empty state when streaming but no activities yet */}
      {isExpanded && activities.length === 0 && isStreaming && (
        <div className="text-xs text-white/30 mt-1.5 ml-3 italic">
          Waiting for tool activity...
        </div>
      )}
    </div>
  );
});
