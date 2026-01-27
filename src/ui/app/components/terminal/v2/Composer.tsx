import { useState, useRef, useEffect, KeyboardEvent, RefObject, useMemo } from 'react';
import { Paperclip, Mic, ChevronRight, X, Image, Bot, Search, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModeToggle } from '../../ui/ModeToggle';
import { PendingAttachment } from '../../../store/terminalStore';
import { AgentChip } from './AgentSelector';
import { AutoModeIndicator } from './AutoModeIndicator';
import { QuickSelectMenu } from './QuickSelectMenu';
import type { Agent } from '../../../types/agents';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  mode: 'plan' | 'direct';
  onToggleMode: () => void;
  onAttach?: () => void;
  onVoice?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement>;
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
  isGenerating?: boolean;
  isUploading?: boolean;
  queueCount?: number;
  pendingAttachments?: PendingAttachment[];
  onRemoveAttachment?: (id: string) => void;
  // Agent selection props
  agents?: Agent[];
  pinnedAgents?: Agent[];
  recentAgents?: Agent[];
  userAgents?: Agent[];
  builtinAgents?: Agent[];
  selectedAgent?: Agent | null;
  onAgentSelect?: (agent: Agent | null) => void;
  agentSearchQuery?: string;
  onAgentSearchChange?: (query: string) => void;
  onBrowseAgents?: () => void; // Open full agents panel
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  onPaste,
  mode,
  onToggleMode,
  onAttach,
  onVoice,
  inputRef,
  placeholder = 'Message Claude...',
  disabled = false,
  isSending = false,
  isGenerating = false,
  isUploading = false,
  queueCount = 0,
  pendingAttachments = [],
  onRemoveAttachment,
  // Agent props with defaults
  agents = [],
  pinnedAgents = [],
  recentAgents = [],
  userAgents = [],
  builtinAgents = [],
  selectedAgent = null,
  onAgentSelect,
  agentSearchQuery = '',
  onAgentSearchChange,
  onBrowseAgents,
}: ComposerProps) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef || localRef;

  // Quick-select menu state
  const [showQuickSelect, setShowQuickSelect] = useState(false);

  // @-mention autocomplete state
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionFocusedIndex, setMentionFocusedIndex] = useState(0);
  const mentionPopoverRef = useRef<HTMLDivElement>(null);

  // Filter agents for @-mention autocomplete
  const mentionFilteredAgents = useMemo(() => {
    if (!mentionQuery) return agents.slice(0, 5);
    const query = mentionQuery.toLowerCase();
    return agents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.id.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [agents, mentionQuery]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = window.innerHeight * 0.4;
    const minHeight = 90;
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';
  }, [value, textareaRef]);

  // Close mention popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mentionPopoverRef.current &&
        !mentionPopoverRef.current.contains(event.target as Node)
      ) {
        setShowMentionPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset mention focus when filtered list changes
  useEffect(() => {
    setMentionFocusedIndex(0);
  }, [mentionFilteredAgents.length]);

  // Check if queue is full (max 10 messages)
  const isQueueFull = queueCount >= 10;

  // Handle text input change for @-mention detection
  const handleInputChange = (newValue: string) => {
    onChange(newValue);

    // Detect @ mentions
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Find the last @ that isn't part of an email
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9-]*)$/);

    if (atMatch) {
      setShowMentionPopover(true);
      setMentionQuery(atMatch[1]);
      setMentionStartIndex(textBeforeCursor.length - atMatch[0].length);
    } else {
      setShowMentionPopover(false);
      setMentionQuery('');
      setMentionStartIndex(-1);
    }
  };

  // Insert agent from @-mention
  const insertMentionedAgent = (agent: Agent) => {
    if (mentionStartIndex < 0) return;

    const cursorPos = textareaRef.current?.selectionStart || value.length;
    const beforeMention = value.slice(0, mentionStartIndex);
    const afterMention = value.slice(cursorPos);

    // Remove the @query and add a space
    onChange(beforeMention + afterMention);

    // Select the agent
    onAgentSelect?.(agent);

    // Close popover
    setShowMentionPopover(false);
    setMentionQuery('');
    setMentionStartIndex(-1);

    // Focus textarea
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle @-mention navigation
    if (showMentionPopover && mentionFilteredAgents.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setMentionFocusedIndex((prev) =>
            Math.min(prev + 1, mentionFilteredAgents.length - 1)
          );
          return;
        case 'ArrowUp':
          e.preventDefault();
          setMentionFocusedIndex((prev) => Math.max(prev - 1, 0));
          return;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          insertMentionedAgent(mentionFilteredAgents[mentionFocusedIndex]);
          return;
        case 'Escape':
          e.preventDefault();
          setShowMentionPopover(false);
          return;
      }
    }

    // Escape to stop generation
    if (e.key === 'Escape' && isGenerating && onStop) {
      e.preventDefault();
      onStop();
      return;
    }

    // Regular Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
      {/* Top row: Mode toggle and Auto indicator / Agent chip */}
      <div className="flex items-center justify-between gap-2">
        <ModeToggle mode={mode} onToggle={onToggleMode} />

        {/* Agent selection UI - Show chip if agent selected, otherwise show Auto indicator */}
        {onAgentSelect && agents.length > 0 && (
          <div className="relative">
            {selectedAgent ? (
              <AgentChip agent={selectedAgent} onRemove={() => onAgentSelect?.(null)} />
            ) : (
              <AutoModeIndicator
                onClick={() => setShowQuickSelect(!showQuickSelect)}
                disabled={disabled || isSending}
              />
            )}

            {/* Quick-select menu */}
            <QuickSelectMenu
              isOpen={showQuickSelect}
              onClose={() => setShowQuickSelect(false)}
              recentAgents={recentAgents.slice(0, 3)}
              onSelectAgent={onAgentSelect}
              onBrowseAll={() => onBrowseAgents?.()}
              selectedAgent={selectedAgent}
              disabled={disabled || isSending}
            />
          </div>
        )}
      </div>

      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5 ring-1 ring-white/10"
            >
              {attachment.file.type.startsWith('image/') ? (
                <Image className="h-4 w-4 text-white/60" />
              ) : (
                <Paperclip className="h-4 w-4 text-white/60" />
              )}
              <span className="text-xs text-white/80 truncate max-w-[120px]">
                {attachment.file.name}
              </span>
              {onRemoveAttachment && (
                <button
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="rounded-full p-0.5 hover:bg-white/10"
                >
                  <X className="h-3 w-3 text-white/60" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main input row */}
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled || isSending || isUploading}
            className="min-h-[56px] sm:min-h-[90px] w-full resize-none rounded-2xl bg-white/5 px-4 py-3 text-base sm:text-sm text-white placeholder:text-white/35 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
          />

          {/* @-mention Autocomplete Popover */}
          <AnimatePresence>
            {showMentionPopover && mentionFilteredAgents.length > 0 && (
              <motion.div
                ref={mentionPopoverRef}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl bg-zinc-900/95 ring-1 ring-white/10 backdrop-blur-xl"
              >
                <div className="border-b border-white/10 px-3 py-2">
                  <span className="text-xs text-white/50">Select an agent</span>
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {mentionFilteredAgents.map((agent, idx) => (
                    <button
                      key={agent.id}
                      onClick={() => insertMentionedAgent(agent)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        idx === mentionFocusedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <Bot
                        className="h-4 w-4 shrink-0"
                        style={{ color: agent.color || '#3B82F6' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">
                          @{agent.name}
                        </div>
                        {agent.description && (
                          <div className="truncate text-xs text-white/50">
                            {agent.description}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-2 flex items-center text-xs text-white/45">
            {/* Simplified hint on mobile, full hint on desktop */}
            {selectedAgent ? (
              <>
                <span className="sm:hidden">Enter to send · @{selectedAgent.name} will respond</span>
                <span className="hidden sm:inline">Enter to send · @{selectedAgent.name} will respond</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">Enter to send · @ to select agent</span>
                <span className="hidden sm:inline">Enter to send · @ to select agent</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {onAttach && (
            <button
              onClick={onAttach}
              disabled={disabled || isUploading}
              className="rounded-2xl bg-white/5 p-3 min-h-[44px] min-w-[44px] text-white ring-1 ring-white/10 hover:bg-white/10 active:bg-white/15 disabled:opacity-50 touch-target"
              aria-label="Attach"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          )}
          {onVoice && (
            <button
              onClick={onVoice}
              disabled={disabled}
              className="rounded-2xl bg-white/5 p-3 min-h-[44px] min-w-[44px] text-white ring-1 ring-white/10 hover:bg-white/10 active:bg-white/15 disabled:opacity-50 touch-target"
              aria-label="Voice"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
          <div className="relative">
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.button
                  key="stop"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={onStop}
                  disabled={disabled}
                  className="rounded-2xl bg-red-500/90 p-3 min-h-[44px] min-w-[44px] text-white ring-1 ring-red-500 hover:bg-red-500 active:bg-red-600 disabled:opacity-50 touch-target"
                  aria-label="Stop"
                >
                  <Square className="h-5 w-5" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={onSend}
                  disabled={disabled || isSending || isUploading || isQueueFull || (!value.trim() && pendingAttachments.length === 0)}
                  title={isQueueFull ? 'Queue is full (10 messages max). Please wait or clear the queue.' : undefined}
                  className="rounded-2xl bg-white p-3 min-h-[44px] min-w-[44px] text-black ring-1 ring-white hover:opacity-90 active:opacity-80 disabled:opacity-50 touch-target"
                  aria-label="Send"
                >
                  <ChevronRight className="h-5 w-5" />
                </motion.button>
              )}
            </AnimatePresence>
            {isGenerating && (
              <div className="hidden sm:block absolute top-full mt-1 whitespace-nowrap text-xs text-white/45">
                Press Esc to stop
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
