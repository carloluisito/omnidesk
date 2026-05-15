/**
 * TunnelPanel — Redesigned to match Obsidian spec §6.14.
 *
 * PanelShell + URL list at top + collapsible request log per tunnel via PanelSection.
 */

import { useState, useCallback } from 'react';
import { Copy, Check, Plus, Unplug, Radio, FileText, Key } from 'lucide-react';
import { useTunnel } from '../hooks/useTunnel';
import { TunnelCreateDialog } from './TunnelCreateDialog';
import { TunnelRequestLogs } from './TunnelRequestLogs';
import { SidePanel } from './SidePanel';
import { PanelShell, PanelSection, PanelEmpty } from './ui';
import type { TunnelInfo } from '../../shared/types/tunnel-types';

export interface TunnelPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function v2TunnelBtn(isDanger: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 3,
    padding: '3px 8px',
    background: 'none',
    border: `1px solid ${isDanger ? 'var(--v2-error)' : 'var(--v2-border-default)'}`,
    borderRadius: 4,
    color: isDanger ? 'var(--v2-error)' : 'var(--v2-text-secondary)',
    fontSize: 'var(--text-xs, 11px)', cursor: 'pointer',
  };
}

// ─── Main component ────────────────────────────────────────────────────────

export function TunnelPanel({ isOpen, onClose }: TunnelPanelProps) {
  const tunnel = useTunnel();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [logsTarget, setLogsTarget] = useState<TunnelInfo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyUrl = useCallback(
    async (tunnelId: string) => {
      const t = tunnel.tunnels.find((t) => t.id === tunnelId);
      if (!t) return;
      try {
        await navigator.clipboard.writeText(t.url);
        setCopiedId(tunnelId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {}
    },
    [tunnel.tunnels]
  );

  if (!isOpen) return null;

  const activeTunnelList = tunnel.tunnels.filter((t) => t.status === 'active' || t.status === 'creating');
  const inactiveTunnels = tunnel.tunnels.filter((t) => t.status !== 'active' && t.status !== 'creating');
  const totalCount = tunnel.tunnels.length;

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} title="Tunnels">
        <div style={{ height: '100%' }}>
          <PanelShell
            icon={<Radio size={13} />}
            title="Tunnels"
            count={totalCount > 0 ? `${totalCount}` : undefined}
            actions={
              <button
                onClick={() => setShowCreateDialog(true)}
                title="New tunnel"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, background: 'none', border: 'none',
                  color: 'var(--v2-text-tertiary)', cursor: 'pointer', borderRadius: 4,
                }}
              >
                <Plus size={12} />
              </button>
            }
            footer={
              <button
                onClick={() => setShowCreateDialog(true)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '7px 0', background: 'var(--v2-accent)', color: '#0A0B11',
                  border: 'none', borderRadius: 'var(--radius-md, 6px)',
                  fontSize: 'var(--text-sm, 12px)', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={12} /> New Tunnel
              </button>
            }
          >
            {!tunnel.isConfigured && tunnel.tunnels.length === 0 ? (
              <PanelEmpty
                icon={<Key size={26} />}
                title="Connect to LaunchTunnel"
                body="Enter your LaunchTunnel API key to create tunnels that expose local ports to the internet."
              />
            ) : tunnel.tunnels.length === 0 ? (
              <PanelEmpty
                icon={<Radio size={26} />}
                title="No active tunnels"
                body="Create a tunnel to expose a local port. Tunnels are secured and scoped to your account."
                cta={{ label: 'New Tunnel', onClick: () => setShowCreateDialog(true) }}
              />
            ) : (
              <div style={{ padding: '8px 6px 0' }}>
                {activeTunnelList.length > 0 && (
                  <PanelSection title="Active" count={activeTunnelList.length}>
                    {activeTunnelList.map((t) => (
                      <div key={t.id} className="anim-lift" style={{
                        padding: '8px 10px', borderRadius: 'var(--radius-md, 6px)',
                        background: 'var(--v2-surface-mid)', marginBottom: 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: t.status === 'active' ? 'var(--v2-success)' : 'var(--v2-warning)',
                            animation: t.status === 'active' ? 'tunnel-pulse 2s ease-in-out infinite' : 'none',
                          }} />
                          <span style={{ flex: 1, fontSize: 'var(--text-sm, 12px)', fontWeight: 600, color: 'var(--v2-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.name || `Port ${t.port}`}
                          </span>
                          <button onClick={() => handleCopyUrl(t.id)} style={{ background: 'none', border: 'none', color: copiedId === t.id ? 'var(--v2-success)' : 'var(--v2-text-tertiary)', cursor: 'pointer', padding: 0 }}>
                            {copiedId === t.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.url}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          {t.hasInspect && (
                            <button onClick={() => setLogsTarget(t)} style={v2TunnelBtn(false)}>
                              <FileText size={10} /> Logs
                            </button>
                          )}
                          <button onClick={() => tunnel.stopTunnel(t.id)} style={v2TunnelBtn(true)}>
                            <Unplug size={10} /> Disconnect
                          </button>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'var(--v2-text-quaternary)', marginTop: 4 }}>
                          {t.protocol.toUpperCase()} · Port {t.port} · {formatRelativeTime(t.createdAt)}
                        </div>
                      </div>
                    ))}
                  </PanelSection>
                )}
                {inactiveTunnels.length > 0 && (
                  <PanelSection title="Stopped" count={inactiveTunnels.length} defaultOpen={activeTunnelList.length === 0}>
                    {inactiveTunnels.map((t) => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 'var(--radius-md, 6px)',
                        background: 'var(--v2-surface-mid)', opacity: 0.6, marginBottom: 1,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.status === 'error' ? 'var(--v2-error)' : 'var(--v2-text-quaternary)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name || `Port ${t.port}`}
                        </span>
                        <button onClick={() => tunnel.deleteTunnel(t.id)} style={{ background: 'none', border: 'none', color: 'var(--v2-text-quaternary)', cursor: 'pointer', padding: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </PanelSection>
                )}
              </div>
            )}
          </PanelShell>
        </div>
      </SidePanel>

      {showCreateDialog && (
        <TunnelCreateDialog
          isOpen={showCreateDialog}
          onToggle={() => setShowCreateDialog(false)}
          onSubmit={async (req) => { await tunnel.createTunnel(req); setShowCreateDialog(false); }}
          isLoading={tunnel.isLoading}
          settings={tunnel.settings}
        />
      )}
      {logsTarget && (
        <TunnelRequestLogs tunnel={logsTarget} logs={tunnel.requestLogs} onBack={() => setLogsTarget(null)} onRefresh={tunnel.loadRequestLogs} />
      )}
      <style>{`@keyframes tunnel-pulse { 0%,100%{opacity:1;} 50%{opacity:0.8;} } @keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }`}</style>
    </>
  );
}
