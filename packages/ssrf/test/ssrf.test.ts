import { describe, it, expect } from 'vitest';
import { normalizeTarget, TargetValidationError, isBlockedIP } from '../src/index.js';

describe('SSRF & URL Normalization', () => {
  it('normalizes a standard URL correctly', () => {
    const res = normalizeTarget('Example.COM/path?q=1#fragment');
    expect(res.normalized).toBe('https://example.com/path?q=1');
    expect(res.scheme).toBe('https');
    expect(res.host).toBe('example.com');
    expect(res.port).toBe(443);
  });

  it('rejects disallowed schemes (T-01)', () => {
    expect(() => normalizeTarget('ftp://example.com')).toThrowError(TargetValidationError);
    expect(() => normalizeTarget('file:///etc/passwd')).toThrowError(TargetValidationError);
    expect(() => normalizeTarget('javascript:alert(1)')).toThrowError(TargetValidationError);
  });

  it('rejects disallowed non-standard ports (T-02)', () => {
    expect(() => normalizeTarget('https://example.com:8080')).toThrowError(TargetValidationError);
    expect(() => normalizeTarget('http://example.com:8443')).toThrowError(TargetValidationError);
  });

  it('rejects userinfo credentials (T-03)', () => {
    expect(() => normalizeTarget('https://admin:pass@example.com')).toThrowError(TargetValidationError);
  });

  it('blocks private IPv4 and cloud metadata ranges (T-05)', () => {
    expect(isBlockedIP('127.0.0.1')).toBe(true);
    expect(isBlockedIP('10.0.1.5')).toBe(true);
    expect(isBlockedIP('169.254.169.254')).toBe(true);
    expect(isBlockedIP('192.168.1.1')).toBe(true);
    expect(isBlockedIP('172.16.5.10')).toBe(true);
    expect(isBlockedIP('8.8.8.8')).toBe(false);
    expect(isBlockedIP('93.184.216.34')).toBe(false);
  });

  it('blocks restricted IPv6 ranges (T-05)', () => {
    expect(isBlockedIP('::1')).toBe(true);
    expect(isBlockedIP('fc00::1')).toBe(true);
    expect(isBlockedIP('fe80::1')).toBe(true);
    expect(isBlockedIP('::ffff:192.168.1.1')).toBe(true);
    expect(isBlockedIP('2607:f8b0:4005:805::200e')).toBe(false);
  });

  it('rejects .gov and .mil domains (T-10)', () => {
    expect(() => normalizeTarget('https://whitehouse.gov')).toThrowError(TargetValidationError);
    expect(() => normalizeTarget('https://army.mil')).toThrowError(TargetValidationError);
  });
});
