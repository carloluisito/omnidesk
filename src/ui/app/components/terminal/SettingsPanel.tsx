import { useState } from 'react';
import { X, Sun, Moon, Monitor, Volume2, VolumeX, Minimize2, Maximize2, Keyboard, RotateCcw } from 'lucide-react';
import { useThemeStore, type Theme, type AccentColor, type FontSize } from '../../store/themeStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { cn } from '../../lib/cn';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCENT_OPTIONS: { value: AccentColor; label: string; color: string }[] = [
  { value: 'blue', label: 'Blue', color: 'bg-blue-500' },
  { value: 'purple', label: 'Purple', color: 'bg-purple-500' },
  { value: 'green', label: 'Green', color: 'bg-green-500' },
  { value: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', color: 'bg-pink-500' },
];

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const KEYBOARD_SHORTCUTS = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Open command palette' },
      { keys: ['Ctrl', 'Shift', 'T'], description: 'New session' },
      { keys: ['Ctrl', 'W'], description: 'Close session' },
      { keys: ['Ctrl', '1-9'], description: 'Switch to session' },
      { keys: ['Ctrl', '</>'], description: 'Previous/next session' },
      { keys: ['Ctrl', 'Shift', 'F'], description: 'Search sessions' },
      { keys: ['Ctrl', 'Shift', 'G'], description: 'Toggle changes panel' },
      { keys: ['Ctrl', 'Shift', 'P'], description: 'Toggle plan mode' },
      { keys: ['Esc'], description: 'Cancel/close' },
    ],
  },
  {
    category: 'Diff Viewer',
    shortcuts: [
      { keys: ['I'], description: 'Inline view' },
      { keys: ['S'], description: 'Side-by-side view' },
      { keys: ['V'], description: 'View full file' },
      { keys: ['F'], description: 'Toggle fullscreen' },
    ],
  },
];

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    theme,
    accentColor,
    fontSize,
    compactMode,
    soundEnabled,
    setTheme,
    setAccentColor,
    setFontSize,
    setCompactMode,
    setSoundEnabled,
    resetToDefaults,
  } = useThemeStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  const handleReset = () => {
    resetToDefaults();
    setShowResetConfirm(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <h2 id="settings-panel-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Theme
            </label>
            <div className="flex gap-2" role="radiogroup" aria-label="Theme selection">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  role="radio"
                  aria-checked={theme === option.value}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    theme === option.value
                      ? 'border-transparent bg-accent-dynamic text-white'
                      : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  )}
                >
                  <option.icon className="h-4 w-4" aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Accent Color
            </label>
            <div className="flex gap-3" role="radiogroup" aria-label="Accent color selection">
              {ACCENT_OPTIONS.map((option) => (
                <div key={option.value} className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => setAccentColor(option.value)}
                    role="radio"
                    aria-checked={accentColor === option.value}
                    aria-label={option.label}
                    className={cn(
                      'w-10 h-10 rounded-full transition-all',
                      option.color,
                      accentColor === option.value
                        ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ring-zinc-400'
                        : 'opacity-60 hover:opacity-100'
                    )}
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {option.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Font Size
            </label>
            <div className="flex gap-2" role="radiogroup" aria-label="Font size selection">
              {FONT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFontSize(option.value)}
                  role="radio"
                  aria-checked={fontSize === option.value}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg border text-sm transition-colors',
                    fontSize === option.value
                      ? 'border-transparent bg-accent-dynamic text-white'
                      : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            {/* Compact Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {compactMode ? (
                  <Minimize2 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                )}
                <div>
                  <span id="compact-mode-label" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Compact Mode
                  </span>
                  <p className="text-xs text-zinc-500">Reduce spacing for more content</p>
                </div>
              </div>
              <button
                onClick={() => setCompactMode(!compactMode)}
                role="switch"
                aria-checked={compactMode}
                aria-labelledby="compact-mode-label"
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  compactMode ? 'bg-accent-dynamic' : 'bg-zinc-300 dark:bg-zinc-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    compactMode ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* Sound */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                )}
                <div>
                  <span id="sound-label" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Sound Effects
                  </span>
                  <p className="text-xs text-zinc-500">Play sounds for notifications</p>
                </div>
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                role="switch"
                aria-checked={soundEnabled}
                aria-labelledby="sound-label"
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  soundEnabled ? 'bg-accent-dynamic' : 'bg-zinc-300 dark:bg-zinc-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Reset to Defaults */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
            {showResetConfirm ? (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 ring-1 ring-red-200 dark:ring-red-800">
                <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                  Reset all settings to default values?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset to Defaults
              </button>
            )}
          </div>

          {/* Keyboard Shortcuts */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Keyboard Shortcuts
              </span>
            </div>
            <div className="space-y-4">
              {KEYBOARD_SHORTCUTS.map((group) => (
                <div key={group.category}>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                    {group.category}
                  </h4>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.description}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded text-zinc-700 dark:text-zinc-300">
                                {key}
                              </kbd>
                              {i < shortcut.keys.length - 1 && (
                                <span className="text-zinc-400 text-xs">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
          <p className="text-xs text-zinc-500 text-center">
            Settings are saved automatically
          </p>
        </div>
      </div>
    </div>
  );
}
