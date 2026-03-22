/**
 * TunnelCreateDialog — Collapsible create-tunnel form section.
 *
 * Spec: port input, name input, protocol toggle (HTTP|TCP),
 * expires dropdown, advanced collapsible (subdomain+PRO, auth, inspect),
 * full-width primary button, spinner loading state, mini CLI output area.
 */

import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import type { TunnelCreateRequest, TunnelSettings } from '../../shared/types/tunnel-types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TunnelCreateDialogProps {
  isOpen: boolean;
  onToggle: () => void;
  onSubmit: (request: TunnelCreateRequest) => Promise<void>;
  isLoading: boolean;
  cliOutput?: string;
  settings?: TunnelSettings | null;
}

interface FormState {
  port: string;
  name: string;
  protocol: 'http' | 'tcp';
  expires: string;
  subdomain: string;
  useAuth: boolean;
  authPassword: string;
  inspect: boolean;
}

interface FormErrors {
  port?: string;
  name?: string;
  subdomain?: string;
  authPassword?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const EXPIRE_OPTIONS = [
  { value: '', label: 'None' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours' },
  { value: '8h', label: '8 hours' },
  { value: '24h', label: '24 hours' },
];

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  const portNum = parseInt(form.port, 10);
  if (!form.port.trim()) {
    errors.port = 'Port is required';
  } else if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    errors.port = 'Port must be between 1 and 65535';
  }

  if (form.useAuth && !form.authPassword.trim()) {
    errors.authPassword = 'Password is required when auth is enabled';
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function TunnelCreateDialog({
  isOpen,
  onToggle,
  onSubmit,
  isLoading,
  cliOutput = '',
  settings,
}: TunnelCreateDialogProps) {
  const [form, setForm] = useState<FormState>({
    port: '',
    name: '',
    protocol: settings?.defaultProtocol ?? 'http',
    expires: settings?.defaultExpires ?? '',
    subdomain: '',
    useAuth: false,
    authPassword: '',
    inspect: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const cliOutputRef = useRef<HTMLDivElement>(null);

  const update = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error on change
    if (key in errors) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as keyof FormErrors];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const request: TunnelCreateRequest = {
      port: parseInt(form.port, 10),
      protocol: form.protocol,
    };

    if (form.name.trim()) request.name = form.name.trim();
    if (form.expires) request.expires = form.expires;
    if (form.subdomain.trim()) request.subdomain = form.subdomain.trim();
    if (form.useAuth && form.authPassword.trim()) {
      request.auth = form.authPassword.trim();
    }
    if (form.inspect) request.inspect = true;

    await onSubmit(request);

    // Reset form on success
    setForm({
      port: '',
      name: '',
      protocol: settings?.defaultProtocol ?? 'http',
      expires: settings?.defaultExpires ?? '',
      subdomain: '',
      useAuth: false,
      authPassword: '',
      inspect: false,
    });
    setErrors({});
    setShowAdvanced(false);
  };

  return (
    <div className="tcd-wrapper">
      {/* Section Header — toggle */}
      <button className="tcd-section-header" onClick={onToggle} aria-expanded={isOpen}>
        <div className="tcd-section-title">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>CREATE TUNNEL</span>
        </div>
        {!isOpen && (
          <div className="tcd-section-hint">
            <Plus size={12} />
          </div>
        )}
      </button>

      {/* Collapsible Form Body */}
      {isOpen && (
        <div className="tcd-body">
          {/* Port */}
          <div className="tcd-field">
            <label className="tcd-label" htmlFor="tcd-port">
              PORT <span className="tcd-required">*</span>
            </label>
            <input
              id="tcd-port"
              className={`tcd-input${errors.port ? ' tcd-input-error' : ''}`}
              type="number"
              min={1}
              max={65535}
              placeholder="3000"
              value={form.port}
              onChange={(e) => update('port', e.target.value)}
              disabled={isLoading}
            />
            {errors.port && <span className="tcd-error-msg">{errors.port}</span>}
          </div>

          {/* Name */}
          <div className="tcd-field">
            <label className="tcd-label" htmlFor="tcd-name">NAME</label>
            <input
              id="tcd-name"
              className="tcd-input"
              type="text"
              placeholder="my-app"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Protocol Toggle */}
          <div className="tcd-field">
            <label className="tcd-label">PROTOCOL</label>
            <div className="tcd-protocol-toggle">
              <button
                className={`tcd-protocol-btn${form.protocol === 'http' ? ' active' : ''}`}
                onClick={() => update('protocol', 'http')}
                disabled={isLoading}
              >
                HTTP
              </button>
              <button
                className={`tcd-protocol-btn${form.protocol === 'tcp' ? ' active' : ''}`}
                onClick={() => update('protocol', 'tcp')}
                disabled={isLoading}
              >
                TCP
              </button>
            </div>
          </div>

          {/* Expires */}
          <div className="tcd-field">
            <label className="tcd-label" htmlFor="tcd-expires">EXPIRES</label>
            <select
              id="tcd-expires"
              className="tcd-select"
              value={form.expires}
              onChange={(e) => update('expires', e.target.value)}
              disabled={isLoading}
            >
              {EXPIRE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Collapsible */}
          <div className="tcd-advanced-toggle">
            <button
              className="tcd-advanced-btn"
              onClick={() => setShowAdvanced((v) => !v)}
              disabled={isLoading}
            >
              {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>ADVANCED</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="tcd-advanced-body">
              {/* Subdomain — PRO */}
              <div className="tcd-field">
                <label className="tcd-label" htmlFor="tcd-subdomain">
                  SUBDOMAIN
                  <span className="tcd-pro-badge">PRO</span>
                </label>
                <input
                  id="tcd-subdomain"
                  className="tcd-input"
                  type="text"
                  placeholder="my-custom-subdomain"
                  value={form.subdomain}
                  onChange={(e) => update('subdomain', e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Auth Toggle */}
              <div className="tcd-field tcd-field-row">
                <label className="tcd-label tcd-label-row">
                  <input
                    type="checkbox"
                    className="tcd-checkbox"
                    checked={form.useAuth}
                    onChange={(e) => update('useAuth', e.target.checked)}
                    disabled={isLoading}
                  />
                  ENABLE AUTH
                </label>
              </div>

              {form.useAuth && (
                <div className="tcd-field">
                  <label className="tcd-label" htmlFor="tcd-auth-password">PASSWORD</label>
                  <input
                    id="tcd-auth-password"
                    className={`tcd-input${errors.authPassword ? ' tcd-input-error' : ''}`}
                    type="password"
                    placeholder="••••••••"
                    value={form.authPassword}
                    onChange={(e) => update('authPassword', e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.authPassword && (
                    <span className="tcd-error-msg">{errors.authPassword}</span>
                  )}
                </div>
              )}

              {/* Inspect Toggle */}
              <div className="tcd-field tcd-field-row">
                <label className="tcd-label tcd-label-row">
                  <input
                    type="checkbox"
                    className="tcd-checkbox"
                    checked={form.inspect}
                    onChange={(e) => update('inspect', e.target.checked)}
                    disabled={isLoading}
                  />
                  ENABLE REQUEST INSPECTOR
                </label>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            className={`tcd-submit-btn${isLoading ? ' loading' : ''}`}
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="tcd-spinner" />
                CREATING TUNNEL...
              </>
            ) : (
              'CREATE TUNNEL'
            )}
          </button>

          {/* CLI Output Area */}
          {cliOutput && (
            <div className="tcd-cli-output" ref={cliOutputRef}>
              <div className="tcd-cli-content">{cliOutput}</div>
            </div>
          )}
        </div>
      )}

      <style>{tunnelCreateDialogStyles}</style>
    </div>
  );
}

const tunnelCreateDialogStyles = `
  .tcd-wrapper {
    border: 1px solid var(--border-default);
    border-radius: 8px;
    overflow: hidden;
  }

  .tcd-section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--surface-raised);
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .tcd-section-header:hover {
    background: var(--surface-overlay);
  }

  .tcd-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .tcd-section-hint {
    color: var(--border-strong);
  }

  .tcd-body {
    padding: 14px;
    background: var(--surface-raised);
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px solid var(--border-default);
  }

  .tcd-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .tcd-field-row {
    flex-direction: row;
    align-items: center;
  }

  .tcd-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-tertiary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tcd-label-row {
    cursor: pointer;
    gap: 8px;
    font-size: 10px;
  }

  .tcd-required {
    color: var(--semantic-error);
  }

  .tcd-pro-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--semantic-warning) 15%, transparent);
    color: var(--semantic-warning);
    border: 1px solid color-mix(in srgb, var(--semantic-warning) 30%, transparent);
    letter-spacing: 0.05em;
  }

  .tcd-input {
    height: 34px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s ease;
    -moz-appearance: textfield;
  }

  .tcd-input::-webkit-inner-spin-button,
  .tcd-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }

  .tcd-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 20%, transparent);
  }

  .tcd-input::placeholder {
    color: var(--border-strong);
  }

  .tcd-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tcd-input-error {
    border-color: var(--semantic-error) !important;
  }

  .tcd-error-msg {
    font-size: 10px;
    color: var(--semantic-error);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .tcd-select {
    height: 34px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 12px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s ease;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23565f89' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
  }

  .tcd-select:focus {
    border-color: var(--accent-primary);
  }

  .tcd-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tcd-select option {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .tcd-protocol-toggle {
    display: flex;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    overflow: hidden;
    width: fit-content;
  }

  .tcd-protocol-btn {
    padding: 6px 20px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tcd-protocol-btn + .tcd-protocol-btn {
    border-left: 1px solid var(--border-default);
  }

  .tcd-protocol-btn.active {
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    color: var(--accent-primary);
  }

  .tcd-protocol-btn:hover:not(.active):not(:disabled) {
    background: var(--surface-overlay);
    color: var(--text-secondary);
  }

  .tcd-protocol-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tcd-advanced-toggle {
    display: flex;
  }

  .tcd-advanced-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--border-strong);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    padding: 0;
    transition: color 0.15s ease;
  }

  .tcd-advanced-btn:hover:not(:disabled) {
    color: var(--text-tertiary);
  }

  .tcd-advanced-btn:disabled {
    cursor: not-allowed;
  }

  .tcd-advanced-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(13, 14, 20, 0.5);
    border-radius: 6px;
    border: 1px solid var(--surface-float);
  }

  .tcd-checkbox {
    width: 13px;
    height: 13px;
    accent-color: var(--accent-primary);
    cursor: pointer;
  }

  .tcd-submit-btn {
    height: 40px;
    width: 100%;
    background: var(--accent-primary);
    color: var(--surface-overlay);
    border: none;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s ease;
    margin-top: 2px;
  }

  .tcd-submit-btn:hover:not(:disabled) {
    background: var(--accent-primary-dim);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-primary) 30%, transparent);
  }

  .tcd-submit-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .tcd-submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .tcd-submit-btn.loading {
    background: color-mix(in srgb, var(--accent-primary) 70%, transparent);
  }

  .tcd-spinner {
    animation: tcd-spin 0.8s linear infinite;
  }

  @keyframes tcd-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .tcd-cli-output {
    height: 80px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default) transparent;
  }

  .tcd-cli-content {
    padding: 8px 10px;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 10px;
    color: var(--semantic-success);
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.6;
  }
`;

export default TunnelCreateDialog;
