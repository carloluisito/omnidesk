import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Check, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { api } from '../lib/api';

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [securityAccepted, setSecurityAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const prefersReduced = useReducedMotion();
  const { loadData } = useAppStore();

  const handleAccept = async () => {
    if (!securityAccepted || submitting) return;
    setSubmitting(true);

    try {
      await api('PUT', '/settings', {
        securityAcknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      });
      await api('POST', '/setup/complete');
      await loadData();
      onComplete();
    } catch (error) {
      console.error('Failed to complete setup:', error);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070c] overflow-y-auto">
      <div className="w-full max-w-lg px-6 py-12">
        <motion.div
          initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600">
              <ShieldAlert className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-50 mb-3">
              Important Security Information
            </h2>
            <div className="max-w-lg mx-auto text-left space-y-4">
              <div className="rounded-xl border border-amber-800 bg-amber-900/20 p-4">
                <p className="text-sm text-amber-200 mb-3 font-medium">
                  ClaudeDesk grants Claude Code autonomous access to your local file system and command execution.
                </p>
                <p className="text-sm text-amber-300/80 mb-2">By default, Claude can:</p>
                <ul className="text-sm text-amber-300/70 space-y-1 ml-4 list-disc">
                  <li>Read, edit, and delete files in configured workspaces</li>
                  <li>Execute arbitrary shell commands on your machine</li>
                  <li>Install packages and modify system configuration</li>
                  <li>Access network resources and external APIs</li>
                </ul>
              </div>

              <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                <p className="text-xs text-white/70 mb-2 font-medium">Before using ClaudeDesk:</p>
                <ul className="text-xs text-white/60 space-y-1 ml-4 list-disc">
                  <li>Only configure trusted repositories in workspaces</li>
                  <li>Review all changes before committing or deploying</li>
                  <li>Use read-only permission mode when exploring unfamiliar codebases</li>
                  <li>Never configure system directories or sensitive paths</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={securityAccepted}
                    onChange={(e) => setSecurityAccepted(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-5 rounded border-2 border-amber-600 bg-transparent ring-2 ring-amber-800 peer-checked:bg-amber-600 peer-checked:border-amber-500 transition-all flex items-center justify-center">
                    {securityAccepted && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
                <span className="text-sm text-white/80 group-hover:text-white transition-colors">
                  I understand and accept these risks
                </span>
              </label>

              <button
                onClick={handleAccept}
                disabled={!securityAccepted || submitting}
                className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Setting up...' : 'Continue'}
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
