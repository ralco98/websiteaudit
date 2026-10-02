import { Page, Request, Response } from 'playwright';
import { NetworkRequestObservation, classifyRequestOrigin } from '@convertaudit/evidence';

export class BrowserNetworkTracker {
  private requests: NetworkRequestObservation[] = [];
  private targetHost = '';

  public attach(page: Page, targetHost: string): void {
    this.targetHost = targetHost;
    this.requests = [];

    page.on('requestfinished', async (request: Request) => {
      try {
        const response = await request.response();
        const url = request.url();
        const headers = response ? response.headers() : {};
        const { party, reason } = classifyRequestOrigin(url, this.targetHost);

        const sizes = await request.sizes().catch(() => null);

        const obs: NetworkRequestObservation = {
          url,
          finalUrl: response?.url(),
          method: request.method(),
          status: response?.status() ?? null,
          resourceType: request.resourceType(),
          mimeType: headers['content-type'] || 'unknown',
          durationMs: null, // calculated post-timing if available
          transferBytes: sizes ? (sizes.responseHeadersSize + sizes.responseBodySize) : (headers['content-length'] ? parseInt(headers['content-length'], 10) : null),
          encodedBodySize: sizes?.responseBodySize ?? null,
          decodedBodySize: sizes?.responseBodySize ?? null,
          contentLength: headers['content-length'] ? parseInt(headers['content-length'], 10) : null,
          party,
          partyReason: reason,
          cacheControl: headers['cache-control'],
          contentEncoding: headers['content-encoding'],
        };

        this.requests.push(obs);
      } catch (e) {
        // ignore detached request errors
      }
    });

    page.on('requestfailed', (request: Request) => {
      const { party, reason } = classifyRequestOrigin(request.url(), this.targetHost);
      this.requests.push({
        url: request.url(),
        method: request.method(),
        status: null,
        resourceType: request.resourceType(),
        mimeType: 'unknown',
        durationMs: null,
        transferBytes: null,
        encodedBodySize: null,
        decodedBodySize: null,
        contentLength: null,
        party,
        partyReason: reason,
        failureReason: request.failure()?.errorText || 'Failed',
      });
    });
  }

  public getSummary() {
    let totalTransferBytes = 0;
    let firstPartyTransferBytes = 0;
    let thirdPartyTransferBytes = 0;

    for (const req of this.requests) {
      const bytes = req.transferBytes || 0;
      totalTransferBytes += bytes;
      if (req.party === 'FIRST_PARTY') {
        firstPartyTransferBytes += bytes;
      } else {
        thirdPartyTransferBytes += bytes;
      }
    }

    return {
      requests: this.requests,
      totalRequests: this.requests.length,
      totalTransferBytes,
      firstPartyTransferBytes,
      thirdPartyTransferBytes,
    };
  }
}
