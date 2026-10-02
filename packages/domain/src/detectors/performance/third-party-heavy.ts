import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const SpeedThirdPartyHeavyDetector: DetectorDefinition = {
  code: 'SPEED_THIRD_PARTY_HEAVY',
  version: '2.0.0',
  module: 'speed',
  severity: 'medium',
  requiredEvidence: ['network.requests'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;
    const network = observation?.network;

    if (
      !observation ||
      observation.browser?.observationStatus !== 'COMPLETE' ||
      !network ||
      !network.requests
    ) {
      return {
        detectorCode: 'SPEED_THIRD_PARTY_HEAVY',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'speed',
        severity: 'medium',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Network requests could not be classified by origin during browser observation.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const thirdPartyRequests = network.requests.filter((r: any) => r.party === 'THIRD_PARTY');
    const thirdPartyBytes = network.thirdPartyTransferBytes;
    const thirdPartyCount = thirdPartyRequests.length;

    // Detect if third-party script weight exceeds 800 KB or 15 requests
    const isHeavy = thirdPartyBytes > 800_000 || thirdPartyCount >= 15;

    const measurementEvidence: EvidenceRecord = {
      id: `evd_3p_${Date.now()}`,
      type: 'THIRD_PARTY_NETWORK_WEIGHT',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      value: thirdPartyBytes,
      unit: 'bytes',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: {
        requestCount: thirdPartyCount,
        sampleThirdPartyUrls: thirdPartyRequests.slice(0, 5).map((r: any) => r.url),
      },
    };

    const evidenceList = [measurementEvidence];
    const confidence = 1.0;

    let finding = null;
    if (isHeavy) {
      finding = instantiateFinding(
        'SPEED_RENDER_BLOCKING', // Maps to speed render blocking / third party template
        { blocking_count: thirdPartyCount, third_party_bytes: thirdPartyBytes },
        evidenceList,
        confidence
      );
    }

    return {
      detectorCode: 'SPEED_THIRD_PARTY_HEAVY',
      detected: isHeavy,
      status: isHeavy ? 'DETECTED' : 'NOT_DETECTED',
      module: 'speed',
      severity: 'medium',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 1.0,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isHeavy
        ? `Third-party resources account for ${(thirdPartyBytes / 1024).toFixed(0)} KB across ${thirdPartyCount} requests.`
        : `Third-party resource overhead (${(thirdPartyBytes / 1024).toFixed(0)} KB) is within recommended limits (≤ 800 KB).`,
      measurements: {
        thirdPartyBytes,
        thirdPartyRequestCount: thirdPartyCount,
      },
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
