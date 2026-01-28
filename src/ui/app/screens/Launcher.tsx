import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Terminal, Settings } from 'lucide-react';

export default function Launcher() {
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  const buttons = [
    {
      id: 'terminal',
      label: 'Terminal',
      description: 'Claude-powered development sessions',
      icon: Terminal,
      path: '/terminal',
      color: 'bg-blue-600 hover:bg-blue-700',
      iconColor: 'text-blue-400',
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Configure workspaces and integrations',
      icon: Settings,
      path: '/settings',
      color: 'bg-zinc-600 hover:bg-zinc-700',
      iconColor: 'text-zinc-400',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-12">
        {/* Logo/Title */}
        <motion.div
          className="mb-12 text-center"
          initial={prefersReduced ? {} : { opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
            ClaudeDesk
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            AI-Powered Development Platform
          </p>
        </motion.div>

        {/* Navigation Buttons */}
        <motion.div
          className="w-full space-y-4"
          initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {buttons.map((button, index) => {
            const Icon = button.icon;
            return (
              <motion.button
                key={button.id}
                onClick={() => navigate(button.path)}
                className={`w-full flex items-center gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-5 text-left transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900`}
                initial={prefersReduced ? {} : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: 0.15 + index * 0.05 }}
                whileHover={prefersReduced ? {} : { scale: 1.01 }}
                whileTap={prefersReduced ? {} : { scale: 0.99 }}
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${button.color}`}>
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {button.label}
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {button.description}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Version */}
        <motion.p
          className="mt-12 text-xs text-zinc-400 dark:text-zinc-600"
          initial={prefersReduced ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          v1.1.0
        </motion.p>
      </div>
    </div>
  );
}
