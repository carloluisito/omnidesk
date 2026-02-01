/**
 * SettingsDrawer - Slide-out settings panel for Mission Control
 *
 * A full-height drawer that slides in from the right, containing
 * all settings tabs (Workspaces, Integrations, API Config) so the
 * user never leaves Mission Control.
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, Link, Key, Settings2, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

// Lazy-load settings tabs so the drawer opens instantly
const Workspaces = lazy(() => import('../../screens/settings/Workspaces'));
const Integrations = lazy(() => import('../../screens/settings/Integrations'));
const ApiConfig = lazy(() => import('../../screens/settings/ApiConfig'));
const System = lazy(() => import('../../screens/settings/System'));

type SettingsTab = 'workspaces' | 'integrations' | 'api-config' | 'system';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'workspaces', label: 'Workspaces', icon: <Folder className="h-4 w-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <Link className="h-4 w-4" /> },
  { id: 'api-config', label: 'API Config', icon: <Key className="h-4 w-4" /> },
  { id: 'system', label: 'System', icon: <Settings2 className="h-4 w-4" /> },
];

const tabFallback = (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-white/40" />
  </div>
);

export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('workspaces');
  // Track which tabs have been visited so we keep them mounted (no re-fetch on switch back)
  const [mountedTabs, setMountedTabs] = useState<Set<SettingsTab>>(new Set(['workspaces']));

  // When a tab is selected, add it to mounted set
  const handleTabClick = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    setMountedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  // Reset mounted tabs when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setMountedTabs(new Set(['workspaces']));
      setActiveTab('workspaces');
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — no backdrop-blur to avoid GPU overhead */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/60"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[90] w-full max-w-2xl flex flex-col bg-[#0a0d14] border-l border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-semibold text-white tracking-tight">Settings</h2>
                <p className="text-xs text-white/40 mt-0.5">Configure workspaces, integrations, and API</p>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 px-6 pt-4 pb-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ring-1',
                    activeTab === tab.id
                      ? 'bg-white text-black ring-white'
                      : 'bg-white/5 text-white/70 ring-white/10 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content — tabs stay mounted once visited to avoid re-fetching */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <Suspense fallback={tabFallback}>
                <div className={activeTab === 'workspaces' ? '' : 'hidden'}>
                  {mountedTabs.has('workspaces') && <Workspaces />}
                </div>
                <div className={activeTab === 'integrations' ? '' : 'hidden'}>
                  {mountedTabs.has('integrations') && <Integrations />}
                </div>
                <div className={activeTab === 'api-config' ? '' : 'hidden'}>
                  {mountedTabs.has('api-config') && <ApiConfig />}
                </div>
                <div className={activeTab === 'system' ? '' : 'hidden'}>
                  {mountedTabs.has('system') && <System />}
                </div>
              </Suspense>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
