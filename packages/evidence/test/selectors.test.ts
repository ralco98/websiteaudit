import { describe, it, expect } from 'vitest';
import { generateStableSelector } from '../src/selectors.js';

describe('Selector Generator (§15)', () => {
  it('prefers ID selectors for HIGH stability', () => {
    const res = generateStableSelector({ id: 'primary-btn', tagName: 'button' });
    expect(res.selector).toBe('#primary-btn');
    expect(res.stability).toBe('HIGH');
  });

  it('uses input name attribute for MEDIUM stability', () => {
    const res = generateStableSelector({ name: 'phone', tagName: 'input' });
    expect(res.selector).toBe('input[name="phone"]');
    expect(res.stability).toBe('MEDIUM');
  });
});
