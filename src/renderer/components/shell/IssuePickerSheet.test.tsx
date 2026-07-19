import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { IssuePickerSheet, issueToPrefill } from './IssuePickerSheet';
import type { GitHubIssue } from '../../../shared/integration-types';

const issues: GitHubIssue[] = [
  { number: 7, title: 'Fix crash on resize', body: 'Repro: resize fast', labels: ['bug'], url: 'https://github.com/a/b/issues/7' },
  { number: 12, title: 'Add dark mode toggle', body: '', labels: ['feature'], url: 'https://github.com/a/b/issues/12' },
];

function setup(ok = true) {
  const api = getElectronAPI();
  api.githubPreflight = vi.fn().mockResolvedValue(
    ok
      ? { installed: true, authenticated: true, hasRemote: true }
      : { installed: false, authenticated: false, hasRemote: false, error: 'GitHub CLI (gh) not found — install it with: winget install GitHub.cli' }
  );
  api.listGithubIssues = vi.fn().mockResolvedValue(issues);
  return api;
}

describe('issueToPrefill', () => {
  it('derives name, branch and initialPrompt from the issue', () => {
    const p = issueToPrefill(issues[0]);
    expect(p.name).toBe('#7 Fix crash on resize');
    expect(p.branch).toBe('feat/7-fix-crash-on-resize');
    expect(p.initialPrompt).toContain('GitHub issue #7: Fix crash on resize');
    expect(p.initialPrompt).toContain('Repro: resize fast');
    expect(p.initialPrompt).toContain('https://github.com/a/b/issues/7');
  });

  it('bounds the branch slug and handles symbol-only titles', () => {
    const p = issueToPrefill({ number: 3, title: '!!!', body: '', labels: [], url: 'u' });
    expect(p.branch).toBe('feat/3-issue');
    const long = issueToPrefill({ number: 4, title: 'x'.repeat(200), body: '', labels: [], url: 'u' });
    expect(long.branch.length).toBeLessThanOrEqual('feat/4-'.length + 40);
  });
});

describe('IssuePickerSheet', () => {
  it('lists open issues and picking one produces the exact prefill', async () => {
    setup();
    const onPick = vi.fn();
    render(<IssuePickerSheet repoPath="C:\\repos\\omnidesk" repoName="omnidesk" onPick={onPick} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Fix crash on resize/)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Fix crash on resize/));
    expect(onPick).toHaveBeenCalledWith({
      name: '#7 Fix crash on resize',
      branch: 'feat/7-fix-crash-on-resize',
      initialPrompt: 'GitHub issue #7: Fix crash on resize\n\nRepro: resize fast\n\nhttps://github.com/a/b/issues/7',
    });
  });

  it('filters by text', async () => {
    setup();
    render(<IssuePickerSheet repoPath="p" repoName="r" onPick={() => {}} onClose={() => {}} />);
    await waitFor(() => screen.getByLabelText('Filter issues'));
    fireEvent.change(screen.getByLabelText('Filter issues'), { target: { value: 'dark' } });
    expect(screen.queryByText(/Fix crash on resize/)).not.toBeInTheDocument();
    expect(screen.getByText(/Add dark mode toggle/)).toBeInTheDocument();
  });

  it('preflight failure shows the fix-it hint and never lists issues', async () => {
    const api = setup(false);
    render(<IssuePickerSheet repoPath="p" repoName="r" onPick={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/winget install GitHub.cli/)).toBeInTheDocument());
    expect(api.listGithubIssues).not.toHaveBeenCalled();
  });
});
