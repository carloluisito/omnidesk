/**
 * Tests for ShareIndicator
 *
 * Covers:
 *   - Renders with correct data-testid
 *   - Displays count correctly (0, 1, 5, 9, 10+)
 *   - aria-label is correct for singular and plural
 *   - Shows "9+" for counts > 9
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ShareIndicator } from './ShareIndicator';

describe('ShareIndicator', () => {
  it('renders with data-testid="share-indicator"', () => {
    render(<ShareIndicator count={1} />);
    expect(screen.getByTestId('share-indicator')).toBeInTheDocument();
  });

  it('displays count "0"', () => {
    render(<ShareIndicator count={0} />);
    expect(screen.getByTestId('share-indicator')).toHaveTextContent('0');
  });

  it('displays count "3"', () => {
    render(<ShareIndicator count={3} />);
    expect(screen.getByTestId('share-indicator')).toHaveTextContent('3');
  });

  it('displays "9+" for count > 9', () => {
    render(<ShareIndicator count={10} />);
    expect(screen.getByTestId('share-indicator')).toHaveTextContent('9+');
  });

  it('displays "9+" for count = 15', () => {
    render(<ShareIndicator count={15} />);
    expect(screen.getByTestId('share-indicator')).toHaveTextContent('9+');
  });

  it('aria-label says "1 observer connected" for count=1', () => {
    render(<ShareIndicator count={1} />);
    expect(screen.getByTestId('share-indicator')).toHaveAttribute(
      'aria-label',
      '1 observer connected'
    );
  });

  it('aria-label says "3 observers connected" for count=3', () => {
    render(<ShareIndicator count={3} />);
    expect(screen.getByTestId('share-indicator')).toHaveAttribute(
      'aria-label',
      '3 observers connected'
    );
  });

  it('aria-label says "0 observers connected" for count=0', () => {
    render(<ShareIndicator count={0} />);
    expect(screen.getByTestId('share-indicator')).toHaveAttribute(
      'aria-label',
      '0 observers connected'
    );
  });
});
