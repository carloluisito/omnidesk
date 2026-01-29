/**
 * Update Store - Manages app update state
 */

import { create } from 'zustand';
import { api } from '../lib/api';

export type InstallMethod = 'global-npm' | 'npx' | 'docker' | 'source' | 'unknown';
export type UpdateStage = 'stopping-sessions' | 'installing' | 'restarting';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  checkedAt: string | null;
  installMethod: InstallMethod;
  canAutoUpdate: boolean;
  error?: string;
}

interface UpdateState {
  // Version info
  info: UpdateInfo | null;
  isChecking: boolean;
  checkError: string | null;

  // Update progress
  isUpdating: boolean;
  updateStage: UpdateStage | null;
  updateDetail: string | null;
  updateError: string | null;
  updateSuccess: boolean;

  // Banner
  bannerDismissedVersion: string | null;

  // Actions
  checkForUpdate: () => Promise<void>;
  fetchUpdateInfo: () => Promise<void>;
  triggerUpdate: () => Promise<{ status: string; instructions?: string }>;
  dismissBanner: () => void;
  setUpdateProgress: (stage: UpdateStage, detail?: string) => void;
  setUpdateComplete: (success: boolean, error?: string) => void;
  setUpdateAvailable: (currentVersion: string, latestVersion: string) => void;
  reset: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  info: null,
  isChecking: false,
  checkError: null,

  isUpdating: false,
  updateStage: null,
  updateDetail: null,
  updateError: null,
  updateSuccess: false,

  bannerDismissedVersion: null,

  checkForUpdate: async () => {
    set({ isChecking: true, checkError: null });
    try {
      const data = await api<UpdateInfo>('GET', '/system/update/check');
      set({ info: data, isChecking: false });
    } catch (err) {
      set({ checkError: err instanceof Error ? err.message : 'Check failed', isChecking: false });
    }
  },

  fetchUpdateInfo: async () => {
    try {
      const data = await api<UpdateInfo>('GET', '/system/update/info');
      set({ info: data });
    } catch {
      // Silent fail for background info fetch
    }
  },

  triggerUpdate: async () => {
    set({ isUpdating: true, updateError: null, updateSuccess: false, updateStage: null });
    try {
      const data = await api<{ status: string; message?: string; instructions?: string; installMethod?: string }>('POST', '/system/update');

      if (data.status === 'manual') {
        set({ isUpdating: false });
        return { status: 'manual', instructions: data.instructions };
      }

      // For 'updating' status, WebSocket events will drive the progress
      return { status: data.status };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      set({ updateError: message, isUpdating: false });
      return { status: 'error', instructions: message };
    }
  },

  dismissBanner: () => {
    const info = get().info;
    if (info?.latestVersion) {
      set({ bannerDismissedVersion: info.latestVersion });
    }
  },

  setUpdateProgress: (stage, detail) => {
    set({ updateStage: stage, updateDetail: detail || null, isUpdating: true });
  },

  setUpdateComplete: (success, error) => {
    set({
      updateSuccess: success,
      updateError: error || null,
      updateStage: null,
      isUpdating: false,
    });

    if (success) {
      // Poll health endpoint and reload on success
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          clearInterval(poll);
          return;
        }
        try {
          const response = await fetch('/api/health');
          if (response.ok) {
            clearInterval(poll);
            setTimeout(() => window.location.reload(), 1500);
          }
        } catch {
          // Server not ready yet
        }
      }, 2000);
    }
  },

  setUpdateAvailable: (currentVersion, latestVersion) => {
    set((state) => ({
      info: {
        updateAvailable: true,
        currentVersion,
        latestVersion,
        checkedAt: new Date().toISOString(),
        installMethod: state.info?.installMethod || 'unknown',
        canAutoUpdate: state.info?.canAutoUpdate || false,
      },
    }));
  },

  reset: () => {
    set({
      isUpdating: false,
      updateStage: null,
      updateDetail: null,
      updateError: null,
      updateSuccess: false,
    });
  },
}));
