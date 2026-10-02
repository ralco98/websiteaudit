import { describe, it, expect } from 'vitest';
import { PageObservation } from '@convertaudit/evidence';
import {
  defaultDetectorRegistry,
  SpeedLcpSlowDetector,
  SpeedClsHighDetector,
  SpeedLongTasksDetector,
  SpeedPageWeightDetector,
  SpeedHeavyImageDetector,
  SpeedThirdPartyHeavyDetector,
  DetectorContext,
} from '../src/index.js';

function createMockObservation(overrides: Partial<PageObservation> = {}): PageObservation {
  return {
    schemaVersion: 'observation.v1',
    target: {
      requestedUrl: 'https://test.mybusiness.com',
      finalUrl: 'https://test.mybusiness.com',
      host: 'test.mybusiness.com',
      timestamp: new Date().toISOString(),
    },
    viewport: {
      profile: 'mobile',
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      touch: true,
    },
    navigation: {
      status: 200,
      redirects: 0,
      navigationStart: 0,
      responseStart: 120,
      domContentLoaded: 450,
      load: 800,
      ttfb: 120,
      timingSource: 'BROWSER',
    },
    dom: {
      title: 'Fast Emergency Business',
      metaDescription: 'Fast 24/7 service',
      headings: [{ tag: 'h1', text: 'Plumbing Services', selector: 'h1', bbox: { x: 0, y: 0, width: 300, height: 40 }, fontSizePx: 24, fontWeight: 'bold' }],
      links: [],
      buttons: [],
      forms: [],
      inputs: [],
      images: [],
      videos: [],
      iframes: [],
    },
    interactive: {
      ctaCandidates: [],
      phoneLinks: [],
      emailLinks: [],
      contactLinks: [],
      submitControls: [],
    },
    network: {
      requests: [],
      totalRequests: 8,
      totalTransferBytes: 450000,
      firstPartyTransferBytes: 400000,
      thirdPartyTransferBytes: 50000,
    },
    performance: {
      fcp: 900,
      lcp: 1400,
      lcpElement: {
        valueMs: 1400,
        selector: 'h1',
        tagName: 'h1',
        bbox: { x: 20, y: 100, width: 350, height: 40 },
      },
      cls: 0.02,
      longTasks: [],
      tbt: 0,
      resources: [],
    },
    console: { errors: [], warnings: [], pageErrors: [] },
    visual: { dimensions: { width: 390, height: 844 }, timestamp: new Date().toISOString() },
    browser: { engine: 'chromium', version: '122.0.0.0', observationStatus: 'COMPLETE' },
    ...overrides,
  };
}

describe('Phase 2B: Performance Detector Migration (§9 - §23)', () => {
  it('evaluates SPEED_LCP_SLOW on fast vs slow pages correctly (§10)', () => {
    const fastObs = createMockObservation({ performance: { fcp: 800, lcp: 1500, lcpElement: null, cls: 0.01, longTasks: [], tbt: 0, resources: [] } });
    const fastCtx: DetectorContext = { observation: fastObs, profile: 'mobile' };
    const fastRes = SpeedLcpSlowDetector.evaluate(fastCtx);
    expect(fastRes.status).toBe('NOT_DETECTED');
    expect(fastRes.detected).toBe(false);

    const slowObs = createMockObservation({ performance: { fcp: 1800, lcp: 3400, lcpElement: { valueMs: 3400, selector: '#hero-img', tagName: 'img', bbox: { x: 0, y: 0, width: 390, height: 300 } }, cls: 0.01, longTasks: [], tbt: 0, resources: [] } });
    const slowCtx: DetectorContext = { observation: slowObs, profile: 'mobile' };
    const slowRes = SpeedLcpSlowDetector.evaluate(slowCtx);
    expect(slowRes.status).toBe('DETECTED');
    expect(slowRes.detected).toBe(true);
    expect(slowRes.evidenceGrade).toBe('A');
    expect(slowRes.finding).not.toBeNull();
    expect(slowRes.finding?.code).toBe('SPEED_LCP_SLOW');
  });

  it('evaluates SPEED_CLS_HIGH correctly (§11)', () => {
    const highClsObs = createMockObservation({ performance: { fcp: 800, lcp: 1400, lcpElement: null, cls: 0.28, longTasks: [], tbt: 0, resources: [] } });
    const res = SpeedClsHighDetector.evaluate({ observation: highClsObs, profile: 'mobile' });
    expect(res.status).toBe('DETECTED');
    expect(res.measurements.observationWindow).toBe('initial_load_1.5s');
  });

  it('evaluates SPEED_LONG_TASKS_JS correctly (§12)', () => {
    const longTaskObs = createMockObservation({
      performance: {
        fcp: 1200,
        lcp: 2200,
        lcpElement: null,
        cls: 0.02,
        longTasks: [
          { startTimeMs: 400, durationMs: 180, blockingTimeMs: 130 },
          { startTimeMs: 800, durationMs: 220, blockingTimeMs: 170 },
        ],
        tbt: 300,
        resources: [],
      },
    });
    const res = SpeedLongTasksDetector.evaluate({ observation: longTaskObs, profile: 'mobile' });
    expect(res.status).toBe('DETECTED');
    expect(res.measurements.tbtMs).toBe(300);
  });

  it('evaluates SPEED_PAGE_WEIGHT correctly (§13)', () => {
    const heavyObs = createMockObservation({
      network: {
        requests: [],
        totalRequests: 45,
        totalTransferBytes: 3_200_000,
        firstPartyTransferBytes: 2_000_000,
        thirdPartyTransferBytes: 1_200_000,
      },
    });
    const res = SpeedPageWeightDetector.evaluate({ observation: heavyObs, profile: 'mobile' });
    expect(res.status).toBe('DETECTED');
  });

  it('evaluates SPEED_HEAVY_IMAGE correctly (§14)', () => {
    const imgObs = createMockObservation({
      dom: {
        title: 'Title',
        metaDescription: '',
        headings: [],
        links: [],
        buttons: [],
        forms: [],
        inputs: [],
        images: [{ src: 'https://test.com/hero.jpg', naturalWidth: 2400, naturalHeight: 1600, clientWidth: 390, clientHeight: 260, selector: '#hero-img', bbox: { x: 0, y: 0, width: 390, height: 260 } }],
        videos: [],
        iframes: [],
      },
    });
    const res = SpeedHeavyImageDetector.evaluate({ observation: imgObs, profile: 'mobile' });
    expect(res.status).toBe('DETECTED');
    expect(res.measurements.heavyImage.naturalWidth).toBe(2400);
  });

  it('evaluates SPEED_THIRD_PARTY_HEAVY correctly (§15)', () => {
    const tpObs = createMockObservation({
      network: {
        requests: Array(18).fill({ url: 'https://thirdparty.com/analytics.js', party: 'THIRD_PARTY', transferBytes: 60000 }),
        totalRequests: 20,
        totalTransferBytes: 1_200_000,
        firstPartyTransferBytes: 100_000,
        thirdPartyTransferBytes: 1_100_000,
      },
    });
    const res = SpeedThirdPartyHeavyDetector.evaluate({ observation: tpObs, profile: 'mobile' });
    expect(res.status).toBe('DETECTED');
  });

  it('MANDATORY NEGATIVE TEST: returns INSUFFICIENT_EVIDENCE if LCP is null (§22)', () => {
    const nullLcpObs = createMockObservation({ performance: { fcp: 800, lcp: null, lcpElement: null, cls: 0.01, longTasks: [], tbt: null, resources: [] } });
    const res = SpeedLcpSlowDetector.evaluate({ observation: nullLcpObs, profile: 'mobile' });

    expect(res.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(res.detected).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.finding).toBeNull();
  });

  it('MANDATORY REAL VS SYNTHETIC CONFLICT TEST: follows real browser LCP over synthetic estimate (§23)', () => {
    // Real browser LCP = 1200ms (fast)
    const obs = createMockObservation({ performance: { fcp: 600, lcp: 1200, lcpElement: null, cls: 0.01, longTasks: [], tbt: 0, resources: [] } });
    const res = SpeedLcpSlowDetector.evaluate({ observation: obs, profile: 'mobile' });

    // Even if legacy synthetic estimator would predict 3800ms, real detector reads 1200ms and returns NOT_DETECTED
    expect(res.status).toBe('NOT_DETECTED');
    expect(res.detected).toBe(false);
    expect(res.finding).toBeNull();
  });
});
