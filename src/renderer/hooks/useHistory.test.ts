import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useHistory } from './useHistory';
import type { HistorySessionEntry } from '../../shared/types/history-types';

const session: HistorySessionEntry = {
  id: 's1',
  name: 'Session One',
  workingDirectory: '/repo',
  createdAt: 1,
  lastUpdatedAt: 2,
  sizeBytes: 100,
  segmentCount: 0,
};

describe('useHistory', () => {
  it('loads sessions on mount and clears loading', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([session]);
    const { result } = renderHook(() => useHistory());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions).toEqual([session]);
    expect(result.current.error).toBeNull();
  });

  it('sets error and keeps sessions empty when listHistory rejects', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockRejectedValue(new Error('disk error'));
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('disk error');
    expect(result.current.sessions).toEqual([]);
  });

  it('getContent passes through the result and returns null on rejection', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([]);
    api.getHistory = vi.fn().mockResolvedValue('log contents');
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.getContent('s1')).resolves.toBe('log contents');
    expect(api.getHistory).toHaveBeenCalledWith('s1');

    api.getHistory = vi.fn().mockRejectedValue(new Error('missing'));
    await expect(result.current.getContent('s1')).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('missing'));
  });

  it('search passes through results and returns [] on rejection', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([]);
    const searchResult = { session, matchCount: 1, previews: [] };
    api.searchHistory = vi.fn().mockResolvedValue([searchResult]);
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.search('term', true)).resolves.toEqual([searchResult]);
    expect(api.searchHistory).toHaveBeenCalledWith('term', true);

    api.searchHistory = vi.fn().mockRejectedValue(new Error('bad query'));
    await expect(result.current.search('term')).resolves.toEqual([]);
    await waitFor(() => expect(result.current.error).toBe('bad query'));
  });

  it('remove refreshes sessions on success and returns false without refreshing on rejection', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([session]);
    api.deleteHistory = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.sessions).toEqual([session]));

    api.listHistory = vi.fn().mockResolvedValue([]);
    await act(async () => {
      const ok = await result.current.remove('s1');
      expect(ok).toBe(true);
    });
    expect(api.listHistory).toHaveBeenCalled();
    expect(result.current.sessions).toEqual([]);

    api.deleteHistory = vi.fn().mockRejectedValue(new Error('locked'));
    await act(async () => {
      const ok = await result.current.remove('s1');
      expect(ok).toBe(false);
    });
    expect(result.current.error).toBe('locked');
  });

  it('removeAll refreshes sessions on success and returns false on rejection', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([session]);
    api.deleteAllHistory = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.sessions).toEqual([session]));

    api.listHistory = vi.fn().mockResolvedValue([]);
    await act(async () => {
      const ok = await result.current.removeAll();
      expect(ok).toBe(true);
    });
    expect(result.current.sessions).toEqual([]);

    api.deleteAllHistory = vi.fn().mockRejectedValue(new Error('nope'));
    await act(async () => {
      const ok = await result.current.removeAll();
      expect(ok).toBe(false);
    });
    expect(result.current.error).toBe('nope');
  });

  it('exportMarkdown and exportJson pass through and fall back to false on rejection', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([]);
    api.exportHistoryMarkdown = vi.fn().mockResolvedValue(true);
    api.exportHistoryJson = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.exportMarkdown('s1', '/out.md')).resolves.toBe(true);
    expect(api.exportHistoryMarkdown).toHaveBeenCalledWith('s1', '/out.md');
    await expect(result.current.exportJson('s1', '/out.json')).resolves.toBe(true);
    expect(api.exportHistoryJson).toHaveBeenCalledWith('s1', '/out.json');

    api.exportHistoryMarkdown = vi.fn().mockRejectedValue(new Error('io error'));
    await expect(result.current.exportMarkdown('s1', '/out.md')).resolves.toBe(false);
    await waitFor(() => expect(result.current.error).toBe('io error'));

    api.exportHistoryJson = vi.fn().mockRejectedValue(new Error('io error 2'));
    await expect(result.current.exportJson('s1', '/out.json')).resolves.toBe(false);
    await waitFor(() => expect(result.current.error).toBe('io error 2'));
  });

  it('getSettings/updateSettings/getStats pass through and fall back on rejection', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockResolvedValue([]);
    const settings = { maxAgeDays: 30, maxSizeMB: 500, autoCleanup: true };
    api.getHistorySettings = vi.fn().mockResolvedValue(settings);
    api.updateHistorySettings = vi.fn().mockResolvedValue(true);
    const stats = { totalSessions: 3, totalSizeBytes: 900, oldestSessionDate: 1, newestSessionDate: 3 };
    api.getHistoryStats = vi.fn().mockResolvedValue(stats);
    const { result } = renderHook(() => useHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.getSettings()).resolves.toEqual(settings);
    await expect(result.current.updateSettings({ autoCleanup: false })).resolves.toBe(true);
    expect(api.updateHistorySettings).toHaveBeenCalledWith({ autoCleanup: false });
    await expect(result.current.getStats()).resolves.toEqual(stats);

    api.getHistorySettings = vi.fn().mockRejectedValue(new Error('settings error'));
    await expect(result.current.getSettings()).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('settings error'));

    api.updateHistorySettings = vi.fn().mockRejectedValue(new Error('update error'));
    await expect(result.current.updateSettings({})).resolves.toBe(false);
    await waitFor(() => expect(result.current.error).toBe('update error'));

    api.getHistoryStats = vi.fn().mockRejectedValue(new Error('stats error'));
    await expect(result.current.getStats()).resolves.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('stats error'));
  });
});
