/**
 * OnboardingFlow - Inline workspace setup for first-time users
 *
 * Two-step flow rendered inside Mission Control when no workspaces exist:
 * Step 1: Create workspace (name + folder path)
 * Step 2: Show discovered repos -> "Create First Session"
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FolderOpen, GitBranch, ChevronRight, Loader2, AlertCircle, Rocket } from 'lucide-react';
import { Logo } from './Logo';
import { DirectoryPicker } from '../settings/DirectoryPicker';
import { useAppStore } from '../../store/appStore';
import { useTerminalUIStore } from '../../store/terminalUIStore';
import { api } from '../../lib/api';
import type { RepoConfig } from '../../types';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Step = 'workspace' | 'repos';

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const prefersReduced = useReducedMotion();
  const { loadData, repos } = useAppStore();
  const ui = useTerminalUIStore();

  // Step state
  const [step, setStep] = useState<Step>('workspace');

  // Step 1 state
  const [name, setName] = useState('My Projects');
  const [scanPath, setScanPath] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Step 2 state
  const [discoveredRepos, setDiscoveredRepos] = useState<RepoConfig[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  // Staggered reveal for repos
  useEffect(() => {
    if (step !== 'repos' || discoveredRepos.length === 0) return;
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= discoveredRepos.length) {
          clearInterval(interval);
          return c;
        }
        return c + 1;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [step, discoveredRepos]);

  const handleCreateWorkspace = async () => {
    if (!scanPath.trim()) {
      setError('Please select a folder path');
      return;
    }
    setCreating(true);
    setError('');

    try {
      // Validate path
      await api('POST', '/settings/validate-path', { path: scanPath.trim() });

      // Create workspace
      await api('POST', '/workspaces', {
        name: name.trim() || 'My Projects',
        scanPath: scanPath.trim(),
      });

      // Reload data to get new workspace + auto-discovered repos
      await loadData({ forceRefresh: true });

      // Grab fresh repos from store
      const freshRepos = useAppStore.getState().repos;
      setDiscoveredRepos(freshRepos);
      setStep('repos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateSession = () => {
    ui.openNewSession();
    onComplete();
  };

  const slideVariants = {
    enter: prefersReduced ? {} : { opacity: 0, x: 60 },
    center: { opacity: 1, x: 0 },
    exit: prefersReduced ? {} : { opacity: 0, x: -60 },
  };

  return (
    <div className="h-screen flex flex-col bg-[#05070c] text-white">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
        <div className="absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/8 blur-3xl" />
      </div>

      <div className="relative flex-1 flex items-center justify-center z-10">
        <AnimatePresence mode="wait">
          {step === 'workspace' && (
            <motion.div
              key="workspace"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25 }}
              className="w-full max-w-md px-6"
            >
              <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-8 backdrop-blur-sm">
                <div className="flex justify-center mb-6">
                  <Logo size="lg" />
                </div>

                <h2 className="text-xl font-semibold text-white text-center mb-1">
                  Set Up Your Workspace
                </h2>
                <p className="text-sm text-white/50 text-center mb-6">
                  A workspace points to a folder containing your projects.
                </p>

                <div className="space-y-4">
                  {/* Workspace name */}
                  <div>
                    <label className="block text-xs text-white/60 mb-1.5">Workspace Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 ring-1 ring-white/10 focus:ring-white/25 focus:outline-none transition"
                      placeholder="My Projects"
                    />
                  </div>

                  {/* Folder path */}
                  <div>
                    <label className="block text-xs text-white/60 mb-1.5">Projects Folder</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={scanPath}
                        onChange={(e) => { setScanPath(e.target.value); setError(''); }}
                        className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 ring-1 ring-white/10 focus:ring-white/25 focus:outline-none transition"
                        placeholder="C:\Users\you\projects"
                      />
                      <button
                        onClick={() => setShowPicker(true)}
                        className="rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white/70 ring-1 ring-white/10 hover:bg-white/15 hover:text-white/90 transition"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-400">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleCreateWorkspace}
                    disabled={creating || !scanPath.trim()}
                    className="w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Continue
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'repos' && (
            <motion.div
              key="repos"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25 }}
              className="w-full max-w-md px-6"
            >
              <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-8 backdrop-blur-sm">
                <div className="flex justify-center mb-6">
                  <Logo size="lg" />
                </div>

                <h2 className="text-xl font-semibold text-white text-center mb-1">
                  Your Repositories
                </h2>
                <p className="text-sm text-white/50 text-center mb-6">
                  {discoveredRepos.length > 0
                    ? `Found ${discoveredRepos.length} repo${discoveredRepos.length === 1 ? '' : 's'} in your workspace.`
                    : 'No repositories found yet. You can add them later.'}
                </p>

                {discoveredRepos.length > 0 && (
                  <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                    {discoveredRepos.map((repo, i) => (
                      <motion.div
                        key={repo.id}
                        initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
                        animate={i < visibleCount ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10"
                      >
                        <GitBranch className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        <span className="text-sm text-white/80 truncate">{repo.id}</span>
                      </motion.div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleCreateSession}
                  className="w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Rocket className="h-4 w-4" />
                  {discoveredRepos.length > 0 ? 'Create First Session' : 'Get Started'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Directory Picker Modal */}
      <DirectoryPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(path) => { setScanPath(path); setError(''); }}
      />
    </div>
  );
}
