import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { getElectronAPI, resetElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { SessionPane } from './SessionPane';
import type { TabData } from '../ui/Tab';
import type { SessionDigest } from '../../../shared/types/history-types';

function makeSession(overrides: Partial<TabData> = {}): TabData {
  return {
    id: 's1',
    name: 'fix auth bug',
    workingDirectory: 'C:\\repos\\omnidesk',
    permissionMode: 'standard',
    status: 'running',
    kind: 'agent',
    ...overrides,
  };
}

function makeDigest(overrides: Partial<SessionDigest> = {}): SessionDigest {
  return {
    sessionId: 's1',
    windowStart: Date.now() - 120_000,
    windowEnd: Date.now(),
    activeDurationMs: 90_000,
    restartSegments: 0,
    outputBytes: 2048,
    checkpointsCreated: 3,
    approvalPromptsHit: 2,
    errorsDetected: 0,
    ...overrides,
  };
}

describe('SessionPane recap glance (#232)', () => {
  it('renders the digest recap once the fetch resolves', async () => {
    const api = resetElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(makeDigest());

    render(<SessionPane session={makeSession()} />);

    await waitFor(() => expect(api.getSessionDigest).toHaveBeenCalledWith('s1', undefined));
    const digestRow = await screen.findByTestId('session-pane-digest');
    expect(digestRow).toHaveTextContent('Active 1m');
    expect(digestRow).toHaveTextContent('Output 2.0 KB');
    expect(digestRow).toHaveTextContent('Checkpoints 3');
    expect(screen.getByTestId('session-pane-digest-approvals')).toHaveTextContent('Approvals 2');
    expect(screen.getByTestId('session-pane-digest-errors')).toHaveTextContent('Errors 0');
  });

  it('never renders 0 for null approvals/errors — shows the not-tracked fallback instead', async () => {
    const api = resetElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(
      makeDigest({ approvalPromptsHit: null, errorsDetected: null }),
    );

    render(<SessionPane session={makeSession()} />);

    const approvals = await screen.findByTestId('session-pane-digest-approvals');
    const errors = screen.getByTestId('session-pane-digest-errors');
    expect(approvals).toHaveTextContent('— (not tracked)');
    expect(errors).toHaveTextContent('— (not tracked)');
    // Guard against a regression that coerces null to 0.
    expect(approvals.textContent).not.toContain('Approvals 0');
    expect(errors.textContent).not.toContain('Errors 0');
  });

  it('only shows the Restarts chip when restartSegments is greater than zero', async () => {
    const api = resetElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(makeDigest({ restartSegments: 0 }));

    const { rerender } = render(<SessionPane session={makeSession()} />);
    await screen.findByTestId('session-pane-digest');
    expect(screen.queryByText(/Restarts/)).not.toBeInTheDocument();

    api.getSessionDigest = vi.fn().mockResolvedValue(makeDigest({ restartSegments: 2 }));
    rerender(<SessionPane session={makeSession({ id: 's2' })} />);
    await waitFor(() => expect(screen.getByText('Restarts 2')).toBeInTheDocument());
  });

  it('hides the recap row while the digest fetch is pending', () => {
    const api = resetElectronAPI();
    // Never resolves within this test — asserts the loading state renders nothing.
    api.getSessionDigest = vi.fn(() => new Promise<SessionDigest>(() => {}));

    render(<SessionPane session={makeSession()} />);

    expect(screen.queryByTestId('session-pane-digest')).not.toBeInTheDocument();
  });

  it('hides the recap row when the digest fetch errors', async () => {
    const api = resetElectronAPI();
    api.getSessionDigest = vi.fn().mockRejectedValue(new Error('digest computation failed'));

    render(<SessionPane session={makeSession()} />);

    await waitFor(() => expect(api.getSessionDigest).toHaveBeenCalled());
    expect(screen.queryByTestId('session-pane-digest')).not.toBeInTheDocument();
  });

  it('re-fetches the digest when the focused session changes', async () => {
    const api = resetElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(makeDigest());

    const { rerender } = render(<SessionPane session={makeSession({ id: 's1' })} />);
    await waitFor(() => expect(api.getSessionDigest).toHaveBeenCalledWith('s1', undefined));

    rerender(<SessionPane session={makeSession({ id: 's2', name: 'second session' })} />);
    await waitFor(() => expect(api.getSessionDigest).toHaveBeenCalledWith('s2', undefined));
    expect(api.getSessionDigest).toHaveBeenCalledTimes(2);
  });
});
