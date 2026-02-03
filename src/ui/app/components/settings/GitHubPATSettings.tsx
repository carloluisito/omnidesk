/**
 * GitHubPATSettings - Personal Access Token Management
 *
 * A refined interface for configuring GitHub PATs at the workspace level.
 * Handles empty state, configuration, validation, and lifecycle management
 * with technical precision and user confidence-building interactions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { TokenInputField } from '../shared/TokenInputField';
import { api } from '../../lib/api';

interface GitHubPATSettingsProps {
  workspaceId: string;
}

interface TokenStatus {
  configured: boolean;
  username?: string;
  scopes?: string[];
  expiresAt?: string | null;
  createdAt?: string;
  expired?: boolean;
  daysUntilExpiration?: number | null;
}

interface ValidationResult {
  success: boolean;
  username?: string;
  scopes?: string[];
  avatarUrl?: string;
  error?: string;
}

type ViewState = 'empty' | 'configured' | 'input';

export function GitHubPATSettings({ workspaceId }: GitHubPATSettingsProps) {
  const [viewState, setViewState] = useState<ViewState>('empty');
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load token status on mount
  useEffect(() => {
    loadTokenStatus();
  }, [workspaceId]);

  const loadTokenStatus = async () => {
    try {
      const response = await api<TokenStatus>(
        'GET',
        `/workspaces/${workspaceId}/github-pat/status`
      );
      setTokenStatus(response);
      setViewState(response.configured ? 'configured' : 'empty');
    } catch (error) {
      console.error('Failed to load token status:', error);
      setViewState('empty');
    }
  };

  // Validate token format in real-time
  const getValidationState = (): 'valid' | 'invalid' | 'unknown' => {
    if (!tokenInput) return 'unknown';
    if (tokenInput.startsWith('ghp_') || tokenInput.startsWith('github_pat_')) {
      return 'valid';
    }
    return 'invalid';
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!tokenInput) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await api<ValidationResult>(
        'POST',
        `/workspaces/${workspaceId}/github-pat/test`,
        { token: tokenInput }
      );

      setValidationResult(response);
    } catch (error: any) {
      setValidationResult({
        success: false,
        error: error.message || 'Failed to validate token',
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Save token
  const handleSaveToken = async () => {
    if (!tokenInput || !validationResult?.success) return;

    setIsSaving(true);

    try {
      await api(
        'POST',
        `/workspaces/${workspaceId}/github-pat`,
        {
          token: tokenInput,
          username: validationResult.username,
          scopes: validationResult.scopes || ['repo'],
          expiresAt: null, // GitHub doesn't provide this via API
        }
      );

      // Reload status and reset state
      await loadTokenStatus();
      setTokenInput('');
      setValidationResult(null);
    } catch (error) {
      console.error('Failed to save token:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete token
  const handleDeleteToken = async () => {
    setIsDeleting(true);

    try {
      await api('DELETE', `/workspaces/${workspaceId}/github-pat`);

      // Reset to empty state
      await loadTokenStatus();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete token:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Update token (switch to input mode with existing token cleared)
  const handleUpdateToken = () => {
    setTokenInput('');
    setValidationResult(null);
    setViewState('input');
  };

  // Render expiration warning
  const renderExpirationWarning = () => {
    if (!tokenStatus?.daysUntilExpiration) return null;

    const { daysUntilExpiration, expired } = tokenStatus;
    const isUrgent = expired || daysUntilExpiration < 7;

    return (
      <div
        className={cn(
          'rounded-xl p-4 border-l-4 mb-4',
          'animate-in slide-in-from-top-2 fade-in duration-300',
          isUrgent
            ? 'bg-red-500/10 border-red-500 ring-1 ring-red-500/20'
            : 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-500/20'
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={cn(
              'h-5 w-5 flex-shrink-0 mt-0.5',
              isUrgent ? 'text-red-400' : 'text-amber-400'
            )}
          />
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium mb-1', isUrgent ? 'text-red-400' : 'text-amber-400')}>
              {expired ? 'Token Expired' : `Token expires in ${daysUntilExpiration} days`}
            </p>
            <p className="text-sm text-white/60">
              {expired
                ? 'Your token has expired. Update it to continue creating PRs in organization repositories.'
                : 'Renew your token before it expires to avoid interruption.'}
            </p>
          </div>
          <a
            href={`https://github.com/settings/tokens/new?scopes=repo,read:org&description=Claude%20Desk%20Integration`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
              isUrgent
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
            )}
          >
            Renew Token
          </a>
        </div>
      </div>
    );
  };

  // Empty state
  if (viewState === 'empty') {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/5 ring-1 ring-white/10 mb-6">
            <Key className="h-10 w-10 text-white/20" />
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">
            Personal Access Token
          </h3>

          <p className="text-sm text-white/60 max-w-md mx-auto mb-6 leading-relaxed">
            Use a Personal Access Token to create pull requests in organization repositories
            without waiting for OAuth approval.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=Claude%20Desk%20Integration"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-2 px-6 py-3 rounded-xl',
                'bg-emerald-500/20 hover:bg-emerald-500/30',
                'text-emerald-400 font-medium text-sm',
                'ring-1 ring-emerald-500/30',
                'transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                'active:scale-[0.98]'
              )}
            >
              <ExternalLink className="h-4 w-4" />
              Create Token on GitHub
            </a>

            <button
              onClick={() => setViewState('input')}
              className="text-sm text-white/60 hover:text-white/90 transition-colors underline underline-offset-4"
            >
              I already have a token
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Input state (entering new token)
  if (viewState === 'input') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-3">
            GitHub Personal Access Token
          </label>

          <TokenInputField
            value={tokenInput}
            onChange={setTokenInput}
            validationState={getValidationState()}
            showCopyButton={false}
            placeholder="ghp_••••••••••••••••••••"
          />

          <p className="mt-2 text-xs text-white/50">
            Token must start with <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono">ghp_</code> or{' '}
            <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono">github_pat_</code>
          </p>
        </div>

        {/* Validation result */}
        {validationResult && (
          <div
            className={cn(
              'rounded-xl p-4 ring-1',
              'animate-in slide-in-from-top-2 fade-in duration-200',
              validationResult.success
                ? 'bg-emerald-500/10 ring-emerald-500/20'
                : 'bg-red-500/10 ring-red-500/20'
            )}
          >
            <div className="flex items-start gap-3">
              {validationResult.success ? (
                <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              )}

              <div className="flex-1 min-w-0">
                {validationResult.success ? (
                  <>
                    <p className="text-sm font-medium text-emerald-400 mb-1">
                      Token validated successfully
                    </p>
                    <p className="text-sm text-white/70">
                      Connected as <span className="font-medium">@{validationResult.username}</span>
                    </p>
                    {validationResult.scopes && (
                      <p className="text-xs text-white/50 mt-1">
                        Scopes: {validationResult.scopes.join(', ')}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-red-400 mb-1">
                      Validation failed
                    </p>
                    <p className="text-sm text-white/70">
                      {validationResult.error}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleTestConnection}
            disabled={isValidating || getValidationState() !== 'valid'}
            className={cn(
              'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
              'bg-white/10 hover:bg-white/15',
              'text-white font-medium text-sm',
              'ring-1 ring-white/10',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'active:scale-[0.98]'
            )}
          >
            {isValidating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Test Connection
              </>
            )}
          </button>

          {validationResult?.success && (
            <button
              onClick={handleSaveToken}
              disabled={isSaving}
              className={cn(
                'flex items-center justify-center gap-2 px-6 py-3 rounded-xl',
                'bg-emerald-500/20 hover:bg-emerald-500/30',
                'text-emerald-400 font-medium text-sm',
                'ring-1 ring-emerald-500/30',
                'transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'active:scale-[0.98]'
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Token'
              )}
            </button>
          )}

          <button
            onClick={() => {
              setTokenInput('');
              setValidationResult(null);
              setViewState(tokenStatus?.configured ? 'configured' : 'empty');
            }}
            className="px-6 py-3 rounded-xl text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Configured state
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {renderExpirationWarning()}

      <div>
        <label className="block text-sm font-medium text-white/70 mb-3">
          Configured Token
        </label>

        <TokenInputField
          value="ghp_••••••••••••••••••••••••"
          onChange={() => {}}
          validationState="valid"
          showCopyButton={false}
          disabled
        />

        {tokenStatus && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between text-white/50">
              <span>Username:</span>
              <span className="font-medium text-white/80">@{tokenStatus.username}</span>
            </div>
            {tokenStatus.scopes && (
              <div className="flex items-center justify-between text-white/50">
                <span>Scopes:</span>
                <span className="font-mono text-xs text-white/70">
                  {tokenStatus.scopes.join(', ')}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-white/50">
              <span>Added:</span>
              <span className="text-white/70">
                {tokenStatus.createdAt ? new Date(tokenStatus.createdAt).toLocaleDateString() : 'Unknown'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleUpdateToken}
          className={cn(
            'px-6 py-3 rounded-xl text-sm font-medium',
            'bg-white/10 hover:bg-white/15 text-white',
            'ring-1 ring-white/10',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
            'active:scale-[0.98]'
          )}
        >
          Update Token
        </button>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className={cn(
              'flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium',
              'text-red-400 hover:bg-red-500/10',
              'ring-1 ring-transparent hover:ring-red-500/20',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50',
              'active:scale-[0.98]'
            )}
          >
            <Trash2 className="h-4 w-4" />
            Delete Token
          </button>
        ) : (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            <span className="text-sm text-white/60 mr-2">Are you sure?</span>
            <button
              onClick={handleDeleteToken}
              disabled={isDeleting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-red-500/20 hover:bg-red-500/30 text-red-400',
                'transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isDeleting ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white/90 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
