import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { api } from './lib/api';
import { requestCache, CACHE_KEYS } from './lib/request-cache';
import Auth from './screens/AuthV2';
import Home from './screens/Home';
import Terminal from './screens/TerminalV2';
import { MissionControl } from './components/mission';
import RunPage from './screens/RunPage';
import ReviewChanges from './screens/ReviewChangesV2';
import PreShipReview from './screens/PreShipReviewV2';
import Settings from './screens/Settings';
import Workspaces from './screens/settings/Workspaces';
import Integrations from './screens/settings/Integrations';
import ApiConfig from './screens/settings/ApiConfig';
import SetupWizard from './components/SetupWizard';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { InstallBanner, OfflineBanner, UpdateBanner } from './components/pwa';

interface SetupStatus {
  completed: boolean;
}

// Pages that should NOT show the bottom navigation
const HIDE_NAV_PATHS = ['/', '/terminal', '/mission', '/run', '/review-changes', '/pre-ship'];

function MobileLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const showNav = !HIDE_NAV_PATHS.some((p) =>
    p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
  );

  return (
    <>
      <div className={showNav ? 'pb-mobile-nav' : ''}>{children}</div>
      {showNav && <MobileBottomNav />}
    </>
  );
}

function AppRoutes() {
  // Initialize app lifecycle management
  useAppLifecycle();

  return (
    <MobileLayout>
      <Routes>
        <Route path="/" element={<MissionControl />} />
        <Route path="/home" element={<Home />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/mission" element={<MissionControl />} />
        <Route path="/run" element={<RunPage />} />
        <Route path="/review-changes" element={<ReviewChanges />} />
        <Route path="/pre-ship" element={<PreShipReview />} />
        <Route path="/settings" element={<Settings />}>
          <Route index element={<Navigate to="/settings/workspaces" replace />} />
          <Route path="workspaces" element={<Workspaces />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="api-config" element={<ApiConfig />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MobileLayout>
  );
}

function AuthenticatedApp() {
  const [showWizard, setShowWizard] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const hasCheckedSetup = useRef(false);

  useEffect(() => {
    // Prevent duplicate calls from React StrictMode double-mounting
    if (hasCheckedSetup.current) return;
    hasCheckedSetup.current = true;
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      // Use cached health status to avoid duplicate calls
      const status = await requestCache.fetch(
        CACHE_KEYS.HEALTH_STATUS,
        () => api<{ setup: SetupStatus }>('GET', '/health/status'),
        { staleTime: 60000 } // 60 second cache
      );
      setShowWizard(!status.setup.completed);
    } catch (error) {
      console.error('Failed to check setup status:', error);
      setShowWizard(false);
    }
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    navigate('/');
  };

  // Show nothing while checking setup status
  if (showWizard === null) {
    return (
      <div className="min-h-screen w-full bg-[#05070c] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    );
  }

  // Show wizard if setup not completed
  if (showWizard) {
    return <SetupWizard onComplete={handleWizardComplete} />;
  }

  return <AppRoutes />;
}

export default function App() {
  const { token, setToken, loadData } = useAppStore();
  const [checkingSession, setCheckingSession] = useState(true);

  // Check for cookie-based auth and auto-auth for local access on startup
  useEffect(() => {
    const checkAuth = async () => {
      // Skip if already have a token
      if (token) {
        setCheckingSession(false);
        return;
      }

      try {
        // Check remote status first (no auth required)
        const remoteRes = await fetch('/api/system/remote-status');
        const remoteData = await remoteRes.json();

        if (remoteData.success && !remoteData.data.isRemote) {
          // Local access - auto-authenticate with default local token
          setToken('claudedesk-local');
          await loadData();
          setCheckingSession(false);
          return;
        }
      } catch {
        // Remote status check failed - fall through to cookie check
      }

      try {
        // Check if we have a valid session cookie (for iOS PWA / remote)
        const response = await fetch('/api/auth/session');
        const data = await response.json();

        if (data.success && data.data.authenticated && data.data.token) {
          // Restore authentication from cookie
          setToken(data.data.token);
          await loadData();
        }
      } catch (err) {
        console.error('Failed to check session:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    checkAuth();
  }, [token, setToken, loadData]);

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen w-full bg-[#05070c] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    );
  }

  return (
    <>
      {/* PWA Banners - only shown when authenticated */}
      {token && (
        <>
          <OfflineBanner />
          <InstallBanner />
          <UpdateBanner />
        </>
      )}

      {/* Main app content */}
      {!token ? <Auth /> : <AuthenticatedApp />}
    </>
  );
}
