/**
 * PromptPhase - Conversation and prompting interface
 *
 * Displays the chat interface with Claude, including messages,
 * tool activity timeline, and the composer for input.
 */
import { useRef, useCallback, RefObject } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/cn';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  timestamp?: string;
}

interface ToolActivity {
  id: string;
  tool: string;
  description?: string;
  status: 'running' | 'completed' | 'error';
  duration?: number;
}

interface PromptPhaseProps {
  messages: Message[];
  toolActivities: ToolActivity[];
  currentActivity?: ToolActivity;
  isRunning: boolean;
  isEmpty: boolean;
  renderMessage: (message: Message, index: number) => React.ReactNode;
  messagesEndRef: RefObject<HTMLDivElement>;
  composer: React.ReactNode;
  onExport?: () => void;
}

export function PromptPhase({
  messages,
  toolActivities,
  currentActivity,
  isRunning,
  isEmpty,
  renderMessage,
  messagesEndRef,
  composer,
  onExport,
}: PromptPhaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-600/20 ring-1 ring-white/10">
              <Sparkles className="h-8 w-8 text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Start a conversation
            </h2>
            <p className="text-sm text-white/50 leading-relaxed">
              Describe what you want to build, fix, or explore. Claude will help you
              through the entire process.
            </p>
          </motion.div>
        </div>

        {/* Composer at bottom */}
        <div className="w-full px-4 pb-4">{composer}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto py-4 space-y-1"
      >
        <div className="w-full px-4">
          {messages.map((message, index) => {
            const isLatest = index === messages.length - 1;
            return isLatest ? (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {renderMessage(message, index)}
              </motion.div>
            ) : (
              <div key={message.id}>
                {renderMessage(message, index)}
              </div>
            );
          })}

          {/* Current activity indicator */}
          {isRunning && currentActivity && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20"
            >
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-blue-400 font-medium">
                  {currentActivity.tool}
                </p>
                {currentActivity.description && (
                  <p className="text-xs text-blue-400/70 truncate">
                    {currentActivity.description}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* Thinking indicator when no current activity */}
          {isRunning && !currentActivity && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-white/40">Claude is thinking...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="w-full px-4 pb-4 pt-2 border-t border-white/5">{composer}</div>
    </div>
  );
}
