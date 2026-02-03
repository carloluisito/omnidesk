import { useState, useEffect, useRef } from 'react';
import { Github, Copy, Check, Loader2, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { api } from '../../lib/api';

interface Workspace {
  id: string;
  name: string;
  scanPath: string;
  github: {
    username: string;
    tokenScope: string;
    connected: boolean;
  } | null;
  createdAt: string;
  updatedAt?: string;
}

interface GitHubConnectModalProps {
  workspace: Workspace | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface DeviceFlowResponse {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

interface PollResponse {
  status: 'pending' | 'success' | 'expired' | 'error';
  user?: {
    username: string;
    name: string;
    avatarUrl: string;
  };
  error?: string;
}

export function GitHubConnectModal({ workspace, onClose, onSuccess }: GitHubConnectModalProps) {
  const [stage, setStage] = useState<'loading' | 'code' | 'success' | 'error'>('loading');
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowResponse | null>(null);
  const [connectedUser, setConnectedUser] = useState<PollResponse['user'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (workspace) {
      startDeviceFlow();
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [workspace]);

  const startDeviceFlow = async () => {
    if (!workspace) return;

    setStage('loading');
    setError(null);

    try {
      const response = await api<DeviceFlowResponse>(
        'POST',
        `/workspaces/${workspace.id}/github/connect`
      );
      setDeviceFlow(response);
      setStage('code');

      // Start polling
      startPolling(workspace.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start GitHub connection';
      setError(message);
      setStage('error');
    }
  };

  const startPolling = (workspaceId: string) => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Poll every 5 seconds
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await api<PollResponse>(
          'GET',
          `/workspaces/${workspaceId}/github/status`
        );

        if (response.status === 'success' && response.user) {
          // Success!
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setConnectedUser(response.user);
          setStage('success');
        } else if (response.status === 'expired') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setError('Device code has expired. Please try again.');
          setStage('error');
        } else if (response.status === 'error') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setError(response.error || 'Authorization failed');
          setStage('error');
        }
        // If pending, continue polling
      } catch (err) {
        console.error('[GitHub Connect] Polling error:', err);
        // Check if this is a fatal error (404 = no active flow)
        if (err instanceof Error && err.message.includes('404')) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setError('Authentication session expired. Please try again.');
          setStage('error');
        }
        // Otherwise don't stop on network errors, keep trying
      }
    }, 5000);
  };

  const handleCopy = async () => {
    if (!deviceFlow) return;

    try {
      await navigator.clipboard.writeText(deviceFlow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenGitHub = () => {
    if (!deviceFlow) return;
    window.open(deviceFlow.verificationUri, '_blank');
  };

  const handleClose = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    onClose();
  };

  const handleDone = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    onSuccess();
  };

  return (
    <Modal
      isOpen={!!workspace}
      onClose={stage !== 'loading' ? handleClose : () => {}}
      title={stage === 'success' ? 'Connected!' : `Connect GitHub to "${workspace?.name}"`}
    >
      <div className="space-y-4">
        {/* Loading State */}
        {stage === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400">Initializing GitHub connection...</p>
          </div>
        )}

        {/* Device Code State */}
        {stage === 'code' && deviceFlow && (
          <>
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                1. Go to <span className="font-medium text-zinc-200">github.com/login/device</span>
              </p>
              <button
                onClick={handleOpenGitHub}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50"
              >
                <ExternalLink className="h-4 w-4" />
                Open GitHub
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-zinc-400">2. Enter this code:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center">
                  <span className="font-mono text-2xl font-bold tracking-[0.3em] text-zinc-100">
                    {deviceFlow.userCode}
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-200"
                  title="Copy code"
                >
                  {copied ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <p className="text-sm text-blue-400">
                Waiting for authorization...
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50"
            >
              Cancel
            </button>
          </>
        )}

        {/* Success State */}
        {stage === 'success' && connectedUser && (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-zinc-100">
                  Successfully connected!
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Signed in as <span className="font-medium text-zinc-200">{connectedUser.username}</span>
                  {connectedUser.name && (
                    <span className="text-zinc-500"> ({connectedUser.name})</span>
                  )}
                </p>
              </div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-xs text-zinc-400">
                Git push, pull, and PR creation now work automatically for repositories in this workspace.
              </p>
              <p className="text-xs text-zinc-500">
                No SSH keys or GitHub CLI needed.
              </p>
            </div>

            <button
              onClick={handleDone}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Done
            </button>
          </>
        )}

        {/* Error State */}
        {stage === 'error' && (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-zinc-100">
                  Connection failed
                </p>
                <p className="mt-1 text-sm text-red-400">
                  {error}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/50 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50"
              >
                Cancel
              </button>
              <button
                onClick={startDeviceFlow}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
