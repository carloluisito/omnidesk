import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI, resetElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useRepos } from './useRepos';

const GROUPS_KEY = 'omnidesk.repo.groups';
const OPENED_REPOS_KEY = 'omnidesk.repo.openedIds';
const PLAIN_FOLDERS_KEY = 'omnidesk.repo.plainFolders';

describe('useRepos', () => {
  let api: ReturnType<typeof getElectronAPI>;

  beforeEach(() => {
    localStorage.clear();
    api = resetElectronAPI();
    // Empty scan by default: refresh() must resolve without repos/workspaces
    // present for the group/persistence logic under test to be exercised in
    // isolation.
    api.listWorkspaces.mockResolvedValue([]);
    api.listGitRepos.mockResolvedValue([]);
  });

  async function setup() {
    const { result } = renderHook(() => useRepos());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    return result;
  }

  describe('createGroup', () => {
    it('creates one group containing both repos and persists it', async () => {
      const result = await setup();

      let groupId = '';
      act(() => {
        groupId = result.current.createGroup('Pair', ['repoA', 'repoB']);
      });

      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0]).toMatchObject({
        id: groupId,
        name: 'Pair',
        repoIds: ['repoA', 'repoB'],
      });

      const persisted = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]');
      expect(persisted).toHaveLength(1);
      expect(persisted[0].repoIds).toEqual(['repoA', 'repoB']);
    });

    it('removes a repo from its prior group when it joins a new one (single-group membership)', async () => {
      const result = await setup();

      act(() => {
        result.current.createGroup('Group 1', ['repoA', 'repoB']);
      });
      expect(result.current.groups).toHaveLength(1);

      // repoB moves into a new group with repoC. Group 1 drops to 1 member
      // (repoA) and must auto-dissolve.
      act(() => {
        result.current.createGroup('Group 2', ['repoB', 'repoC']);
      });

      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0].name).toBe('Group 2');
      expect(result.current.groups[0].repoIds).toEqual(['repoB', 'repoC']);
      expect(result.current.groupOf('repoA')).toBeNull();
    });

    it('pins current createGroup behavior: the newly-created group bypasses the >=2 dissolve rule', async () => {
      // Guard asymmetry noted in issue #185: writeAndSet (used by
      // addRepoToGroup/removeRepoFromGroup) filters out any group with < 2
      // members, but createGroup persists its own `group` via writeGroups
      // directly without that filter. This isn't reachable through the UI
      // today (App.tsx always calls createGroup with two distinct repos),
      // so this test pins the current behavior rather than changing it.
      const result = await setup();

      act(() => {
        result.current.createGroup('Solo', ['repoA']);
      });

      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0].repoIds).toEqual(['repoA']);
    });
  });

  describe('addRepoToGroup / removeRepoFromGroup', () => {
    it('pulls the repo out of its previous group when added to another', async () => {
      const result = await setup();

      // Group 1 starts with 3 members so pulling one out leaves it at 2 —
      // still valid — isolating "moved to the new group" from the separate
      // auto-dissolve behavior covered below.
      let groupId1 = '';
      let groupId2 = '';
      act(() => {
        groupId1 = result.current.createGroup('Group 1', ['repoA', 'repoB', 'repoE']);
        groupId2 = result.current.createGroup('Group 2', ['repoC', 'repoD']);
      });

      act(() => {
        result.current.addRepoToGroup(groupId2, 'repoA');
      });

      const g1 = result.current.groups.find(g => g.id === groupId1);
      const g2 = result.current.groups.find(g => g.id === groupId2);
      expect(g1?.repoIds).toEqual(['repoB', 'repoE']);
      expect(g2?.repoIds).toEqual(['repoC', 'repoD', 'repoA']);
      expect(result.current.groupOf('repoA')?.id).toBe(groupId2);
    });

    it('dissolves a group when removeRepoFromGroup leaves it with fewer than 2 members', async () => {
      const result = await setup();

      let groupId = '';
      act(() => {
        groupId = result.current.createGroup('Pair', ['repoA', 'repoB']);
      });
      expect(result.current.groups).toHaveLength(1);

      act(() => {
        result.current.removeRepoFromGroup(groupId, 'repoB');
      });

      expect(result.current.groups).toHaveLength(0);
      expect(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')).toHaveLength(0);
    });

    it('keeps a group intact when removal still leaves >= 2 members', async () => {
      const result = await setup();

      let groupId = '';
      act(() => {
        groupId = result.current.createGroup('Trio', ['repoA', 'repoB', 'repoC']);
      });

      act(() => {
        result.current.removeRepoFromGroup(groupId, 'repoC');
      });

      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0].repoIds).toEqual(['repoA', 'repoB']);
    });
  });

  describe('dissolveGroup / renameGroup', () => {
    it('dissolveGroup removes the group and persists', async () => {
      const result = await setup();

      let groupId = '';
      act(() => {
        groupId = result.current.createGroup('Pair', ['repoA', 'repoB']);
      });

      act(() => {
        result.current.dissolveGroup(groupId);
      });

      expect(result.current.groups).toHaveLength(0);
      expect(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')).toHaveLength(0);
    });

    it('renameGroup trims whitespace', async () => {
      const result = await setup();

      let groupId = '';
      act(() => {
        groupId = result.current.createGroup('Pair', ['repoA', 'repoB']);
      });

      act(() => {
        result.current.renameGroup(groupId, '  Renamed  ');
      });

      expect(result.current.groups[0].name).toBe('Renamed');
    });

    it('renameGroup falls back to the old name on an empty/blank input', async () => {
      const result = await setup();

      let groupId = '';
      act(() => {
        groupId = result.current.createGroup('Pair', ['repoA', 'repoB']);
      });

      act(() => {
        result.current.renameGroup(groupId, '   ');
      });

      expect(result.current.groups[0].name).toBe('Pair');
    });
  });

  describe('groupOf', () => {
    it('returns the containing group, or null when ungrouped', async () => {
      const result = await setup();

      act(() => {
        result.current.createGroup('Pair', ['repoA', 'repoB']);
      });

      expect(result.current.groupOf('repoA')?.name).toBe('Pair');
      expect(result.current.groupOf('repoZ')).toBeNull();
    });
  });

  describe('openRepo / closeRepo', () => {
    it('openRepo adds the id and persists it', async () => {
      const result = await setup();

      act(() => {
        result.current.openRepo('repoA');
      });

      expect(result.current.openedRepoIds.has('repoA')).toBe(true);
      expect(JSON.parse(localStorage.getItem(OPENED_REPOS_KEY) ?? '[]')).toEqual(['repoA']);
    });

    it('closeRepo removes the id and persists it', async () => {
      const result = await setup();

      act(() => {
        result.current.openRepo('repoA');
        result.current.openRepo('repoB');
      });
      act(() => {
        result.current.closeRepo('repoA');
      });

      expect(result.current.openedRepoIds.has('repoA')).toBe(false);
      expect(result.current.openedRepoIds.has('repoB')).toBe(true);
      expect(JSON.parse(localStorage.getItem(OPENED_REPOS_KEY) ?? '[]')).toEqual(['repoB']);
    });
  });

  describe('localStorage persistence round-trip', () => {
    it('a fresh mount reads persisted groups, openedIds, and plainFolders back', async () => {
      const persistedGroup = { id: 'g_seed', name: 'Seeded', repoIds: ['repoA', 'repoB'], createdAt: 1 };
      localStorage.setItem(GROUPS_KEY, JSON.stringify([persistedGroup]));
      localStorage.setItem(OPENED_REPOS_KEY, JSON.stringify(['repoA']));
      localStorage.setItem(PLAIN_FOLDERS_KEY, JSON.stringify([{ name: 'plain', path: '/tmp/plain' }]));

      const result = await setup();

      expect(result.current.groups).toEqual([persistedGroup]);
      expect(result.current.openedRepoIds.has('repoA')).toBe(true);
      expect(result.current.plainFolders).toEqual([{ name: 'plain', path: '/tmp/plain' }]);
    });

    it('falls back to safe defaults when a persisted key holds corrupt (non-JSON) data', async () => {
      localStorage.setItem(GROUPS_KEY, '{not json');
      localStorage.setItem(OPENED_REPOS_KEY, '{not json');
      localStorage.setItem(PLAIN_FOLDERS_KEY, '{not json');

      const result = await setup();

      expect(result.current.groups).toEqual([]);
      expect(result.current.openedRepoIds.size).toBe(0);
      expect(result.current.plainFolders).toEqual([]);
    });
  });
});
