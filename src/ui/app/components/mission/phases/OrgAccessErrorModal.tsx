/**
 * OrgAccessErrorModal - Organization Access Error Recovery
 *
 * Transforms a blocking OAuth error into clear action paths.
 * Presents Personal Access Token (recommended) vs OAuth approval options
 * with visual hierarchy and confidence-building interactions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Zap,
  Shield,
  Check,
  ExternalLink,
  Copy,
  X
} from 'lucide-react';
import { cn } from '../../../lib/cn';

interface OrgAccessErrorModalProps {
  orgName: string;
  repoName: string;
  onSetupPAT: () => void;
  onDismiss: () => void;
  organizationUrl: string;
}

export function OrgAccessErrorModal({
  orgName,
  repoName,
  onSetupPAT,
  onDismiss,
  organizationUrl,
}: OrgAccessErrorModalProps) {
  const [showOAuthInstructions, setShowOAuthInstructions] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onDismiss]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Copy organization URL to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(organizationUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  }, [organizationUrl]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full max-w-[560px]',
          'bg-[#0A0A0A]/95 backdrop-blur-xl',
          'rounded-2xl shadow-2xl',
          'ring-1 ring-white/10',
          'animate-in zoom-in-95 slide-in-from-bottom-4 duration-300'
        )}
      >
        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className={cn(
            'absolute top-4 right-4 p-2 rounded-lg',
            'text-white/40 hover:text-white/70 hover:bg-white/10',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
          )}
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 ring-1 ring-amber-500/40 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-amber-400" />
              </div>
            </div>
            <div className="flex-1 pt-1">
              <h2
                id="modal-title"
                className="text-xl font-semibold text-white mb-2 leading-tight"
              >
                Organization Access Required
              </h2>
              <p className="text-sm text-white/70 leading-relaxed">
                Claude Desk doesn't have access to <span className="font-medium text-white">{orgName}</span> repositories.
                To create a PR in <span className="font-mono text-white/90">{repoName}</span>, choose an option below:
              </p>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {/* PAT Option (Primary/Recommended) */}
            <div
              className={cn(
                'relative rounded-xl p-5',
                'bg-emerald-500/5 ring-1 ring-emerald-500/20',
                'border-l-4 border-emerald-500',
                'animate-in slide-in-from-left-4 fade-in duration-300',
                'style-[animation-delay:100ms]'
              )}
            >
              {/* Recommended badge */}
              <div className="absolute top-3 right-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <Zap className="h-3 w-3 text-emerald-400" />
                  <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400">
                    Fastest
                  </span>
                </span>
              </div>

              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 ring-1 ring-emerald-500/30 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white mb-1">
                    Use Personal Access Token
                  </h3>
                  <p className="text-sm text-white/60 mb-3">
                    Set up in 2 minutes. Works immediately without waiting for admin approval.
                  </p>

                  <ul className="space-y-1.5 mb-4">
                    <li className="flex items-center gap-2 text-sm text-white/70">
                      <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <span>Works immediately</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-white/70">
                      <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <span>No organization approval needed</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-white/70">
                      <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <span>Uses your existing GitHub permissions</span>
                    </li>
                  </ul>

                  <button
                    onClick={onSetupPAT}
                    className={cn(
                      'w-full px-4 py-2.5 rounded-xl',
                      'bg-emerald-500/20 hover:bg-emerald-500/30',
                      'text-emerald-400 font-medium text-sm',
                      'ring-1 ring-emerald-500/30',
                      'transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                      'active:scale-[0.98]'
                    )}
                  >
                    Set Up Token
                  </button>
                </div>
              </div>
            </div>

            {/* OAuth Option (Secondary) */}
            <div
              className={cn(
                'rounded-xl p-5',
                'bg-blue-500/5 ring-1 ring-blue-500/20',
                'border-l-4 border-blue-500',
                'animate-in slide-in-from-left-4 fade-in duration-300',
                'style-[animation-delay:200ms]'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-blue-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white mb-1">
                    Request Organization Approval
                  </h3>
                  <p className="text-sm text-white/60 mb-3">
                    Ask your org admin to approve Claude Desk OAuth app access.
                  </p>

                  <ul className="space-y-1.5 mb-4">
                    <li className="flex items-center gap-2 text-sm text-white/70">
                      <Check className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <span>No token management</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-white/60">
                      <div className="h-1 w-1 rounded-full bg-white/40 flex-shrink-0 ml-1.5" />
                      <span>Requires admin approval</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-white/60">
                      <div className="h-1 w-1 rounded-full bg-white/40 flex-shrink-0 ml-1.5" />
                      <span>May take several days</span>
                    </li>
                  </ul>

                  {!showOAuthInstructions ? (
                    <button
                      onClick={() => setShowOAuthInstructions(true)}
                      className={cn(
                        'w-full px-4 py-2.5 rounded-xl',
                        'bg-blue-500/10 hover:bg-blue-500/20',
                        'text-blue-400 font-medium text-sm',
                        'ring-1 ring-blue-500/20',
                        'transition-all duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
                        'active:scale-[0.98]'
                      )}
                    >
                      View Instructions
                    </button>
                  ) : (
                    <div
                      className={cn(
                        'rounded-lg bg-blue-500/5 p-4 ring-1 ring-blue-500/10',
                        'animate-in slide-in-from-top-2 fade-in duration-300'
                      )}
                    >
                      <p className="text-xs font-medium text-blue-400 mb-3 uppercase tracking-wide">
                        How to grant access:
                      </p>
                      <ol className="space-y-2.5 text-sm text-white/70 mb-4">
                        <li className="flex gap-3">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                            1
                          </span>
                          <span>Click "Open GitHub Settings" below</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                            2
                          </span>
                          <span>Find "<span className="font-medium text-white">{orgName}</span>" in Organization access section</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                            3
                          </span>
                          <span>Click "Grant" next to {orgName}</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                            4
                          </span>
                          <span>Authorize the application</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30 flex items-center justify-center text-xs font-medium text-blue-400">
                            5
                          </span>
                          <span>Return here and retry creating the PR</span>
                        </li>
                      </ol>

                      <div className="flex gap-2">
                        <a
                          href={organizationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                            'bg-blue-500/20 hover:bg-blue-500/30',
                            'text-blue-400 font-medium text-sm',
                            'ring-1 ring-blue-500/30',
                            'transition-all duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50'
                          )}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open GitHub Settings
                        </a>

                        <button
                          onClick={handleCopyLink}
                          className={cn(
                            'px-3 py-2.5 rounded-lg',
                            'transition-all duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
                            copiedLink
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400'
                          )}
                          aria-label={copiedLink ? 'Link copied' : 'Copy link'}
                        >
                          {copiedLink ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Dismiss text */}
          <div className="text-center">
            <button
              onClick={onDismiss}
              className="text-sm text-white/40 hover:text-white/60 transition-colors underline underline-offset-4"
            >
              I'll do this later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
