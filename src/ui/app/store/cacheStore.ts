/**
 * Cache Store - Manages cache info and clearing operations
 */

import { create } from 'zustand';
import { api } from '../lib/api';

export interface CacheCategory {
  id: string;
  name: string;
  count: number;
  sizeBytes: number;
  activeCount?: number;
  details: string;
}

interface CacheState {
  categories: CacheCategory[];
  isLoading: boolean;
  loadError: string | null;
  clearingCategoryId: string | null;
  isClearingAll: boolean;

  loadCacheInfo: () => Promise<void>;
  clearCategory: (categoryId: string) => Promise<{ success: boolean; message: string }>;
  clearAll: () => Promise<{ success: boolean; message: string }>;
  clearClientCaches: () => Promise<void>;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const useCacheStore = create<CacheState>((set, get) => ({
  categories: [],
  isLoading: false,
  loadError: null,
  clearingCategoryId: null,
  isClearingAll: false,

  loadCacheInfo: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const data = await api<{
        sessions: { count: number; activeCount: number; sizeBytes: number };
        artifacts: { count: number; sizeBytes: number };
        worktrees: { orphanedCount: number; repos: { repoId: string; orphanedWorktrees: number }[] };
        usage: { count: number; sizeBytes: number };
      }>('GET', '/system/cache/info');

      const categories: CacheCategory[] = [
        {
          id: 'sessions',
          name: 'Terminal Sessions',
          count: data.sessions.count,
          sizeBytes: data.sessions.sizeBytes,
          activeCount: data.sessions.activeCount,
          details: data.sessions.activeCount > 0
            ? `${data.sessions.activeCount} active, ${data.sessions.count - data.sessions.activeCount} idle`
            : `${data.sessions.count} sessions`,
        },
        {
          id: 'artifacts',
          name: 'Artifacts & Temp Files',
          count: data.artifacts.count,
          sizeBytes: data.artifacts.sizeBytes,
          details: `${data.artifacts.count} files (${formatBytes(data.artifacts.sizeBytes)})`,
        },
        {
          id: 'worktrees',
          name: 'Git Worktrees',
          count: data.worktrees.orphanedCount,
          sizeBytes: 0,
          details: data.worktrees.orphanedCount > 0
            ? `${data.worktrees.orphanedCount} orphaned across ${data.worktrees.repos.length} repo(s)`
            : 'No orphaned worktrees',
        },
        {
          id: 'usage',
          name: 'Usage Data',
          count: data.usage.count,
          sizeBytes: data.usage.sizeBytes,
          details: `${data.usage.count} files (${formatBytes(data.usage.sizeBytes)})`,
        },
      ];

      set({ categories, isLoading: false });
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : 'Failed to load', isLoading: false });
    }
  },

  clearCategory: async (categoryId) => {
    set({ clearingCategoryId: categoryId });
    try {
      let data: any;
      switch (categoryId) {
        case 'sessions':
          data = await api('DELETE', '/system/cache/sessions');
          break;
        case 'artifacts':
          data = await api('DELETE', '/system/cache/artifacts');
          break;
        case 'worktrees':
          data = await api('POST', '/system/cache/worktrees/prune');
          break;
        case 'usage':
          data = await api('DELETE', '/system/cache/usage');
          break;
        default:
          set({ clearingCategoryId: null });
          return { success: false, message: `Unknown category: ${categoryId}` };
      }

      set({ clearingCategoryId: null });

      // Refresh info
      await get().loadCacheInfo();

      const freed = data?.freedBytes;
      return {
        success: true,
        message: freed ? `Cleared (${formatBytes(freed)} freed)` : 'Cleared successfully',
      };
    } catch (err) {
      set({ clearingCategoryId: null });
      return { success: false, message: err instanceof Error ? err.message : 'Clear failed' };
    }
  },

  clearAll: async () => {
    set({ isClearingAll: true });
    try {
      const data = await api<{
        sessions: { cleared: number; skipped: number };
        artifacts: { cleared: number; freedBytes: number };
        worktrees: { pruned: number };
        usage: { cleared: number; freedBytes: number };
      }>('DELETE', '/system/cache/all');

      set({ isClearingAll: false });

      // Refresh info
      await get().loadCacheInfo();

      // Also clear client-side caches
      await get().clearClientCaches();

      const totalFreed = (data.artifacts?.freedBytes || 0) + (data.usage?.freedBytes || 0);
      return {
        success: true,
        message: totalFreed > 0
          ? `All caches cleared (${formatBytes(totalFreed)} freed)`
          : 'All caches cleared',
      };
    } catch (err) {
      set({ isClearingAll: false });
      return { success: false, message: err instanceof Error ? err.message : 'Clear all failed' };
    }
  },

  clearClientCaches: async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (name.startsWith('claudedesk')) {
            await caches.delete(name);
          }
        }
      }
    } catch { /* Cache API not available */ }

    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
      }
    } catch { /* Service worker not available */ }
  },
}));
