import { useState, memo } from 'react';
import {
  FileText,
  Pencil,
  FilePlus,
  Terminal,
  Search,
  FileSearch,
  Globe,
  CircleDot,
  Loader2,
  ChevronDown,
  ListTodo,
  Bot,
  Copy,
  Check,
  AlertTriangle,
  Puzzle,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { ToolActivity } from '../../store/terminalStore';
import { sanitizeSensitiveData } from '../../lib/sanitize';

// Tool configuration with icons and colors
const TOOL_CONFIG: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  Read: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  Edit: { icon: Pencil, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  Write: { icon: FilePlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  Bash: { icon: Terminal, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  Glob: { icon: Search, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  Grep: { icon: FileSearch, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  WebFetch: { icon: Globe, color: 'text-teal-400', bg: 'bg-teal-500/10' },
  WebSearch: { icon: Globe, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  Task: { icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  TodoWrite: { icon: ListTodo, color: 'text-lime-400', bg: 'bg-lime-500/10' },
  MCP: { icon: Puzzle, color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

const DEFAULT_CONFIG = { icon: CircleDot, color: 'text-white/50', bg: 'bg-white/5' };

// Format human-readable descriptions based on tool, target, and status
function formatDescription(
  tool: string,
  target: string,
  status: 'running' | 'complete' | 'error',
  isMCPTool?: boolean,
  mcpServerName?: string,
  mcpToolDescription?: string
): string {
  // SEC-03: Sanitize target before display
  const sanitizedTarget = sanitizeSensitiveData(target);
  const isRunning = status === 'running';

  // Handle MCP tools
  if (isMCPTool && mcpServerName) {
    const toolName = tool || 'Unknown Tool';
    const via = ` via ${mcpServerName}`;
    if (mcpToolDescription) {
      return isRunning ? `${toolName}${via}...` : `${toolName}${via}`;
    }
    return isRunning ? `${toolName}${via}...` : `${toolName}${via}`;
  }

  switch (tool) {
    case 'Read':
      return isRunning ? `Reading ${sanitizedTarget}...` : `Read ${sanitizedTarget}`;
    case 'Edit':
      return isRunning ? `Editing ${sanitizedTarget}...` : `Edited ${sanitizedTarget}`;
    case 'Write':
      return isRunning ? `Writing ${sanitizedTarget}...` : `Wrote ${sanitizedTarget}`;
    case 'Bash': {
      // Show command preview for running, generic for complete
      const cmdPreview = sanitizedTarget.length > 30 ? sanitizedTarget.slice(0, 30) + '...' : sanitizedTarget;
      return isRunning ? `Running: ${cmdPreview}` : 'Ran command';
    }
    case 'Glob':
      return isRunning ? `Searching for ${sanitizedTarget}...` : 'Found files';
    case 'Grep': {
      // Extract pattern from target if possible
      const patternPreview = sanitizedTarget.length > 20 ? sanitizedTarget.slice(0, 20) + '...' : sanitizedTarget;
      return isRunning ? `Searching for '${patternPreview}'...` : 'Searched';
    }
    case 'WebFetch': {
      // Extract domain from URL
      try {
        const url = new URL(sanitizedTarget);
        return isRunning ? `Fetching ${url.hostname}...` : 'Fetched URL';
      } catch {
        return isRunning ? `Fetching URL...` : 'Fetched URL';
      }
    }
    case 'WebSearch':
      return isRunning ? 'Searching web...' : 'Searched web';
    case 'Task': {
      // Target format: "agent-name: description" or just "description"
      const colonIndex = sanitizedTarget.indexOf(':');
      if (colonIndex > 0) {
        const agentName = sanitizedTarget.slice(0, colonIndex).trim();
        const taskDesc = sanitizedTarget.slice(colonIndex + 1).trim();
        const shortDesc = taskDesc.length > 30 ? taskDesc.slice(0, 30) + '...' : taskDesc;
        return isRunning
          ? `Agent ${agentName}: ${shortDesc}`
          : `Agent ${agentName} completed`;
      }
      return isRunning ? 'Running task...' : 'Task completed';
    }
    case 'TodoWrite':
      return isRunning ? 'Updating tasks...' : 'Updated tasks';
    default:
      // Fallback: use tool name with target
      return isRunning ? `${tool} ${sanitizedTarget}...` : `${tool} ${sanitizedTarget}`;
  }
}

interface ToolActivityItemProps {
  activity: ToolActivity;
  isNested?: boolean;  // When true, use smaller styling for nested items inside AgentActivityGroup
}

export const ToolActivityItem = memo(function ToolActivityItem({ activity, isNested = false }: ToolActivityItemProps) {
  const [showOutput, setShowOutput] = useState(activity.status === 'error'); // Auto-expand errors
  const [showInput, setShowInput] = useState(false);
  const [showMCPOutput, setShowMCPOutput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Use MCP config if it's an MCP tool
  const config = activity.isMCPTool ? TOOL_CONFIG['MCP'] : (TOOL_CONFIG[activity.tool] || DEFAULT_CONFIG);
  const Icon = config.icon;

  const handleCopyError = async () => {
    if (activity.error) {
      try {
        await navigator.clipboard.writeText(activity.error);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleCopyInput = async () => {
    if (activity.mcpInput) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(activity.mcpInput, null, 2));
        setCopiedInput(true);
        setTimeout(() => setCopiedInput(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleCopyOutput = async () => {
    if (activity.mcpOutput) {
      try {
        await navigator.clipboard.writeText(activity.mcpOutput);
        setCopiedOutput(true);
        setTimeout(() => setCopiedOutput(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  return (
    <div className={cn(
      'py-0.5 px-1 rounded-md hover:bg-white/[0.03] transition-colors',
      activity.status === 'error' && 'bg-red-500/5'
    )}>
      <div className="flex items-center gap-2">
        {/* Status icon */}
        {activity.status === 'running' ? (
          <Loader2 className={cn(isNested ? 'h-3 w-3' : 'h-3.5 w-3.5', 'animate-spin opacity-60', config.color)} />
        ) : activity.status === 'error' ? (
          <AlertTriangle className={cn(isNested ? 'h-3 w-3' : 'h-3.5 w-3.5', 'text-red-400 opacity-60')} />
        ) : (
          <Icon className={cn(isNested ? 'h-3 w-3' : 'h-3.5 w-3.5', config.color, 'opacity-60')} />
        )}

        {/* Human-readable description */}
        <span
          className={cn(
            'truncate flex-1',
            isNested ? 'text-[11px]' : 'text-xs',
            activity.status === 'error'
              ? 'text-red-300/80'
              : activity.status === 'complete'
                ? 'text-white/40'
                : 'text-white/60'
          )}
          title={activity.mcpToolDescription || activity.target || activity.tool}
        >
          {formatDescription(
            activity.tool,
            activity.target,
            activity.status,
            activity.isMCPTool,
            activity.mcpServerName,
            activity.mcpToolDescription
          )}
        </span>

        {/* Duration for completed activities */}
        {activity.status === 'complete' && activity.timestamp && activity.completedAt && (
          <span className={cn(isNested ? 'text-[9px]' : 'text-[10px]', 'text-white/30')}>
            {Math.round((new Date(activity.completedAt).getTime() - new Date(activity.timestamp).getTime()) / 1000)}s
          </span>
        )}

        {/* Expand button for details (error, input, or output) */}
        {(activity.error || (activity.isMCPTool && (activity.mcpInput || activity.mcpOutput))) && (
          <button
            onClick={() => {
              if (activity.error) {
                setShowOutput(!showOutput);
              } else if (activity.mcpInput) {
                setShowInput(!showInput);
              } else if (activity.mcpOutput) {
                setShowMCPOutput(!showMCPOutput);
              }
            }}
            className="ml-auto p-0.5 hover:bg-white/10 rounded-md transition-colors"
          >
            <ChevronDown className={cn(
              'h-3 w-3 text-white/30 transition-transform',
              (showOutput || showInput || showMCPOutput) && 'rotate-180'
            )} />
          </button>
        )}
      </div>

      {/* Expandable error section with improved UI */}
      {showOutput && activity.error && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <span className="text-red-300 font-medium">Error occurred</span>
            <button
              onClick={handleCopyError}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-white/50 text-[10px] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy error
                </>
              )}
            </button>
          </div>
          <pre className="text-xs bg-black/30 rounded-lg p-2.5 max-h-32 overflow-auto text-red-400 ring-1 ring-red-500/20">
            {sanitizeSensitiveData(activity.error)}
          </pre>
          <p className="text-[10px] text-white/30">
            Tip: You can ask Claude to retry this operation or investigate the error.
          </p>
        </div>
      )}

      {/* Expandable MCP input section */}
      {showInput && activity.isMCPTool && activity.mcpInput && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Puzzle className="h-3 w-3 text-purple-400" />
            <span className="text-purple-300 font-medium">Tool Input</span>
            <button
              onClick={handleCopyInput}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-white/50 text-[10px] transition-colors"
            >
              {copiedInput ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy input
                </>
              )}
            </button>
          </div>
          <pre className="text-xs bg-black/30 rounded-lg p-2.5 max-h-48 overflow-auto text-purple-300 ring-1 ring-purple-500/20 font-mono">
            {JSON.stringify(activity.mcpInput, null, 2)}
          </pre>
        </div>
      )}

      {/* Expandable MCP output section */}
      {showMCPOutput && activity.isMCPTool && activity.mcpOutput && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Puzzle className="h-3 w-3 text-purple-400" />
            <span className="text-purple-300 font-medium">Tool Output</span>
            <button
              onClick={handleCopyOutput}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-white/50 text-[10px] transition-colors"
            >
              {copiedOutput ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy output
                </>
              )}
            </button>
          </div>
          <pre className="text-xs bg-black/30 rounded-lg p-2.5 max-h-48 overflow-auto text-white/70 ring-1 ring-white/10 font-mono whitespace-pre-wrap">
            {activity.mcpOutput}
          </pre>
        </div>
      )}

      {/* Tool description for MCP tools */}
      {activity.isMCPTool && activity.mcpToolDescription && (showInput || showMCPOutput) && (
        <div className="mt-2 text-[10px] text-white/30 italic">
          {activity.mcpToolDescription}
        </div>
      )}
    </div>
  );
});
