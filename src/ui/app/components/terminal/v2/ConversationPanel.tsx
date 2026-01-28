import { ReactNode, RefObject } from 'react';
import { Loader2, Sparkles, Code, Search, Bug, TestTube } from 'lucide-react';

interface ConversationPanelProps {
  children: ReactNode;
  messagesEndRef?: RefObject<HTMLDivElement>;
  isEmpty?: boolean;
  isRunning?: boolean;
  isThinking?: boolean;
  currentActivity?: string;
  onExport?: () => void;
  onBookmark?: () => void;
}

export function ConversationPanel({
  children,
  messagesEndRef,
  isEmpty = false,
  isRunning = false,
  isThinking = false,
  currentActivity,
}: ConversationPanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-touch py-8 space-y-2">
        <div className="w-full px-4 sm:px-6">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center text-white/50 py-12 px-4">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-600/20 ring-1 ring-white/10">
                <Sparkles className="h-7 w-7 text-orange-400" />
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2">Ready to build something?</h2>
              <p className="text-sm text-white/40 mb-8 text-center max-w-md">
                Start by describing what you'd like to build, or try one of these suggestions
              </p>

              <div className="w-full max-w-2xl space-y-3">
                <button
                  onClick={() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      textarea.value = "Help me build a simple React todo app with TypeScript";
                      textarea.dispatchEvent(new Event('input', { bubbles: true }));
                      textarea.focus();
                    }
                  }}
                  className="w-full text-left rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <Code className="h-4 w-4 mt-0.5 text-white/30 group-hover:text-blue-400 transition-colors" />
                    <div>
                      <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                        Build a React todo app
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        Create a simple todo app with TypeScript and local storage
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      textarea.value = "Review my code and suggest improvements for better performance";
                      textarea.dispatchEvent(new Event('input', { bubbles: true }));
                      textarea.focus();
                    }
                  }}
                  className="w-full text-left rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <Search className="h-4 w-4 mt-0.5 text-white/30 group-hover:text-blue-400 transition-colors" />
                    <div>
                      <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                        Review and optimize code
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        Get suggestions for performance and code quality improvements
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      textarea.value = "Help me debug the error I'm seeing in the console";
                      textarea.dispatchEvent(new Event('input', { bubbles: true }));
                      textarea.focus();
                    }
                  }}
                  className="w-full text-left rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <Bug className="h-4 w-4 mt-0.5 text-white/30 group-hover:text-blue-400 transition-colors" />
                    <div>
                      <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                        Debug an issue
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        Get help troubleshooting errors and fixing bugs
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      textarea.value = "Write tests for my current implementation";
                      textarea.dispatchEvent(new Event('input', { bubbles: true }));
                      textarea.focus();
                    }
                  }}
                  className="w-full text-left rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06] hover:bg-white/[0.06] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <TestTube className="h-4 w-4 mt-0.5 text-white/30 group-hover:text-blue-400 transition-colors" />
                    <div>
                      <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                        Add test coverage
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        Generate unit and integration tests for your code
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-8 text-xs text-white/30 text-center">
                <p>Use <span className="text-white/50 font-medium">@</span> to select a specialized agent for specific tasks</p>
              </div>
            </div>
          ) : (
            <>
              {children}

              {/* Thinking Indicator */}
              {isRunning && isThinking && (
                <div className="flex gap-3 px-6 py-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/80 to-amber-600/80">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/50">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                      </span>
                      <span className="text-orange-400/80 font-medium">Thinking...</span>
                    </div>
                    {currentActivity && (
                      <span className="text-xs text-white/40 truncate max-w-xs">
                        {currentActivity}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Message bubble for the glassmorphism design
interface MessageBubbleProps {
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
  agentId?: string;
  agentName?: string;
  onCopy?: () => void;
  onBookmark?: () => void;
  onRegenerate?: () => void;
}

export function MessageBubble({
  role,
  text,
  meta,
  agentId,
  agentName,
  onCopy,
  onBookmark,
  onRegenerate,
}: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ring-1 ${
          isUser
            ? 'bg-white/10 text-white/90 ring-white/[0.08]'
            : 'bg-transparent text-white ring-transparent'
        }`}
      >
        {/* Agent attribution badge for assistant messages */}
        {!isUser && agentId && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
              via {agentName || agentId}
            </span>
          </div>
        )}
        {meta && (
          <div className="text-xs text-white/55">{meta}</div>
        )}
        <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
          {text}
        </pre>
        <div className="mt-3 flex items-center gap-2 text-xs text-white/55 opacity-0 group-hover:opacity-100 transition-opacity">
          {onCopy && (
            <button
              onClick={onCopy}
              className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            >
              Copy
            </button>
          )}
          {onBookmark && (
            <button
              onClick={onBookmark}
              className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            >
              Bookmark
            </button>
          )}
          {!isUser && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
