import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';

// Mock child components
vi.mock('./WelcomeHero', () => ({
  WelcomeHero: ({ version }: any) => <div data-testid="welcome-hero">Welcome v{version}</div>,
}));

vi.mock('./QuickActionCard', () => ({
  QuickActionCard: ({ title, onClick }: any) => (
    <button data-testid={`action-${title.replace(/\s/g, '-').toLowerCase()}`} onClick={onClick}>
      {title}
    </button>
  ),
}));

vi.mock('./FeatureShowcase', () => ({
  FeatureShowcase: () => <div data-testid="feature-showcase" />,
}));

vi.mock('./RecentSessionsList', () => ({
  RecentSessionsList: ({ sessions, onSelectSession }: any) => (
    <div data-testid="recent-sessions">
      {sessions.map((s: any) => (
        <div key={s.id} data-testid={`recent-${s.id}`} onClick={() => onSelectSession(s.id)}>
          {s.name}
        </div>
      ))}
    </div>
  ),
}));

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  let api: ReturnType<typeof getElectronAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    api = getElectronAPI();
    api.getVersionInfo.mockResolvedValue({ appVersion: '4.5.0' });
    api.listHistory.mockResolvedValue([]);
  });

  it('renders welcome hero', () => {
    render(<EmptyState onCreateSession={vi.fn()} />);
    expect(screen.getByTestId('welcome-hero')).toBeInTheDocument();
  });

  it('renders quick action cards', () => {
    render(<EmptyState onCreateSession={vi.fn()} />);
    expect(screen.getByTestId('action-start-coding')).toBeInTheDocument();
    expect(screen.getByTestId('action-analyze-codebase')).toBeInTheDocument();
    expect(screen.getByTestId('action-join-session')).toBeInTheDocument();
  });

  it('calls onCreateSession when quick action is clicked (no onQuickStart)', () => {
    const onCreateSession = vi.fn();
    render(<EmptyState onCreateSession={onCreateSession} />);
    fireEvent.click(screen.getByTestId('action-start-coding'));
    expect(onCreateSession).toHaveBeenCalled();
  });

  it('calls onQuickStart handlers when provided', () => {
    const onQuickStart = {
      startCoding: vi.fn(),
      analyzeCodebase: vi.fn(),
      joinSession: vi.fn(),
    };
    render(<EmptyState onCreateSession={vi.fn()} onQuickStart={onQuickStart} />);

    fireEvent.click(screen.getByTestId('action-start-coding'));
    expect(onQuickStart.startCoding).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('action-analyze-codebase'));
    expect(onQuickStart.analyzeCodebase).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('action-join-session'));
    expect(onQuickStart.joinSession).toHaveBeenCalled();
  });

  it('renders feature showcase', () => {
    render(<EmptyState onCreateSession={vi.fn()} />);
    expect(screen.getByTestId('feature-showcase')).toBeInTheDocument();
  });
});
