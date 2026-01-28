import { useState, useRef, useEffect, KeyboardEvent, RefObject, useMemo } from 'react';
import { Paperclip, X, Image, Bot, Square, ArrowUp } from 'lucide-react';
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
    const minHeight = 56;
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
    <div className="rounded-2xl bg-white/[0.04] p-2 ring-1 ring-white/[0.08] shadow-lg">
      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 ring-1 ring-white/[0.06]"
            >
              {attachment.file.type.startsWith('image/') ? (
                <Image className="h-3.5 w-3.5 text-white/50" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-white/50" />
              )}
              <span className="text-xs text-white/70 truncate max-w-[120px]">
                {attachment.file.name}
              </span>
              {onRemoveAttachment && (
                <button
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="rounded-full p-0.5 hover:bg-white/10"
                >
                  <X className="h-3 w-3 text-white/50" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Textarea - borderless */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          disabled={disabled || isSending || isUploading}
          className="min-h-[56px] w-full resize-none bg-transparent px-3 py-2 text-[15px] text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
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
      </div>

      {/* Bottom toolbar: horizontal row */}
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        {/* Left side: mode toggle + agent chip */}
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onToggle={onToggleMode} />

          {/* Agent selection UI */}
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

        {/* Right side: attach + send/stop */}
        <div className="flex items-center gap-1.5">
          {onAttach && (
            <button
              onClick={onAttach}
              disabled={disabled || isUploading}
              className="rounded-lg p-2 text-white/40 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}

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
                className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-red-400 text-xs font-medium hover:bg-red-500/25 disabled:opacity-50 transition-colors"
                aria-label="Stop"
              >
                <Square className="h-3 w-3" />
                Stop
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
                className="rounded-full bg-white p-1.5 text-black hover:opacity-90 active:opacity-80 disabled:opacity-30 transition-opacity"
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>

          {isGenerating && (
            <span className="hidden sm:block text-[10px] text-white/30">
              Esc
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
