import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Folder, Link, Key, Settings2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { AppHeader } from '../components/ui/AppHeader';
import { BackgroundTexture } from '../components/ui/BackgroundTexture';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'workspaces',
    label: 'Workspaces',
    path: '/settings/workspaces',
    icon: <Folder className="h-4 w-4" />,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    path: '/settings/integrations',
    icon: <Link className="h-4 w-4" />,
  },
  {
    id: 'api-config',
    label: 'API Configuration',
    path: '/settings/api-config',
    icon: <Key className="h-4 w-4" />,
  },
  {
    id: 'system',
    label: 'System',
    path: '/settings/system',
    icon: <Settings2 className="h-4 w-4" />,
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefersReduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState('workspaces');

  // Determine active tab from URL
  useEffect(() => {
    const path = location.pathname;
    const tab = NAV_ITEMS.find(item => path.startsWith(item.path));
    if (tab) {
      setActiveTab(tab.id);
    } else if (path === '/settings') {
      // Redirect to workspaces if just /settings
      navigate('/settings/workspaces', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleNavClick = (item: NavItem) => {
    setActiveTab(item.id);
    navigate(item.path);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#05070c] text-white">
      <BackgroundTexture />

      <div className="relative flex-1 flex flex-col overflow-hidden min-h-0">
        <AppHeader
          subtitle="Configure workspaces and integrations"
          backTo="/"
          hideSettings
        />

        <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full px-6">
          {/* Header row - matches Dashboard pattern */}
          <motion.div
            className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
            initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {activeTab === 'workspaces' ? 'Workspaces' : activeTab === 'integrations' ? 'Integrations' : activeTab === 'system' ? 'System' : 'API Configuration'}
              </h1>
              <p className="mt-1 text-sm text-white/60">
                {activeTab === 'workspaces'
                  ? 'Organize repositories and connect to GitHub or GitLab.'
                  : activeTab === 'integrations'
                  ? 'Configure OAuth apps and shared Docker services.'
                  : activeTab === 'system'
                  ? 'Updates, cache management, and system preferences.'
                  : 'Configure Claude API token for usage tracking.'}
              </p>
            </div>
          </motion.div>

          {/* Navigation Tabs - stacks vertically on mobile, horizontal on desktop */}
          <motion.nav
            className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center"
            initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            role="tablist"
            aria-label="Settings navigation"
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                role="tab"
                aria-selected={activeTab === item.id}
                aria-controls={`${item.id}-panel`}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 sm:px-3 sm:py-1.5 text-sm font-medium transition-all ring-1',
                  activeTab === item.id
                    ? 'bg-white text-black ring-white'
                    : 'bg-white/5 text-white/80 ring-white/10 hover:bg-white/10'
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.nav>

          {/* Content Area */}
          <motion.main
            className="mt-4 flex-1 overflow-y-auto min-h-0 pb-6"
            initial={prefersReduced ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <Outlet />
          </motion.main>
        </div>
      </div>
    </div>
  );
}
