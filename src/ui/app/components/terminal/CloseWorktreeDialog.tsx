import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  AlertTriangle,
  Info,
  GitBranch,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  GitPullRequest,
  FileWarning,
  GitCommit,
  Check,
  Shield,
} from 'lucide-react';

interface CloseWorktreeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  session: {
    id: string;
    name?: string;
    branch: string;
    worktreePath: string;
    baseBranch?: string;
    ownsWorktree?: boolean;
    status: string;
  };
  gitStatus?: {
    modified: number;
    staged: number;
    untracked: number;
  };
  prInfo?: {
    number: number;
    url: string;
  };
  unpushedCommits?: number;
  onConfirm: (option: 'keep' | 'deleteWorktree' | 'deleteBoth') => Promise<void>;
}

type CloseOption = 'keep' | 'deleteWorktree' | 'deleteBoth';

interface RadioOptionProps {
  id: CloseOption;
  checked: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  recommended?: boolean;
  disabled?: boolean;
  warningText?: string;
  onChange: () => void;
  index: number;
}

const RadioOption = ({
  id,
  checked,
  title,
  description,
  icon,
  accentColor,
  recommended,
  disabled,
  warningText,
  onChange,
  index,
}: RadioOptionProps) => {
  return (
    <motion.button
      type="button"
      onClick={!disabled ? onChange : undefined}
      disabled={disabled}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.05, duration: 0.3 }}
      className={`
        group relative w-full text-left rounded-xl border-2 transition-all duration-200
        ${checked
          ? `${accentColor} bg-white/[0.03] border-opacity-100`
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'
        }
        ${disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'cursor-pointer'
        }
      `}
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-describedby={`${id}-description`}
    >
      <div className="flex items-start gap-4 p-4">
        {/* Radio Indicator */}
        <div className="flex-shrink-0 mt-0.5">
          <div
            className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200
              ${checked
                ? `${accentColor.replace('border-', 'border-')} bg-white/10`
                : 'border-white/30 group-hover:border-white/50'
              }
            `}
          >
            {checked && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`w-2.5 h-2.5 rounded-full ${accentColor.replace('border-', 'bg-')}`}
              />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`${checked ? accentColor.replace('border-', 'text-') : 'text-white/50'} transition-colors`}>
              {icon}
            </div>
            <h3 className="text-[15px] font-medium text-white/90">
              {title}
            </h3>
            {recommended && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 + index * 0.05 }}
                className="px-2 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-400 rounded-md border border-emerald-500/30"
              >
                Recommended
              </motion.span>
            )}
          </div>
          <p id={`${id}-description`} className="text-[13px] text-white/60 leading-relaxed">
            {description}
          </p>
          {warningText && !disabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 flex items-start gap-2 text-[12px] text-amber-400/90"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{warningText}</span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.button>
  );
};

export const CloseWorktreeDialog = ({
  isOpen,
  onClose,
  session,
  gitStatus,
  prInfo,
  unpushedCommits,
  onConfirm,
}: CloseWorktreeDialogProps) => {
  const [selectedOption, setSelectedOption] = useState<CloseOption>('keep');
  const [isLoading, setIsLoading] = useState(false);
  const [isEducationExpanded, setIsEducationExpanded] = useState(false);

  // Calculate warning states
  const hasUncommittedChanges = gitStatus
    ? gitStatus.modified + gitStatus.staged + gitStatus.untracked > 0
    : false;
  const totalUncommittedFiles = gitStatus
    ? gitStatus.modified + gitStatus.staged + gitStatus.untracked
    : 0;
  const hasUnpushedCommits = (unpushedCommits ?? 0) > 0;
  const hasActivePR = !!prInfo;
  const isProtectedBranch = ['main', 'master', 'develop'].includes(session.branch.toLowerCase());
  const isRunning = session.status === 'running';
  const cannotDeleteBranch = isProtectedBranch || !session.ownsWorktree;

  // Determine confirm button label
  const getConfirmLabel = () => {
    switch (selectedOption) {
      case 'keep':
        return 'Close Session';
      case 'deleteWorktree':
        return 'Close & Delete Worktree';
      case 'deleteBoth':
        return 'Close & Delete All';
    }
  };

  // Handle confirm
  const handleConfirm = useCallback(async () => {
    if (isRunning) return;
    setIsLoading(true);
    try {
      await onConfirm(selectedOption);
    } finally {
      setIsLoading(false);
    }
  }, [selectedOption, onConfirm, isRunning]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedOption('keep');
      setIsLoading(false);
      setIsEducationExpanded(false);
    }
  }, [isOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && !isRunning) {
        handleConfirm();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedOption((prev) => {
          if (prev === 'keep') return 'deleteWorktree';
          if (prev === 'deleteWorktree' && !cannotDeleteBranch) return 'deleteBoth';
          return prev;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedOption((prev) => {
          if (prev === 'deleteBoth') return 'deleteWorktree';
          if (prev === 'deleteWorktree') return 'keep';
          return prev;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleConfirm, isRunning, cannotDeleteBranch]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center z-[101] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-[672px] bg-[#0a0a0a] rounded-2xl border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
            >
              {/* Loading Overlay */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10"
                  aria-busy="true"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-white/20 border-t-white/80 rounded-full animate-spin" />
                    <p className="text-sm text-white/70 font-medium">Closing session...</p>
                  </div>
                </motion.div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <motion.h2
                  id="dialog-title"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 }}
                  className="text-lg font-semibold text-white/90"
                >
                  Close Session
                </motion.h2>
                <motion.button
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.1 }}
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white/90 transition-colors"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 px-6 py-5">
                {/* Session Info */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/10"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <FolderGit2 className="w-4 h-4 text-blue-400" />
                      <span className="text-[13px] text-white/50 font-medium">Session</span>
                      <span className="text-[13px] text-white/90 font-mono">
                        {session.name || session.branch}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <GitBranch className="w-4 h-4 text-violet-400" />
                      <span className="text-[13px] text-white/50 font-medium">Branch</span>
                      <span className="text-[13px] text-white/90 font-mono">
                        {session.branch}
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <FolderGit2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                      <span className="text-[13px] text-white/50 font-medium">Worktree</span>
                      <span className="text-[13px] text-white/70 font-mono break-all flex-1">
                        {session.worktreePath}
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Warning Banners */}
                <div className="space-y-3 mb-5">
                  {isRunning && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-red-500/[0.08] border border-red-500/30"
                      role="alert"
                    >
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-red-300 mb-1">
                          Session is currently running
                        </p>
                        <p className="text-[12px] text-red-300/80">
                          Stop the current operation before closing this session
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {hasUncommittedChanges && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/30"
                      role="alert"
                      aria-live="polite"
                    >
                      <FileWarning className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-amber-300 mb-1">
                          You have {totalUncommittedFiles} uncommitted{' '}
                          {totalUncommittedFiles === 1 ? 'change' : 'changes'}
                        </p>
                        <p className="text-[12px] text-amber-300/80">
                          These changes will be lost if you delete the worktree
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {hasUnpushedCommits && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.14 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/30"
                      role="alert"
                      aria-live="polite"
                    >
                      <GitCommit className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-amber-300 mb-1">
                          You have {unpushedCommits} unpushed{' '}
                          {unpushedCommits === 1 ? 'commit' : 'commits'}
                        </p>
                        <p className="text-[12px] text-amber-300/80">
                          Make sure you've pushed your work before deleting the worktree
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {hasActivePR && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.16 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/30"
                      aria-live="polite"
                    >
                      <GitPullRequest className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-blue-300 mb-1">
                          This branch has an open PR (#{prInfo.number})
                        </p>
                        <p className="text-[12px] text-blue-300/80">
                          Deleting the branch will not close the PR, but may cause issues
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {isProtectedBranch && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.18 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-red-500/[0.08] border border-red-500/30"
                      role="alert"
                    >
                      <Shield className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-red-300 mb-1">
                          Cannot delete protected branch
                        </p>
                        <p className="text-[12px] text-red-300/80">
                          The branch '{session.branch}' is a protected branch (main, master, develop)
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {!session.ownsWorktree && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/30"
                      aria-live="polite"
                    >
                      <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[12px] text-blue-300/80">
                          This session is attached to an existing worktree created by another session.
                          You can close the session, but cannot delete the worktree.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Options */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mb-5"
                >
                  <h3 className="text-[13px] font-medium text-white/70 mb-3">
                    What would you like to do?
                  </h3>
                  <div className="space-y-3" role="radiogroup" aria-labelledby="dialog-title">
                    <RadioOption
                      id="keep"
                      checked={selectedOption === 'keep'}
                      title="Keep worktree"
                      description="Close session but preserve your worktree directory. You can resume work later by creating a new session with this branch."
                      icon={<Check className="w-4 h-4" />}
                      accentColor="border-emerald-500"
                      recommended
                      onChange={() => setSelectedOption('keep')}
                      index={0}
                    />
                    <RadioOption
                      id="deleteWorktree"
                      checked={selectedOption === 'deleteWorktree'}
                      title="Delete worktree only"
                      description="Remove the isolated worktree directory but keep the branch. The branch remains available for checkout."
                      icon={<FolderGit2 className="w-4 h-4" />}
                      accentColor="border-amber-500"
                      warningText={
                        hasUncommittedChanges
                          ? `${totalUncommittedFiles} uncommitted ${totalUncommittedFiles === 1 ? 'change' : 'changes'} will be lost`
                          : undefined
                      }
                      onChange={() => setSelectedOption('deleteWorktree')}
                      index={1}
                    />
                    <RadioOption
                      id="deleteBoth"
                      checked={selectedOption === 'deleteBoth'}
                      title="Delete worktree and branch"
                      description="Completely remove both the worktree and the git branch. Use this when you're done with this feature."
                      icon={<AlertTriangle className="w-4 h-4" />}
                      accentColor="border-red-500"
                      disabled={cannotDeleteBranch}
                      warningText={
                        hasActivePR
                          ? `This will not close PR #${prInfo.number}, but may cause issues`
                          : undefined
                      }
                      onChange={() => setSelectedOption('deleteBoth')}
                      index={2}
                    />
                  </div>
                </motion.div>

                {/* Educational Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-2"
                >
                  <button
                    onClick={() => setIsEducationExpanded(!isEducationExpanded)}
                    className="flex items-center gap-2 w-full p-3 rounded-lg hover:bg-white/[0.04] transition-colors text-white/60 hover:text-white/90"
                    aria-expanded={isEducationExpanded}
                    aria-controls="education-content"
                  >
                    {isEducationExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <Info className="w-4 h-4" />
                    <span className="text-[13px] font-medium">What's a worktree?</span>
                  </button>
                  <AnimatePresence>
                    {isEducationExpanded && (
                      <motion.div
                        id="education-content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 py-3 text-[13px] text-white/60 leading-relaxed space-y-2">
                          <p>
                            A git worktree is an isolated working directory for a branch. Each session
                            with a worktree has its own directory, allowing you to work on multiple
                            branches simultaneously without switching.
                          </p>
                          <ul className="space-y-1.5 pl-4">
                            <li className="flex items-start gap-2">
                              <span className="text-emerald-400 mt-1">•</span>
                              <span>
                                <strong className="text-white/80">Keeping the worktree</strong> preserves
                                your work in its isolated directory
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-amber-400 mt-1">•</span>
                              <span>
                                <strong className="text-white/80">Deleting the worktree</strong> removes
                                the directory but keeps the branch
                              </span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-red-400 mt-1">•</span>
                              <span>
                                <strong className="text-white/80">Deleting both</strong> removes everything
                                (use when feature is complete)
                              </span>
                            </li>
                          </ul>
                          <p className="pt-1">
                            You can always create a new session later to resume work on a kept branch.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* Footer Actions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10"
              >
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium text-white/70 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isRunning || isLoading}
                  className={`
                    px-4 py-2 rounded-lg text-[13px] font-medium transition-all
                    ${selectedOption === 'keep'
                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                      : selectedOption === 'deleteWorktree'
                      ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30'
                    }
                    ${isRunning || isLoading
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:scale-[1.02]'
                    }
                  `}
                >
                  {getConfirmLabel()}
                </button>
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
