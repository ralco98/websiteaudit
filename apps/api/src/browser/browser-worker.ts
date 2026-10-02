import {
  PageObservation,
  ViewportProfile,
  ConsoleLog,
} from '@convertaudit/evidence';
import { BrowserSession } from './browser-session.js';
import { BrowserNetworkTracker } from './browser-network.js';
import { BrowserPerformanceTracker } from './browser-performance.js';
import { BrowserDOMExtractor } from './browser-dom.js';
import { BrowserVisualTracker } from './browser-visual.js';
import { classifyCTACandidate } from './browser-interactions.js';

export interface ScanWorkerOptions {
  profile: ViewportProfile;
  timeoutMs?: number;
}

export class BrowserWorker {
  public async observePage(targetUrl: string, options: ScanWorkerOptions): Promise<PageObservation> {
    const session = new BrowserSession({ profile: options.profile });
    const networkTracker = new BrowserNetworkTracker();
    const perfTracker = new BrowserPerformanceTracker();
    const domExtractor = new BrowserDOMExtractor();
    const visualTracker = new BrowserVisualTracker();

    const consoleLogs: { errors: ConsoleLog[]; warnings: ConsoleLog[]; pageErrors: ConsoleLog[] } = {
      errors: [],
      warnings: [],
      pageErrors: [],
    };

    const targetHost = new URL(targetUrl).hostname;
    const t0 = performance.now();

    try {
      // 1. Initialize Browser Session
      const page = await session.initialize(targetUrl, options.timeoutMs || 20000);

      // 2. Attach Network & Console Trackers
      networkTracker.attach(page, targetHost);

      page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text().slice(0, 300);
        if (type === 'error') {
          consoleLogs.errors.push({ type: 'error', message: text, timestamp: new Date().toISOString() });
        } else if (type === 'warning') {
          consoleLogs.warnings.push({ type: 'warning', message: text, timestamp: new Date().toISOString() });
        }
      });

      page.on('pageerror', (err) => {
        consoleLogs.pageErrors.push({
          type: 'exception',
          message: err.message.slice(0, 300),
          source: err.stack?.slice(0, 200),
          timestamp: new Date().toISOString(),
        });
      });

      // 3. Navigation
      const navResponse = await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeoutMs || 20000,
      });

      const responseStart = Math.round(performance.now() - t0);
      const httpStatus = navResponse ? navResponse.status() : null;

      // Wait 1.5s for DOM stabilization (SPA hydration / dynamic insertions)
      await page.waitForTimeout(1500);

      // 4. Collect DOM, Performance, Visual
      const domData = await domExtractor.extract(page);
      const perfData = await perfTracker.collect(page);
      const visualData = await visualTracker.captureViewport(page, session.viewport);
      const networkData = networkTracker.getSummary();

      // 5. Build CTACandidates & Interactive Elements
      const ctaCandidates = [
        ...domData.buttons.map(btn => ({
          tag: btn.tag,
          text: btn.text,
          selector: btn.selector,
          bbox: btn.bbox,
          visibility: btn.visibility,
          fontSizePx: btn.fontSizePx,
          fontWeight: btn.fontWeight,
          color: btn.color,
          backgroundColor: btn.backgroundColor,
          classification: classifyCTACandidate(btn),
          classificationReason: `Button text '${btn.text}'`,
          classificationConfidence: 0.90,
        })),
        ...domData.links.filter(l => l.text.length > 2 || l.isTel).map(link => ({
          tag: 'a',
          text: link.text || (link.isTel ? 'Call Phone' : 'Link'),
          href: link.href,
          selector: link.selector,
          bbox: link.bbox,
          visibility: link.visibility,
          fontSizePx: 14,
          fontWeight: 'normal',
          color: '',
          backgroundColor: '',
          classification: classifyCTACandidate(link),
          classificationReason: link.isTel ? 'tel: link' : `Link text '${link.text}'`,
          classificationConfidence: link.isTel ? 0.95 : 0.80,
        })),
      ];

      const phoneLinks = domData.links.filter(l => l.isTel);
      const emailLinks = domData.links.filter(l => l.isMailto);
      const contactLinks = domData.links.filter(l => /contact|quote|inquire/.test(l.href.toLowerCase()));
      const submitControls = domData.buttons.filter(b => b.tag === 'button' || b.tag === 'input');

      let redirectCount = 0;
      let reqChain = navResponse?.request().redirectedFrom();
      while (reqChain) {
        redirectCount++;
        reqChain = reqChain.redirectedFrom();
      }

      // 6. Build final normalized PageObservation Contract (§23)
      const observation: PageObservation = {
        schemaVersion: 'observation.v1',
        target: {
          requestedUrl: targetUrl,
          finalUrl: page.url(),
          host: targetHost,
          timestamp: new Date().toISOString(),
        },
        viewport: session.viewport,
        navigation: {
          status: httpStatus,
          redirects: redirectCount,
          navigationStart: 0,
          responseStart,
          domContentLoaded: Math.round(performance.now() - t0),
          load: Math.round(performance.now() - t0),
          ttfb: responseStart,
          timingSource: 'BROWSER',
        },
        dom: domData,
        interactive: {
          ctaCandidates,
          phoneLinks,
          emailLinks,
          contactLinks,
          submitControls,
        },
        network: networkData,
        performance: {
          fcp: perfData.fcp,
          lcp: perfData.lcp,
          lcpElement: perfData.lcpElement,
          cls: perfData.cls,
          longTasks: perfData.longTasks,
          tbt: perfData.tbt,
          resources: perfData.resources,
        },
        console: consoleLogs,
        visual: visualData,
        phones: domData.phones,
        trustSignals: domData.trustSignals,
        clarityAudit: domData.clarityAudit,
        viewportMeasurements: domData.viewportMeasurements,
        browser: {
          engine: 'chromium',
          version: '122.0.0.0',
          observationStatus: 'COMPLETE',
        },
      };

      return observation;
    } catch (err: any) {
      // If browser fails or is unavailable, return explicit failure status without fake metrics
      return {
        schemaVersion: 'observation.v1',
        target: {
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          host: targetHost,
          timestamp: new Date().toISOString(),
        },
        viewport: session.viewport,
        navigation: {
          status: null,
          redirects: 0,
          navigationStart: 0,
          responseStart: 0,
          domContentLoaded: 0,
          load: 0,
          ttfb: null,
          timingSource: 'UNAVAILABLE',
        },
        dom: {
          title: targetHost,
          metaDescription: '',
          headings: [],
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
          totalRequests: 0,
          totalTransferBytes: 0,
          firstPartyTransferBytes: 0,
          thirdPartyTransferBytes: 0,
        },
        performance: {
          fcp: null,
          lcp: null,
          lcpElement: null,
          cls: null,
          longTasks: [],
          tbt: null,
          resources: [],
        },
        console: consoleLogs,
        visual: {
          dimensions: { width: session.viewport.width, height: session.viewport.height },
          timestamp: new Date().toISOString(),
        },
        browser: {
          engine: 'chromium',
          version: '122.0.0.0',
          observationStatus: 'BROWSER_UNAVAILABLE',
        },
      };
    } finally {
      await session.close();
    }
  }
}
