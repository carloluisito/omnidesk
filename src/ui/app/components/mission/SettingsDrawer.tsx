/**
 * SettingsDrawer - Slide-out settings panel for Mission Control
 *
 * A full-height drawer that slides in from the right, containing
 * all settings tabs (Workspaces, Integrations, API Config) so the
 * user never leaves Mission Control.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, Link, Key } from 'lucide-react';
import { cn } from '../../lib/cn';

// Lazy-load the actual settings content
import Workspaces from '../../screens/settings/Workspaces';
import Integrations from '../../screens/settings/Integrations';
import ApiConfig from '../../screens/settings/ApiConfig';

type SettingsTab = 'workspaces' | 'integrations' | 'api-config';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'workspaces', label: 'Workspaces', icon: <Folder className="h-4 w-4" /> },
  { id: 'integrations', label: 'Integrations', icon: <Link className="h-4 w-4" /> },
  { id: 'api-config', label: 'API Config', icon: <Key className="h-4 w-4" /> },
];

export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('workspaces');

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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"
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
                  onClick={() => setActiveTab(tab.id)}
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeTab === 'workspaces' && <Workspaces />}
                  {activeTab === 'integrations' && <Integrations />}
                  {activeTab === 'api-config' && <ApiConfig />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
