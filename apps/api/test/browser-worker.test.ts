import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { BrowserWorker } from '../src/browser/browser-worker.js';
import { generateStableSelector, calculateConfidence, classifyRequestOrigin } from '@convertaudit/evidence';

describe('Phase 1: Browser Worker & Evidence Layer (§5, §6, §10, §15, §23)', () => {
  let server: Server;
  let testUrl: string;

  beforeAll(async () => {
    // Start lightweight local HTTP test fixture server (§33)
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Business - Emergency Services</title>
            <meta name="description" content="24/7 Fast Emergency Plumbing Services in Austin">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              .hero { padding: 40px; background: #f0f0f0; }
              .btn-primary { padding: 16px 32px; background: #0066cc; color: #fff; font-size: 18px; font-weight: bold; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="hero">
              <h1>Emergency Plumbing Services in Austin</h1>
              <p>Licensed plumbers arriving in 30 minutes. Guaranteed 24/7 service.</p>
              <a href="tel:+15551234567" class="btn-phone">Call (555) 123-4567</a>
              <button class="btn-primary" id="quote-btn">Get a Free Quote</button>
            </div>
            <form action="/submit-lead" method="POST" id="lead-form">
              <label for="name-input">Full Name</label>
              <input type="text" id="name-input" name="name" required placeholder="John Doe">
              <label for="phone-input">Phone Number</label>
              <input type="tel" id="phone-input" name="phone" required placeholder="555-000-0000">
              <button type="submit">Request Call</button>
            </form>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as any;
    testUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('generates stable CSS selectors based on priority rules (§15)', () => {
    const idSel = generateStableSelector({ id: 'main-cta', tagName: 'button' });
    expect(idSel.selector).toBe('#main-cta');
    expect(idSel.stability).toBe('HIGH');

    const nameSel = generateStableSelector({ name: 'email', tagName: 'input' });
    expect(nameSel.selector).toBe('input[name="email"]');
    expect(nameSel.stability).toBe('MEDIUM');
  });

  it('calculates deterministic evidence confidence (§26)', () => {
    const gradeA = calculateConfidence({ grade: 'A', state: 'AVAILABLE', selectorStability: 'HIGH' });
    expect(gradeA).toBe(1.0);

    const synthetic = calculateConfidence({ grade: 'D', state: 'SYNTHETIC' });
    expect(synthetic).toBe(0.40);

    const unavail = calculateConfidence({ grade: 'A', state: 'UNAVAILABLE' });
    expect(unavail).toBe(0.0);
  });

  it('classifies first-party vs third-party origins correctly (§12)', () => {
    const first = classifyRequestOrigin('https://api.mybusiness.com/v1/data', 'mybusiness.com');
    expect(first.party).toBe('FIRST_PARTY');

    const third = classifyRequestOrigin('https://www.google-analytics.com/analytics.js', 'mybusiness.com');
    expect(third.party).toBe('THIRD_PARTY');
  });

  it('executes Playwright Chromium page observation on mobile profile (§5, §7, §23)', async () => {
    const worker = new BrowserWorker();
    const observation = await worker.observePage(testUrl, { profile: 'mobile', timeoutMs: 15000 });

    expect(observation.schemaVersion).toBe('observation.v1');
    expect(observation.viewport.profile).toBe('mobile');
    expect(observation.viewport.width).toBe(390);
    expect(observation.viewport.height).toBe(844);
    expect(observation.viewport.deviceScaleFactor).toBe(3);
    expect(observation.viewport.touch).toBe(true);

    if (observation.browser.observationStatus === 'COMPLETE') {
      expect(observation.dom.title).toContain('Test Business');
      expect(observation.dom.headings.length).toBeGreaterThan(0);
      expect(observation.dom.headings[0].text).toContain('Emergency Plumbing');
      expect(observation.interactive.phoneLinks.length).toBeGreaterThan(0);
      expect(observation.interactive.ctaCandidates.length).toBeGreaterThan(0);

      // Verify layout bounding boxes are real numbers (not zero or hardcoded guesses)
      const primaryCta = observation.interactive.ctaCandidates.find(c => c.classification === 'PRIMARY_CTA');
      if (primaryCta) {
        expect(primaryCta.bbox.width).toBeGreaterThan(0);
        expect(primaryCta.bbox.height).toBeGreaterThan(0);
      }
    } else {
      // Browser unavailable fallback check (§5, §25)
      expect(observation.browser.observationStatus).toBe('BROWSER_UNAVAILABLE');
      expect(observation.navigation.timingSource).toBe('UNAVAILABLE');
    }
  });

  it('executes Playwright Chromium page observation on desktop profile (§7, §23)', async () => {
    const worker = new BrowserWorker();
    const observation = await worker.observePage(testUrl, { profile: 'desktop', timeoutMs: 15000 });

    expect(observation.schemaVersion).toBe('observation.v1');
    expect(observation.viewport.profile).toBe('desktop');
    expect(observation.viewport.width).toBe(1440);
    expect(observation.viewport.height).toBe(900);
    expect(observation.viewport.deviceScaleFactor).toBe(1);
    expect(observation.viewport.touch).toBe(false);

    if (observation.browser.observationStatus === 'COMPLETE') {
      expect(observation.dom.title).toContain('Test Business');
      expect(observation.visual.dimensions.width).toBe(1440);
    }
  });

  it('handles two concurrent browser observations without state cross-contamination (§39, Critical Question 15)', async () => {
    const worker = new BrowserWorker();
    const [obs1, obs2] = await Promise.all([
      worker.observePage(testUrl, { profile: 'mobile', timeoutMs: 15000 }),
      worker.observePage(testUrl, { profile: 'desktop', timeoutMs: 15000 }),
    ]);

    expect(obs1.viewport.profile).toBe('mobile');
    expect(obs2.viewport.profile).toBe('desktop');
    expect(obs1.target.requestedUrl).toBe(testUrl);
    expect(obs2.target.requestedUrl).toBe(testUrl);
  });

  it('never fabricates measurements if browser observation fails (§25, §36)', async () => {
    const worker = new BrowserWorker();
    // Non-existent invalid host trigger
    const observation = await worker.observePage('http://127.0.0.1:59999', { profile: 'mobile', timeoutMs: 3000 });

    expect(observation.browser.observationStatus).toBe('BROWSER_UNAVAILABLE');
    expect(observation.performance.lcp).toBeNull();
    expect(observation.performance.cls).toBeNull();
    expect(observation.navigation.ttfb).toBeNull();
  });
});
