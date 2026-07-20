import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import type { Repo } from '../../hooks/useRepos';

// Minimal valid Repo fixture — StatusBar only reads id/name/path/branch, but
// the prop type requires the full shape.
function makeRepo(partial?: Partial<Repo>): Repo {
  return {
    id: 'r1',
    name: 'omnidesk',
    org: 'workspace',
    path: 'C:/repos/omnidesk',
    workspacePath: 'C:/repos',
    branch: 'main',
    lastOpened: 0,
    color: 'accent',
    isGit: true,
    ...partial,
  };
}

describe('StatusBar burn-rate pill', () => {
  it('renders the %/hr pill when burnRatePerHour is a number (e.g. BurnRateData.ratePerHour5h)', () => {
    render(
      <StatusBar
        repo={makeRepo()}
        repos={[makeRepo()]}
        sessions={[]}
        burnRatePerHour={12.34}
        onOpenOtherReposLive={() => {}}
      />
    );
    expect(screen.getByText('12.3%/hr')).toBeInTheDocument();
  });

  it('does not render the pill when burnRatePerHour is null', () => {
    render(
      <StatusBar
        repo={makeRepo()}
        repos={[makeRepo()]}
        sessions={[]}
        burnRatePerHour={null}
        onOpenOtherReposLive={() => {}}
      />
    );
    expect(screen.queryByText(/%\/hr/)).not.toBeInTheDocument();
  });

  it('does not render the pill when burnRatePerHour is undefined', () => {
    render(
      <StatusBar
        repo={makeRepo()}
        repos={[makeRepo()]}
        sessions={[]}
        onOpenOtherReposLive={() => {}}
      />
    );
    expect(screen.queryByText(/%\/hr/)).not.toBeInTheDocument();
  });
});
