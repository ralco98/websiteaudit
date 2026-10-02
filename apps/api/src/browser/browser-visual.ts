import { Page } from 'playwright';
import { VisualObservation, ViewportConfig } from '@convertaudit/evidence';

export class BrowserVisualTracker {
  public async captureViewport(page: Page, viewport: ViewportConfig): Promise<VisualObservation> {
    try {
      // Capture buffer without writing to disk if unnecessary or store as data URL / temp reference
      const buffer = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: false });
      const base64 = buffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      return {
        viewportScreenshotUrl: dataUrl,
        dimensions: { width: viewport.width, height: viewport.height },
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        dimensions: { width: viewport.width, height: viewport.height },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
