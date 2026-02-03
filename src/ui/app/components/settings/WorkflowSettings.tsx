/**
 * Workflow Enforcement Settings
 *
 * Mission-critical controls for the Prompt → Review → Ship workflow.
 * Utilitarian aesthetic with technical precision.
 */

import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../lib/cn';

interface WorkflowSettings {
  enforcementEnabled: boolean;
  defaultPhase: 'prompt' | 'review' | 'ship';
  autoResetAfterShip: boolean;
  showBlockedNotifications: boolean;
}

export function WorkflowSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<WorkflowSettings>({
    enforcementEnabled: true,
    defaultPhase: 'prompt',
    autoResetAfterShip: true,
    showBlockedNotifications: true,
  });
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    api<{ workflow?: WorkflowSettings }>('GET', '/settings')
      .then((data) => {
        if (data?.workflow) {
          setSettings(data.workflow);
        }
      })
      .catch(() => {});
  }, []);

  const updateSetting = async <K extends keyof WorkflowSettings>(
    key: K,
    value: WorkflowSettings[K]
  ) => {
    setSaving(true);
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      await api('PUT', '/settings', { workflow: newSettings });
      toast.success('Workflow setting updated');
    } catch {
      // Revert on failure
      setSettings(settings);
      toast.error('Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 pb-4 border-b border-zinc-800/50">
        <div className="mt-0.5">
          {settings.enforcementEnabled ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400" strokeWidth={2} />
          ) : (
            <ShieldAlert className="w-5 h-5 text-zinc-500" strokeWidth={2} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100 tracking-tight uppercase mb-1">
            Workflow Enforcement
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed font-mono">
            Control git write operations based on workflow phase
          </p>
        </div>
      </div>

      {/* Status Banner */}
      {settings.enforcementEnabled && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" strokeWidth={2} />
            <div className="text-xs text-emerald-300/90 font-mono leading-relaxed">
              <span className="font-semibold">ACTIVE:</span> Git operations restricted to Ship phase
            </div>
          </div>
        </div>
      )}

      {!settings.enforcementEnabled && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" strokeWidth={2} />
            <div className="text-xs text-amber-300/90 font-mono leading-relaxed">
              <span className="font-semibold">DISABLED:</span> No workflow restrictions active
            </div>
          </div>
        </div>
      )}

      {/* Settings Grid */}
      <div className="space-y-4">
        {/* Enforcement Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
          <div className="flex-1 min-w-0 pr-4">
            <label htmlFor="enforcement" className="block text-xs font-semibold text-zinc-200 uppercase tracking-wide mb-1">
              Enable Enforcement
            </label>
            <p className="text-xs text-zinc-500 font-mono leading-relaxed">
              Block git commit/push in Prompt and Review phases
            </p>
          </div>
          <button
            id="enforcement"
            type="button"
            role="switch"
            aria-checked={settings.enforcementEnabled}
            onClick={() => updateSetting('enforcementEnabled', !settings.enforcementEnabled)}
            disabled={saving}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950',
              settings.enforcementEnabled ? 'bg-emerald-500' : 'bg-zinc-700',
              saving && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                settings.enforcementEnabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {/* Default Phase */}
        <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50">
          <label htmlFor="defaultPhase" className="block text-xs font-semibold text-zinc-200 uppercase tracking-wide mb-2">
            Default Phase
          </label>
          <p className="text-xs text-zinc-500 font-mono leading-relaxed mb-3">
            Starting phase for new sessions
          </p>
          <select
            id="defaultPhase"
            value={settings.defaultPhase}
            onChange={(e) => updateSetting('defaultPhase', e.target.value as WorkflowSettings['defaultPhase'])}
            disabled={saving}
            className="w-full px-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="prompt">PROMPT</option>
            <option value="review">REVIEW</option>
            <option value="ship">SHIP</option>
          </select>
        </div>

        {/* Auto Reset */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
          <div className="flex-1 min-w-0 pr-4">
            <label htmlFor="autoReset" className="block text-xs font-semibold text-zinc-200 uppercase tracking-wide mb-1">
              Auto-Reset After Ship
            </label>
            <p className="text-xs text-zinc-500 font-mono leading-relaxed">
              Return to Prompt phase after successful ship
            </p>
          </div>
          <button
            id="autoReset"
            type="button"
            role="switch"
            aria-checked={settings.autoResetAfterShip}
            onClick={() => updateSetting('autoResetAfterShip', !settings.autoResetAfterShip)}
            disabled={saving}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950',
              settings.autoResetAfterShip ? 'bg-emerald-500' : 'bg-zinc-700',
              saving && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                settings.autoResetAfterShip ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {/* Show Blocked Notifications */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
          <div className="flex-1 min-w-0 pr-4">
            <label htmlFor="notifications" className="block text-xs font-semibold text-zinc-200 uppercase tracking-wide mb-1">
              Blocked Operation Alerts
            </label>
            <p className="text-xs text-zinc-500 font-mono leading-relaxed">
              Show toast notifications when operations are blocked
            </p>
          </div>
          <button
            id="notifications"
            type="button"
            role="switch"
            aria-checked={settings.showBlockedNotifications}
            onClick={() => updateSetting('showBlockedNotifications', !settings.showBlockedNotifications)}
            disabled={saving}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950',
              settings.showBlockedNotifications ? 'bg-emerald-500' : 'bg-zinc-700',
              saving && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                settings.showBlockedNotifications ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>

      {/* Info Footer */}
      <div className="pt-4 border-t border-zinc-800/50">
        <div className="text-xs text-zinc-500 font-mono leading-relaxed space-y-2">
          <p>
            <span className="text-zinc-400">⚡</span> Workflow enforcement prevents accidental commits in non-Ship phases
          </p>
          <p>
            <span className="text-zinc-400">🔒</span> Blocked operations: <code className="text-emerald-400">git commit</code>, <code className="text-emerald-400">git push</code>, <code className="text-emerald-400">gh pr create</code>
          </p>
          <p>
            <span className="text-zinc-400">✓</span> Allowed operations: <code className="text-zinc-400">git status</code>, <code className="text-zinc-400">git diff</code>, all read tools
          </p>
        </div>
      </div>
    </div>
  );
}
