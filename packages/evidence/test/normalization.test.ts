import { describe, it, expect } from 'vitest';
import { createEvidenceRecord, classifyRequestOrigin } from '../src/normalization.js';

describe('Evidence Normalization (§24)', () => {
  it('creates Grade A evidence record from browser observation', () => {
    const rec = createEvidenceRecord({
      id: 'ev_123',
      type: 'lcp',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      selector: 'main h1',
      value: 2400,
      unit: 'ms',
    });

    expect(rec.grade).toBe('A');
    expect(rec.state).toBe('AVAILABLE');
    expect(rec.confidence).toBe(1.0);
    expect(rec.value).toBe(2400);
  });

  it('classifies first party vs third party requests (§12)', () => {
    const first = classifyRequestOrigin('https://assets.mybiz.com/style.css', 'mybiz.com');
    expect(first.party).toBe('FIRST_PARTY');

    const third = classifyRequestOrigin('https://cdn.thirdparty.com/script.js', 'mybiz.com');
    expect(third.party).toBe('THIRD_PARTY');
  });
});
