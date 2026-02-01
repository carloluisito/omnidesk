import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Github, Gitlab, Container, Check, ExternalLink, ChevronDown, Play, Square, Loader2, Copy, Database, Server, AlertTriangle, RefreshCw, ChevronUp, Bot, ShieldCheck, X, Globe, Puzzle } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useToast } from '../../hooks/useToast';
import { RemoteAccess } from './RemoteAccess';
import { MCPServersPanel } from '../../components/settings/MCPServersPanel';
import type { GitHubSettings, GitLabSettings } from '../../types';

interface DockerService {
  enabled: boolean;
  port: number;
  image: string;
  version?: string;
  username?: string;
  password?: string;
  database?: string;
  dataVolume: boolean;
}

interface DockerSettings {
  enabled: boolean;
  autoStart: boolean;
  services: {
    postgres: DockerService;
    redis: DockerService;
  };
  networkName: string;
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting';
  port: number;
  containerId?: string;
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
}

interface DockerState {
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  services: Record<string, ServiceStatus>;
  error?: string;
  startedAt?: string;
}

interface DockerAvailability {
  docker: boolean;
  compose: boolean;
  available: boolean;
}

interface ConnectionInfo {
  url: string;
  env: Record<string, string>;
}

interface PortCheckResult {
  port: number;
  inUse: boolean;
}

interface AgentSettings {
  pinnedAgentIds: string[];
  autoDetect: boolean;
}

interface ClaudeSettings {
  permissionMode: 'autonomous' | 'read-only';
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  onOpenChange?: (isOpen: boolean) => void;
}

function CollapsibleSection({ title, icon, children, defaultOpen = false, badge, onOpenChange }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const prefersReduced = useReducedMotion();

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onOpenChange?.(newState);
  };

  return (
    <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full px-4 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            {icon}
            {title}
          </div>
          <div className="flex items-center gap-2">
            {badge}
            <ChevronDown className={cn(
              "h-5 w-5 text-white/40 transition-transform",
              isOpen && "rotate-180"
            )} />
          </div>
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReduced ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SimpleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function SimpleSection({ title, icon, children }: SimpleSectionProps) {
  return (
    <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-white mb-4">
        {icon}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function CategoryDivider({ label }: { label: string }) {
  return (
    <div className="mt-6 mb-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">{label}</span>
        <div className="flex-1 border-t border-zinc-700/50" />
      </div>
    </div>
  );
}

// Expandable connection URL component
function ExpandableConnectionUrl({ url, label, copiedField, onCopy }: {
  url: string;
  label: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fieldId = `${label.toLowerCase()}-url`;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white/70"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {label}
        </button>
        <button
          onClick={() => onCopy(url, fieldId)}
          className="p-1 text-white/40 hover:text-white/70 rounded-lg hover:bg-white/10 transition"
          title="Copy to clipboard"
        >
          {copiedField === fieldId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      {expanded && (
        <code className="block rounded-xl bg-white/5 px-3 py-2 font-mono text-xs text-white/60 break-all ring-1 ring-white/10">
          {url}
        </code>
      )}
    </div>
  );
}

export default function Integrations() {
  const prefersReduced = useReducedMotion();
  const toast = useToast();

  // GitHub state
  const [githubSettings, setGithubSettings] = useState<GitHubSettings | null>(null);
  const [testingGithub, setTestingGithub] = useState(false);

  // GitLab state
  const [gitlabSettings, setGitlabSettings] = useState<GitLabSettings | null>(null);
  const [testingGitlab, setTestingGitlab] = useState(false);

  // Agent state
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);

  // Claude settings (SEC-04: Permission modes)
  const [claudeSettings, setClaudeSettings] = useState<ClaudeSettings | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [pendingPermissionMode, setPendingPermissionMode] = useState<'autonomous' | 'read-only' | null>(null);
  const [selectedPermissionMode, setSelectedPermissionMode] = useState<'autonomous' | 'read-only'>('autonomous');

  // Track GitHub/GitLab expansion state for conditional OAuth banner
  const [githubExpanded, setGithubExpanded] = useState(false);
  const [gitlabExpanded, setGitlabExpanded] = useState(false);

  // Docker state
  const [dockerSettings, setDockerSettings] = useState<DockerSettings | null>(null);
  const [dockerState, setDockerState] = useState<DockerState | null>(null);
  const [availability, setAvailability] = useState<DockerAvailability | null>(null);
  const [connections, setConnections] = useState<Record<string, ConnectionInfo>>({});
  const [portConflicts, setPortConflicts] = useState<Record<string, boolean>>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // OAuth callback URL (for display)
  const callbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:5174/oauth/callback';

  useEffect(() => {
    loadCoreSettings();
    loadDockerSettings();
  }, []);

  // Sync selectedPermissionMode with claudeSettings
  useEffect(() => {
    if (claudeSettings) {
      setSelectedPermissionMode(claudeSettings.permissionMode);
    }
  }, [claudeSettings]);

  // Load fast settings first so the UI renders quickly
  const loadCoreSettings = async () => {
    try {
      const [github, gitlab, agents, claude] = await Promise.all([
        api<GitHubSettings>('GET', '/settings/github'),
        api<GitLabSettings>('GET', '/settings/gitlab'),
        api<AgentSettings>('GET', '/settings/agents'),
        api<ClaudeSettings>('GET', '/settings/claude'),
      ]);

      setGithubSettings(github);
      setGitlabSettings(gitlab);
      setAgentSettings(agents);
      setClaudeSettings(claude);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load Docker data separately — these calls probe the Docker daemon and can be slow
  const loadDockerSettings = async () => {
    try {
      const [docker, dockerAvail, dockerStatus, dockerConn] = await Promise.all([
        api<DockerSettings>('GET', '/docker/settings'),
        api<DockerAvailability>('GET', '/docker/availability'),
        api<DockerState>('GET', '/docker/status').catch(() => ({ status: 'stopped' as const, services: {} })),
        api<Record<string, ConnectionInfo>>('GET', '/docker/connections').catch(() => ({})),
      ]);

      setDockerSettings(docker);
      setAvailability(dockerAvail);
      setDockerState(dockerStatus);
      setConnections(dockerConn);
    } catch (error) {
      console.error('Failed to load Docker settings:', error);
    }
  };

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Check port availability
  const checkPort = useCallback(async (port: number, serviceName: string) => {
    try {
      const result = await api<PortCheckResult>('GET', `/docker/check-port?port=${port}`);
      if (result.inUse) {
        setPortConflicts(prev => ({ ...prev, [serviceName]: true }));
      } else {
        setPortConflicts(prev => ({ ...prev, [serviceName]: false }));
      }
    } catch (error) {
      console.error('Failed to check port:', error);
    }
  }, []);

  // GitHub handlers
  const updateGithubSetting = async <K extends keyof GitHubSettings>(key: K, value: GitHubSettings[K]) => {
    if (!githubSettings) return;
    const newSettings = { ...githubSettings, [key]: value };
    setGithubSettings(newSettings);
    try {
      await api('PUT', '/settings/github', { [key]: value });
      showSaved();
    } catch (error) {
      console.error('Failed to save setting:', error);
      setGithubSettings(githubSettings);
    }
  };

  // GitLab handlers
  const updateGitlabSetting = async <K extends keyof GitLabSettings>(key: K, value: GitLabSettings[K]) => {
    if (!gitlabSettings) return;
    const newSettings = { ...gitlabSettings, [key]: value };
    setGitlabSettings(newSettings);
    try {
      await api('PUT', '/settings/gitlab', { [key]: value });
      showSaved();
    } catch (error) {
      console.error('Failed to save setting:', error);
      setGitlabSettings(gitlabSettings);
    }
  };

  // Test GitHub connection (tests all workspaces with GitHub connected)
  const testGitHubConnection = async () => {
    setTestingGithub(true);
    try {
      // Get workspaces
      const workspaces = await api<{ id: string; name: string; github: { connected: boolean } | null }[]>('GET', '/workspaces');
      const githubWorkspaces = workspaces.filter(ws => ws.github?.connected);

      if (githubWorkspaces.length === 0) {
        toast.info('No workspaces with GitHub connected');
        return;
      }

      // Test first workspace with GitHub connected
      const result = await api<{ connected: boolean; username?: string; error?: string }>(
        'POST',
        '/settings/github/test',
        { workspaceId: githubWorkspaces[0].id }
      );

      if (result.connected) {
        toast.success(`GitHub connected as ${result.username}`);
      } else {
        toast.error(result.error || 'GitHub connection test failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      toast.error(message);
    } finally {
      setTestingGithub(false);
    }
  };

  // Test GitLab connection (tests all workspaces with GitLab connected)
  const testGitLabConnection = async () => {
    setTestingGitlab(true);
    try {
      // Get workspaces
      const workspaces = await api<{ id: string; name: string; gitlab: { connected: boolean } | null }[]>('GET', '/workspaces');
      const gitlabWorkspaces = workspaces.filter(ws => ws.gitlab?.connected);

      if (gitlabWorkspaces.length === 0) {
        toast.info('No workspaces with GitLab connected');
        return;
      }

      // Test first workspace with GitLab connected
      const result = await api<{ connected: boolean; username?: string; error?: string }>(
        'POST',
        '/settings/gitlab/test',
        { workspaceId: gitlabWorkspaces[0].id }
      );

      if (result.connected) {
        toast.success(`GitLab connected as ${result.username}`);
      } else {
        toast.error(result.error || 'GitLab connection test failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      toast.error(message);
    } finally {
      setTestingGitlab(false);
    }
  };

  // Agent handlers
  const updateAgentSetting = async <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
    if (!agentSettings) return;
    const newSettings = { ...agentSettings, [key]: value };
    setAgentSettings(newSettings);
    try {
      await api('PUT', '/settings/agents', { [key]: value });
      showSaved();
    } catch (error) {
      console.error('Failed to save agent setting:', error);
      setAgentSettings(agentSettings);
    }
  };

  // Claude permission mode handlers
  const handlePermissionModeSelection = (mode: 'autonomous' | 'read-only') => {
    setSelectedPermissionMode(mode);
  };

  const requestPermissionModeChange = () => {
    if (selectedPermissionMode === claudeSettings?.permissionMode) return;
    setPendingPermissionMode(selectedPermissionMode);
    setShowPermissionModal(true);
  };

  const confirmPermissionModeChange = async () => {
    if (!pendingPermissionMode || !claudeSettings) return;

    const newSettings = { ...claudeSettings, permissionMode: pendingPermissionMode };
    setClaudeSettings(newSettings);

    try {
      await api('PUT', '/settings/claude', { permissionMode: pendingPermissionMode });
      showSaved();
      toast.success(`Permission mode changed to ${pendingPermissionMode}`);
    } catch (error) {
      console.error('Failed to save Claude permission mode:', error);
      setClaudeSettings(claudeSettings);
      toast.error('Failed to save permission mode');
    } finally {
      setShowPermissionModal(false);
      setPendingPermissionMode(null);
    }
  };

  // Docker handlers
  const updateDockerSettings = async (updates: Partial<DockerSettings>) => {
    if (!dockerSettings) return;
    const newSettings = { ...dockerSettings, ...updates };
    setDockerSettings(newSettings);
    try {
      await api('PUT', '/docker/settings', updates);
      const connectionsData = await api<Record<string, ConnectionInfo>>('GET', '/docker/connections').catch(() => ({}));
      setConnections(connectionsData);
      showSaved();
    } catch (error) {
      console.error('Failed to save setting:', error);
      setDockerSettings(dockerSettings);
    }
  };

  const updateDockerService = async (serviceName: 'postgres' | 'redis', updates: Partial<DockerService>) => {
    if (!dockerSettings) return;
    const newSettings = {
      ...dockerSettings,
      services: {
        ...dockerSettings.services,
        [serviceName]: { ...dockerSettings.services[serviceName], ...updates },
      },
    };
    setDockerSettings(newSettings);
    try {
      await api('PUT', '/docker/settings', { services: { [serviceName]: updates } });
      const connectionsData = await api<Record<string, ConnectionInfo>>('GET', '/docker/connections').catch(() => ({}));
      setConnections(connectionsData);
      showSaved();
    } catch (error) {
      console.error('Failed to save service setting:', error);
      setDockerSettings(dockerSettings);
    }
  };

  const startDocker = async () => {
    setStarting(true);
    try {
      const status = await api<DockerState>('POST', '/docker/start');
      setDockerState(status);
      const connectionsData = await api<Record<string, ConnectionInfo>>('GET', '/docker/connections').catch(() => ({}));
      setConnections(connectionsData);
    } catch (error) {
      console.error('Failed to start Docker:', error);
    } finally {
      setStarting(false);
    }
  };

  const stopDocker = async () => {
    setStopping(true);
    try {
      const status = await api<DockerState>('POST', '/docker/stop');
      setDockerState(status);
    } catch (error) {
      console.error('Failed to stop Docker:', error);
    } finally {
      setStopping(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-emerald-400 bg-emerald-500/20';
      case 'stopped': return 'text-white/50 bg-white/10';
      case 'starting': return 'text-yellow-400 bg-yellow-500/20';
      case 'error': return 'text-red-400 bg-red-500/20';
      default: return 'text-white/50 bg-white/10';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  const showOAuthBanner = githubExpanded || gitlabExpanded;

  return (
    <motion.div
      className="space-y-4"
      initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Save indicator */}
      {saved && (
        <div className="fixed top-4 right-4 flex items-center gap-1 rounded-2xl bg-emerald-600 px-3 py-2 text-sm text-white shadow-lg z-50 ring-1 ring-emerald-500/50">
          <Check className="h-4 w-4" /> Saved
        </div>
      )}

      {/* OAuth Callback URL Info - Conditional */}
      {showOAuthBanner && (
        <div className="rounded-2xl bg-blue-500/10 p-4 ring-1 ring-blue-500/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-300">OAuth Callback URL</p>
              <p className="text-xs text-blue-400/70 mt-1">
                Use this URL when configuring your GitHub or GitLab OAuth application:
              </p>
              <code className="block mt-2 rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-white/80 ring-1 ring-white/10">
                {callbackUrl}
              </code>
            </div>
            <button
              onClick={() => copyToClipboard(callbackUrl, 'callback-url')}
              className="p-2 text-blue-400 hover:text-blue-300 rounded-xl hover:bg-white/10 transition flex-shrink-0"
              title="Copy callback URL"
            >
              {copiedField === 'callback-url' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* SOURCE CONTROL Category */}
      <CategoryDivider label="Source Control" />

      {/* GitHub Section */}
      <CollapsibleSection
        title="GitHub"
        icon={<Github className="h-5 w-5" />}
        badge={githubSettings?.clientId ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">Configured</span>
        ) : (
          <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">Not Connected</span>
        )}
        onOpenChange={setGithubExpanded}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-white/60">Client ID</label>
            <input
              type="text"
              value={githubSettings?.clientId || ''}
              onChange={(e) => updateGithubSetting('clientId', e.target.value)}
              placeholder="Ov23li..."
              className="w-full rounded-2xl bg-white/5 px-4 py-2.5 font-mono text-sm text-white placeholder-white/35 ring-1 ring-white/10 focus:ring-white/20 focus:outline-none"
            />
            <p className="text-xs text-white/40">
              The Client ID from your GitHub OAuth App
            </p>
          </div>

          {/* Test Connection Button */}
          {githubSettings?.clientId && (
            <button
              onClick={testGitHubConnection}
              disabled={testingGithub}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white/70 ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-50"
            >
              {testingGithub ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Test Connection
            </button>
          )}

          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs text-white/50 mb-2">
              <strong className="text-white/70">Setup:</strong>{' '}
              <a
                href="https://github.com/settings/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:underline"
              >
                Create OAuth App <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p className="text-xs text-white/40">
              Set callback URL to <code className="rounded bg-white/10 px-1 py-0.5 text-white/60">{callbackUrl}</code> and enable Device Flow.
            </p>
          </div>
        </div>
      </CollapsibleSection>


      {/* GitLab Section */}
      <CollapsibleSection
        title="GitLab"
        icon={<Gitlab className="h-5 w-5 text-orange-500" />}
        badge={gitlabSettings?.clientId ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">Configured</span>
        ) : (
          <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">Not Connected</span>
        )}
        onOpenChange={setGitlabExpanded}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-white/60">Application ID</label>
            <input
              type="text"
              value={gitlabSettings?.clientId || ''}
              onChange={(e) => updateGitlabSetting('clientId', e.target.value)}
              placeholder="Enter your GitLab Application ID..."
              className="w-full rounded-2xl bg-white/5 px-4 py-2.5 font-mono text-sm text-white placeholder-white/35 ring-1 ring-white/10 focus:ring-orange-500/50 focus:outline-none"
            />
            <p className="text-xs text-white/40">
              The Application ID from your GitLab OAuth Application
            </p>
          </div>

          {/* Test Connection Button */}
          {gitlabSettings?.clientId && (
            <button
              onClick={testGitLabConnection}
              disabled={testingGitlab}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white/70 ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-50"
            >
              {testingGitlab ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Test Connection
            </button>
          )}

          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="text-xs text-white/50 mb-2">
              <strong className="text-white/70">Setup:</strong>{' '}
              <a
                href="https://gitlab.com/-/user_settings/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-orange-400 hover:underline"
              >
                Create OAuth App <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p className="text-xs text-white/40">
              Enable Device Authorization Grant and select <code className="rounded bg-white/10 px-1 py-0.5 text-white/60">api</code> + <code className="rounded bg-white/10 px-1 py-0.5 text-white/60">read_user</code> scopes.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* SERVICES Category */}
      <CategoryDivider label="Services" />

      {/* Docker Section */}
      <CollapsibleSection
        title="Docker Services"
        icon={<Container className="h-5 w-5" />}
        defaultOpen={dockerSettings?.enabled}
        badge={
          dockerState?.status === 'running' ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
              Running {dockerSettings?.services.postgres.enabled && dockerSettings?.services.redis.enabled ? '(2)' : '(1)'}
            </span>
          ) : availability?.available ? (
            <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">Available</span>
          ) : (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">Unavailable</span>
          )
        }
      >
        <div className="space-y-4">
          {/* Docker Availability */}
          {!availability?.available && (
            <div className="rounded-2xl bg-red-500/10 p-3 ring-1 ring-red-500/20">
              <p className="text-sm text-red-400">
                Docker is not available. Install Docker Desktop to use shared services.
              </p>
            </div>
          )}

          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Enable shared Docker services</p>
              <p className="text-xs text-white/50">PostgreSQL and Redis for all repositories</p>
            </div>
            <button
              onClick={() => updateDockerSettings({ enabled: !dockerSettings?.enabled })}
              disabled={!availability?.available}
              role="switch"
              aria-checked={dockerSettings?.enabled}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                dockerSettings?.enabled ? 'bg-blue-600' : 'bg-white/20'
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                dockerSettings?.enabled ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          {dockerSettings?.enabled && (
            <>
              {/* Auto-start Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Auto-start on launch</p>
                  <p className="text-xs text-white/50">Start Docker services when ClaudeDesk starts</p>
                </div>
                <button
                  onClick={() => updateDockerSettings({ autoStart: !dockerSettings?.autoStart })}
                  role="switch"
                  aria-checked={dockerSettings?.autoStart}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    dockerSettings?.autoStart ? 'bg-blue-600' : 'bg-white/20'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    dockerSettings?.autoStart ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              {/* Control Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={startDocker}
                  disabled={starting || stopping || dockerState?.status === 'running'}
                  className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Start
                </button>
                <button
                  onClick={stopDocker}
                  disabled={starting || stopping || dockerState?.status === 'stopped'}
                  className="flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Stop
                </button>
              </div>

              {/* Status */}
              {dockerState?.status && dockerState.status !== 'stopped' && (
                <div className={cn('rounded-2xl px-3 py-2 text-sm', getStatusColor(dockerState.status))}>
                  Status: {dockerState.status}
                </div>
              )}

              {/* Service Cards */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* PostgreSQL Card */}
                <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-4 space-y-3 ring-1 ring-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20">
                        <Database className="h-4 w-4 text-blue-400" />
                      </div>
                      <span className="font-medium text-sm text-white">PostgreSQL</span>
                    </div>
                    <button
                      onClick={() => updateDockerService('postgres', { enabled: !dockerSettings?.services.postgres.enabled })}
                      role="switch"
                      aria-checked={dockerSettings?.services.postgres.enabled}
                      className={cn(
                        'relative h-5 w-9 rounded-full transition-colors',
                        dockerSettings?.services.postgres.enabled ? 'bg-blue-600' : 'bg-white/20'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                        dockerSettings?.services.postgres.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>
                  {dockerSettings?.services.postgres.enabled && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-white/50">Port</label>
                          <div className="relative">
                            <input
                              type="number"
                              value={dockerSettings.services.postgres.port}
                              onChange={(e) => updateDockerService('postgres', { port: parseInt(e.target.value) || 5432 })}
                              onBlur={() => checkPort(dockerSettings.services.postgres.port, 'postgres')}
                              className={cn(
                                "w-full rounded-xl bg-white/5 px-2 py-1.5 text-white ring-1 focus:outline-none",
                                portConflicts.postgres
                                  ? "ring-amber-500/50 focus:ring-amber-500/70"
                                  : "ring-white/10 focus:ring-white/20"
                              )}
                            />
                            {portConflicts.postgres && (
                              <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400" />
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-white/50">Database</label>
                          <input
                            type="text"
                            value={dockerSettings.services.postgres.database || 'claudedesk_dev'}
                            onChange={(e) => updateDockerService('postgres', { database: e.target.value })}
                            className="w-full rounded-xl bg-white/5 px-2 py-1.5 text-white ring-1 ring-white/10 focus:ring-white/20 focus:outline-none"
                          />
                        </div>
                      </div>
                      {portConflicts.postgres && (
                        <p className="text-xs text-amber-400">Port may be in use by another service</p>
                      )}
                      {connections.postgres && (
                        <ExpandableConnectionUrl
                          url={connections.postgres.url}
                          label="Connection URL"
                          copiedField={copiedField}
                          onCopy={copyToClipboard}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Redis Card */}
                <div className="rounded-2xl bg-gradient-to-br from-red-500/10 to-red-600/5 p-4 space-y-3 ring-1 ring-red-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/20">
                        <Server className="h-4 w-4 text-red-400" />
                      </div>
                      <span className="font-medium text-sm text-white">Redis</span>
                    </div>
                    <button
                      onClick={() => updateDockerService('redis', { enabled: !dockerSettings?.services.redis.enabled })}
                      role="switch"
                      aria-checked={dockerSettings?.services.redis.enabled}
                      className={cn(
                        'relative h-5 w-9 rounded-full transition-colors',
                        dockerSettings?.services.redis.enabled ? 'bg-red-600' : 'bg-white/20'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                        dockerSettings?.services.redis.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>
                  {dockerSettings?.services.redis.enabled && (
                    <div className="space-y-2">
                      <div className="text-xs">
                        <label className="text-white/50">Port</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={dockerSettings.services.redis.port}
                            onChange={(e) => updateDockerService('redis', { port: parseInt(e.target.value) || 6379 })}
                            onBlur={() => checkPort(dockerSettings.services.redis.port, 'redis')}
                            className={cn(
                              "w-full rounded-xl bg-white/5 px-2 py-1.5 text-white ring-1 focus:outline-none",
                              portConflicts.redis
                                ? "ring-amber-500/50 focus:ring-amber-500/70"
                                : "ring-white/10 focus:ring-white/20"
                            )}
                          />
                          {portConflicts.redis && (
                            <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400" />
                          )}
                        </div>
                      </div>
                      {portConflicts.redis && (
                        <p className="text-xs text-amber-400">Port may be in use by another service</p>
                      )}
                      {connections.redis && (
                        <ExpandableConnectionUrl
                          url={connections.redis.url}
                          label="Connection URL"
                          copiedField={copiedField}
                          onCopy={copyToClipboard}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Remote Access Section */}
      <CollapsibleSection
        title="Remote Access"
        icon={<Globe className="h-5 w-5" />}
        defaultOpen={false}
      >
        <RemoteAccess />
      </CollapsibleSection>

      {/* MCP Servers Section */}
      <MCPServersPanel defaultOpen={false} />

      {/* CLAUDE BEHAVIOR Category */}
      <CategoryDivider label="Claude Behavior" />

      {/* Permissions Section - Always Expanded */}
      <SimpleSection
        title="Permissions"
        icon={<ShieldCheck className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/60 mb-3 block">Global Permission Mode</label>
            <div className="space-y-2">
              <label className={cn(
                "flex items-start gap-3 rounded-2xl p-4 cursor-pointer transition-colors ring-1",
                selectedPermissionMode === 'autonomous'
                  ? "bg-amber-500/10 ring-amber-500/30"
                  : "bg-white/5 ring-white/10 hover:bg-white/10"
              )}>
                <input
                  type="radio"
                  name="permission-mode"
                  value="autonomous"
                  checked={selectedPermissionMode === 'autonomous'}
                  onChange={(e) => handlePermissionModeSelection(e.target.value as 'autonomous' | 'read-only')}
                  className="mt-0.5 h-4 w-4 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white mb-1">Autonomous (Full Access)</div>
                  <div className="text-xs text-white/50">
                    Claude can read, edit, delete files, and execute shell commands. Use for trusted projects.
                  </div>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 rounded-2xl p-4 cursor-pointer transition-colors ring-1",
                selectedPermissionMode === 'read-only'
                  ? "bg-emerald-500/10 ring-emerald-500/30"
                  : "bg-white/5 ring-white/10 hover:bg-white/10"
              )}>
                <input
                  type="radio"
                  name="permission-mode"
                  value="read-only"
                  checked={selectedPermissionMode === 'read-only'}
                  onChange={(e) => handlePermissionModeSelection(e.target.value as 'autonomous' | 'read-only')}
                  className="mt-0.5 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white mb-1">Read-Only (Safe Mode)</div>
                  <div className="text-xs text-white/50">
                    Claude can only read files and search. Use when exploring unfamiliar codebases.
                  </div>
                </div>
              </label>
            </div>
            <p className="text-xs text-white/40 mt-3">
              Controls what tools Claude can use. Workspaces can override this setting.
            </p>
          </div>

          <button
            onClick={requestPermissionModeChange}
            disabled={selectedPermissionMode === claudeSettings?.permissionMode}
            className={cn(
              "w-full rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
              selectedPermissionMode === claudeSettings?.permissionMode
                ? "bg-white/5 text-white/40 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            Change Mode
          </button>
        </div>
      </SimpleSection>

      {/* Agent Auto-Detection Section - Always Expanded */}
      <SimpleSection
        title="Agent Auto-Detection"
        icon={<Bot className="h-5 w-5" />}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-white mb-1">Enable agent auto-detection</p>
            <p className="text-xs text-white/50">
              Automatically select the best agent based on your prompt. When disabled, Claude will respond directly unless you manually select an agent.
            </p>
          </div>
          <button
            onClick={() => updateAgentSetting('autoDetect', !agentSettings?.autoDetect)}
            role="switch"
            aria-checked={agentSettings?.autoDetect}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors flex-shrink-0',
              agentSettings?.autoDetect ? 'bg-blue-600' : 'bg-white/20'
            )}
          >
            <span className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
              agentSettings?.autoDetect ? 'translate-x-5' : 'translate-x-0.5'
            )} />
          </button>
        </div>
      </SimpleSection>

      {/* Permission Mode Change Confirmation Modal */}
      {showPermissionModal && pendingPermissionMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-3xl bg-zinc-900 p-6 ring-1 ring-white/10 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                pendingPermissionMode === 'autonomous'
                  ? "bg-amber-500/20"
                  : "bg-emerald-500/20"
              )}>
                <ShieldCheck className={cn(
                  "h-5 w-5",
                  pendingPermissionMode === 'autonomous'
                    ? "text-amber-400"
                    : "text-emerald-400"
                )} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">
                  Change Permission Mode?
                </h3>
                <p className="text-sm text-white/60">
                  {pendingPermissionMode === 'autonomous'
                    ? 'Switching to Autonomous mode will allow Claude to edit files and execute commands in all workspaces (unless overridden).'
                    : 'Switching to Read-Only mode will restrict Claude to only reading and searching files in all workspaces (unless overridden).'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPermissionModal(false);
                  setPendingPermissionMode(null);
                }}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPermissionModal(false);
                  setPendingPermissionMode(null);
                }}
                className="flex-1 rounded-2xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 ring-1 ring-white/10 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmPermissionModeChange}
                className={cn(
                  "flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium text-white transition-colors",
                  pendingPermissionMode === 'autonomous'
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                )}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
