import { Page } from 'playwright';
import {
  LCPElementObservation,
  LongTaskObservation,
  ResourceTimingObservation,
} from '@convertaudit/evidence';

export interface CollectedPerformanceData {
  fcp: number | null;
  lcp: number | null;
  lcpElement: LCPElementObservation | null;
  cls: number | null;
  longTasks: LongTaskObservation[];
  tbt: number | null;
  resources: ResourceTimingObservation[];
}

export class BrowserPerformanceTracker {
  public async collect(page: Page): Promise<CollectedPerformanceData> {
    try {
      const perfData = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          let fcp: number | null = null;
          let lcp: number | null = null;
          let lcpElement: any = null;
          let clsSum = 0;
          const longTasks: Array<{ startTimeMs: number; durationMs: number; blockingTimeMs: number }> = [];

          // 1. Paint entries
          const paintEntries = performance.getEntriesByType('paint');
          for (const entry of paintEntries) {
            if (entry.name === 'first-contentful-paint') {
              fcp = Math.round(entry.startTime);
            }
          }

          // 2. Navigation timing
          const navEntries = performance.getEntriesByType('navigation');
          const nav = navEntries[0] as PerformanceNavigationTiming | undefined;

          // 3. PerformanceObserver for LCP, CLS, LongTasks
          try {
            const observer = new PerformanceObserver((entryList) => {
              for (const entry of entryList.getEntries()) {
                if (entry.entryType === 'largest-contentful-paint') {
                  lcp = Math.round(entry.startTime);
                  const lcpNode = (entry as any).element;
                  if (lcpNode && lcpNode.nodeType === 1) {
                    const rect = lcpNode.getBoundingClientRect();
                    lcpElement = {
                      valueMs: lcp,
                      selector: lcpNode.id ? `#${lcpNode.id}` : lcpNode.tagName.toLowerCase(),
                      tagName: lcpNode.tagName.toLowerCase(),
                      textSnippet: lcpNode.textContent?.trim().slice(0, 80) || undefined,
                      resourceUrl: lcpNode.src || lcpNode.currentSrc || undefined,
                      bbox: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                      },
                    };
                  }
                }
                if (entry.entryType === 'layout-shift') {
                  const shift = entry as any;
                  if (!shift.hadRecentInput) {
                    clsSum += shift.value;
                  }
                }
                if (entry.entryType === 'longtask') {
                  const duration = Math.round(entry.duration);
                  const blockingTime = Math.max(0, duration - 50);
                  longTasks.push({
                    startTimeMs: Math.round(entry.startTime),
                    durationMs: duration,
                    blockingTimeMs: blockingTime,
                  });
                }
              }
            });

            observer.observe({ type: 'largest-contentful-paint', buffered: true });
            observer.observe({ type: 'layout-shift', buffered: true });
            observer.observe({ type: 'longtask', buffered: true });
          } catch (e) {
            // Fallback if buffered observer not allowed
          }

          setTimeout(() => {
            // TBT derived from observed long tasks within initial load window (§10)
            const tbt = longTasks.reduce((sum, task) => sum + task.blockingTimeMs, 0);

            resolve({
              fcp,
              lcp,
              lcpElement,
              cls: Number(clsSum.toFixed(3)),
              longTasks,
              tbt: longTasks.length > 0 ? tbt : 0,
              resources: performance.getEntriesByType('resource').map((r: any) => ({
                name: r.name,
                initiatorType: r.initiatorType,
                startTimeMs: Math.round(r.startTime),
                durationMs: Math.round(r.duration),
                transferSize: r.transferSize || 0,
              })),
            });
          }, 400);
        });
      });

      return perfData;
    } catch {
      // In case of evaluation failure
      return {
        fcp: null,
        lcp: null,
        lcpElement: null,
        cls: null,
        longTasks: [],
        tbt: null,
        resources: [],
      };
    }
  }
}
