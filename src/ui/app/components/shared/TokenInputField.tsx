/**
 * TokenInputField - Secure input for GitHub Personal Access Tokens
 *
 * A refined, production-grade input component with masking, validation,
 * and clipboard functionality. Matches Claude Desk's dark glassmorphic aesthetic
 * with subtle sophistication and technical precision.
 */

import { useState, useRef, useCallback } from 'react';
import { Eye, EyeOff, Clipboard, Check } from 'lucide-react';
import { cn } from '../../lib/cn';

interface TokenInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  masked?: boolean;
  validationState?: 'valid' | 'invalid' | 'unknown';
  showCopyButton?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TokenInputField({
  value,
  onChange,
  masked: initialMasked = true,
  validationState = 'unknown',
  showCopyButton = true,
  placeholder = 'ghp_••••••••••••••••••••',
  disabled = false,
  className,
}: TokenInputFieldProps) {
  const [masked, setMasked] = useState(initialMasked);
  const [copied, setCopied] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout>();

  // Mask token for display (show last 4 chars)
  const getMaskedValue = useCallback((token: string): string => {
    if (!token || !masked) return token;

    const prefix = token.startsWith('github_pat_') ? 'github_pat_' :
                   token.startsWith('ghp_') ? 'ghp_' : '';

    if (!prefix) return token;

    const remainder = token.slice(prefix.length);
    if (remainder.length <= 4) return token;

    const masked = '•'.repeat(remainder.length - 4);
    const visible = remainder.slice(-4);
    return `${prefix}${masked}${visible}`;
  }, [masked]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!value || disabled) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      // Clear previous timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      // Reset after 2 seconds
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy token:', error);
    }
  }, [value, disabled]);

  // Toggle visibility
  const toggleMasked = useCallback(() => {
    setMasked((prev) => !prev);
  }, []);

  // Focus input when clicking container
  const handleContainerClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  // Get border color based on validation state
  const getBorderColor = () => {
    if (!focused && validationState === 'unknown') return 'ring-white/10';
    if (validationState === 'valid') return 'ring-emerald-500/50';
    if (validationState === 'invalid') return 'ring-red-500/50';
    return 'ring-white/20'; // focused unknown state
  };

  // Get glow effect based on state
  const getGlowEffect = () => {
    if (!focused) return '';
    if (validationState === 'valid') return 'shadow-[0_0_20px_rgba(16,185,129,0.15)]';
    if (validationState === 'invalid') return 'shadow-[0_0_20px_rgba(239,68,68,0.15)]';
    return 'shadow-[0_0_20px_rgba(255,255,255,0.05)]';
  };

  const displayValue = masked ? getMaskedValue(value) : value;

  return (
    <div className={cn('relative group', className)}>
      {/* Main input container */}
      <div
        onClick={handleContainerClick}
        className={cn(
          'relative flex items-center gap-2',
          'rounded-lg bg-white/5 backdrop-blur-sm',
          'ring-1 transition-all duration-200',
          getBorderColor(),
          getGlowEffect(),
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-text hover:bg-white/[0.07]'
        )}
      >
        {/* Hidden real input (for form handling) */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          className="sr-only"
          aria-label="GitHub Personal Access Token"
          aria-invalid={validationState === 'invalid'}
          aria-describedby={validationState === 'invalid' ? 'token-error' : undefined}
        />

        {/* Display input (shows masked/unmasked value) */}
        <div
          className={cn(
            'flex-1 px-3.5 py-2.5 sm:py-2',
            'font-mono text-sm sm:text-[13px] leading-relaxed tracking-wide',
            'text-white/90 select-all',
            'transition-colors duration-150',
            !value && 'text-white/30'
          )}
          onClick={handleContainerClick}
        >
          {displayValue || placeholder}
        </div>

        {/* Action buttons container */}
        <div className="flex items-center gap-1 pr-2">
          {/* Show/Hide toggle */}
          <button
            type="button"
            onClick={toggleMasked}
            disabled={disabled || !value}
            className={cn(
              'p-1.5 rounded-md',
              'text-white/40 hover:text-white/70 hover:bg-white/10',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'active:scale-95'
            )}
            aria-label={masked ? 'Show token' : 'Hide token'}
            aria-pressed={!masked}
          >
            {masked ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>

          {/* Copy button */}
          {showCopyButton && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled || !value}
              className={cn(
                'relative p-1.5 rounded-md',
                'transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                'active:scale-95',
                copied
                  ? 'text-emerald-400 bg-emerald-500/20'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/10'
              )}
              aria-label={copied ? 'Copied!' : 'Copy token'}
            >
              {copied ? (
                <Check className="h-4 w-4 animate-in zoom-in-50 duration-200" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Validation indicator - subtle line below input */}
      {validationState !== 'unknown' && (
        <div
          className={cn(
            'absolute -bottom-1 left-0 right-0 h-0.5 rounded-full',
            'transition-all duration-300',
            validationState === 'valid' && 'bg-gradient-to-r from-emerald-500/0 via-emerald-500/60 to-emerald-500/0',
            validationState === 'invalid' && 'bg-gradient-to-r from-red-500/0 via-red-500/60 to-red-500/0'
          )}
        />
      )}

      {/* Copy success tooltip */}
      {copied && (
        <div
          className={cn(
            'absolute -top-10 right-0',
            'px-3 py-1.5 rounded-lg',
            'bg-emerald-500/20 backdrop-blur-sm',
            'ring-1 ring-emerald-500/40',
            'text-xs font-medium text-emerald-400',
            'pointer-events-none',
            'animate-in fade-in slide-in-from-bottom-2 duration-200'
          )}
        >
          Copied!
        </div>
      )}
    </div>
  );
}
