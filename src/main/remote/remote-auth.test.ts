import { describe, it, expect, vi } from 'vitest';
import { RemoteAuth } from './remote-auth';

describe('RemoteAuth', () => {
  it('generates a non-trivial token', () => {
    const a = new RemoteAuth();
    expect(a.getToken().length).toBeGreaterThanOrEqual(24);
  });

  it('verifies the correct token and rejects others', () => {
    const a = new RemoteAuth();
    expect(a.verify(a.getToken())).toBe(true);
    expect(a.verify('wrong')).toBe(false);
    expect(a.verify('')).toBe(false);
  });

  it('regenerate invalidates the old token', () => {
    const a = new RemoteAuth();
    const old = a.getToken();
    const next = a.regenerate();
    expect(next).not.toBe(old);
    expect(a.verify(old)).toBe(false);
    expect(a.verify(next)).toBe(true);
  });

  it('validates a cookie header carrying the token', () => {
    const a = new RemoteAuth();
    const header = `foo=bar; ${RemoteAuth.COOKIE}=${a.getToken()}; baz=1`;
    expect(a.cookieValid(header)).toBe(true);
    expect(a.cookieValid(`${RemoteAuth.COOKIE}=nope`)).toBe(false);
    expect(a.cookieValid(undefined)).toBe(false);
  });

  it('builds a Secure cookie only when secure=true', () => {
    const a = new RemoteAuth();
    expect(a.buildSetCookie(true)).toContain('Secure');
    expect(a.buildSetCookie(false)).not.toContain('Secure');
    expect(a.buildSetCookie(true)).toContain('HttpOnly');
    expect(a.buildSetCookie(true)).toContain('SameSite=Strict');
  });

  it('builds a persistent cookie with Max-Age', () => {
    const a = new RemoteAuth();
    expect(a.buildSetCookie(true)).toMatch(/Max-Age=\d+/);
  });

  it('uses a provided (persisted) token instead of generating one', () => {
    const a = new RemoteAuth('persisted-token-123');
    expect(a.getToken()).toBe('persisted-token-123');
    expect(a.verify('persisted-token-123')).toBe(true);
  });

  it('rate limits after the max attempts within the window', () => {
    const a = new RemoteAuth();
    for (let i = 0; i < 10; i++) expect(a.rateLimited('1.2.3.4')).toBe(false);
    expect(a.rateLimited('1.2.3.4')).toBe(true);
    expect(a.rateLimited('9.9.9.9')).toBe(false);
  });

  it('prunes stale attempts once the window elapses, keeping the map bounded', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const a = new RemoteAuth();

      // Flood with many distinct IPs (as a spoofed X-Forwarded-For header
      // could do) — each gets one entry in the attempts map.
      const ipCount = 50;
      for (let i = 0; i < ipCount; i++) {
        a.rateLimited(`10.0.0.${i}`);
      }
      expect(a.size()).toBe(ipCount);

      // Advance past WINDOW_MS (60s). The next call should sweep out every
      // entry whose window has elapsed before recording the new one.
      vi.setSystemTime(61_000);
      expect(a.rateLimited('10.0.0.999')).toBe(false);

      // Only the fresh entry should remain — the map didn't grow unbounded.
      expect(a.size()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
