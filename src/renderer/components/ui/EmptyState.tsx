import { useState, useEffect } from 'react';
import { Terminal, Map, Link } from 'lucide-react';
import { WelcomeHero } from './WelcomeHero';
import { QuickActionCard } from './QuickActionCard';
import { FeatureShowcase } from './FeatureShowcase';
import { RecentSessionsList } from './RecentSessionsList';

interface EmptyStateProps {
  onCreateSession: () => void;
  onQuickStart?: {
    startCoding: () => void;
    analyzeCodebase: () => void;
    joinSession: () => void;
  };
}

export function EmptyState({ onCreateSession, onQuickStart }: EmptyStateProps) {
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [appVersion, setAppVersion] = useState('5.0.0');

  useEffect(() => {
    // Load app version
    window.electronAPI.getVersionInfo?.().then((versionInfo) => {
      if (versionInfo?.appVersion) setAppVersion(versionInfo.appVersion);
    }).catch(() => {
      // Fallback to default version if API not available
    });

    // Load recent sessions from history
    window.electronAPI.listHistory?.().then((sessions) => {
      if (sessions && sessions.length > 0) {
        // Convert history entries to recent session format
        const recent = sessions
          .sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))
          .slice(0, 3)
          .map((session) => ({
            id: session.id,
            name: session.name || 'Unnamed Session',
            timestamp: session.lastUpdatedAt || session.createdAt,
            directory: session.workingDirectory,
          }));
        setRecentSessions(recent);
      }
    }).catch(() => {
      // No history available yet
    });
  }, []);

  const handleRestoreSession = (sessionId: string) => {
    // In future, implement session restoration from history
    console.log('Restore session:', sessionId);
    onCreateSession();
  };

  return (
    <div className="empty-state">
      <WelcomeHero version={appVersion} />

      <div className="quick-actions">
        <QuickActionCard
          icon={<Terminal size={20} />}
          title="Start Coding"
          description="Create a new coding session"
          onClick={onQuickStart?.startCoding || onCreateSession}
        />

        <QuickActionCard
          icon={<Map size={20} />}
          title="Analyze Codebase"
          description="Scan and generate repository atlas"
          onClick={onQuickStart?.analyzeCodebase || onCreateSession}
        />

        <QuickActionCard
          icon={<Link size={20} />}
          title="Join Session"
          description="Join a teammate's shared session"
          onClick={onQuickStart?.joinSession || onCreateSession}
        />
      </div>

      <FeatureShowcase />

      {recentSessions.length > 0 && (
        <RecentSessionsList
          sessions={recentSessions}
          onSelectSession={handleRestoreSession}
        />
      )}

      <style>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          min-height: 100%;
          padding: var(--space-16, 64px) var(--space-12, 48px) 128px;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          text-align: center;
          background: radial-gradient(ellipse 600px 400px at center, #00C9A708 0%, transparent 70%),
                      var(--surface-base, #0D0E14);
          animation: empty-fade-in var(--duration-slow, 300ms) var(--ease-out, ease) both;
        }

        @keyframes empty-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .quick-actions {
          display: flex;
          gap: var(--space-4, 16px);
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: var(--space-8, 32px);
          max-width: 920px;
        }

        @media (max-width: 900px) {
          .quick-actions {
            flex-direction: column;
            align-items: center;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .empty-state {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
