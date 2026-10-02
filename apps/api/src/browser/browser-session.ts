import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ViewportConfig, ViewportProfile } from '@convertaudit/evidence';
import { normalizeTarget, isBlockedIP } from '@convertaudit/ssrf';

export interface SessionOptions {
  profile: ViewportProfile;
  timeoutMs?: number;
}

export const VIEWPORT_MOBILE: ViewportConfig = {
  profile: 'mobile',
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
  touch: true,
};

export const VIEWPORT_DESKTOP: ViewportConfig = {
  profile: 'desktop',
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  touch: false,
};

let globalBrowserPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (!globalBrowserPromise) {
    globalBrowserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    }).catch(err => {
      globalBrowserPromise = null;
      throw err;
    });
  }
  const browser = await globalBrowserPromise;
  if (!browser.isConnected()) {
    globalBrowserPromise = null;
    return getSharedBrowser();
  }
  return browser;
}

export class BrowserSession {
  public browser: Browser | null = null;
  public context: BrowserContext | null = null;
  public page: Page | null = null;
  public viewport: ViewportConfig;

  constructor(options: SessionOptions) {
    this.viewport = options.profile === 'mobile' ? VIEWPORT_MOBILE : VIEWPORT_DESKTOP;
  }

  public async initialize(targetUrl: string, timeoutMs = 20000): Promise<Page> {
    // 1. SSRF Pre-flight validation
    normalizeTarget(targetUrl);

    // 2. Get or launch Shared Chromium Process (§39)
    this.browser = await getSharedBrowser();

    // 3. Create Isolated Browser Context with device profile
    this.context = await this.browser.newContext({
      viewport: { width: this.viewport.width, height: this.viewport.height },
      deviceScaleFactor: this.viewport.deviceScaleFactor,
      isMobile: this.viewport.mobile,
      hasTouch: this.viewport.touch,
      userAgent: this.viewport.mobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1 ConvertAudit/1.0'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ConvertAudit/1.0',
      ignoreHTTPSErrors: true,
      permissions: [], // Default-deny all browser permissions (§8, §29)
    });

    // 4. Attach SSRF Network Route Interceptor (§29)
    await this.context.route('**/*', async (route, request) => {
      try {
        const reqUrl = request.url();
        const urlObj = new URL(reqUrl);
        const host = urlObj.hostname;

        if (isBlockedIP(host)) {
          return route.abort('blockedbyclient');
        }
        return route.continue();
      } catch {
        return route.abort('failed');
      }
    });

    // 5. Create Page & set timeouts
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(timeoutMs);
    this.page.setDefaultNavigationTimeout(timeoutMs);

    return this.page;
  }

  public async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    // Shared browser process remains active for controlled concurrency (§39)
    this.browser = null;
  }
}
