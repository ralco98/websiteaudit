import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const SpeedPageWeightDetector: DetectorDefinition = {
  code: 'SPEED_PAGE_WEIGHT',
  version: '2.0.0',
  module: 'speed',
  severity: 'high',
  requiredEvidence: ['network.totalTransferBytes'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;
    const network = observation?.network;

    if (
      !observation ||
      observation.browser?.observationStatus !== 'COMPLETE' ||
      !network ||
      (network.totalTransferBytes === 0 && network.totalRequests === 0)
    ) {
      return {
        detectorCode: 'SPEED_PAGE_WEIGHT',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'speed',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Network transfer size measurements could not be collected by the browser.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const totalBytes = network.totalTransferBytes;
    const isHeavy = totalBytes > 2_500_000; // 2.5 MB threshold

    const measurementEvidence: EvidenceRecord = {
      id: `evd_weight_${Date.now()}`,
      type: 'TOTAL_TRANSFER_BYTES',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      value: totalBytes,
      unit: 'bytes',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: {
        totalRequests: network.totalRequests,
        firstPartyBytes: network.firstPartyTransferBytes,
        thirdPartyBytes: network.thirdPartyTransferBytes,
      },
    };

    const evidenceList = [measurementEvidence];
    const confidence = 1.0;

    let finding = null;
    if (isHeavy) {
      finding = instantiateFinding(
        'SPEED_HEAVY_IMAGE', // Legacy code mapping for heavy total weight finding
        { bytes: totalBytes, total_requests: network.totalRequests },
        evidenceList,
        confidence
      );
    }

    return {
      detectorCode: 'SPEED_PAGE_WEIGHT',
      detected: isHeavy,
      status: isHeavy ? 'DETECTED' : 'NOT_DETECTED',
      module: 'speed',
      severity: 'high',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 1.0,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isHeavy
        ? `Total page transfer weight of ${(totalBytes / (1024 * 1024)).toFixed(2)} MB exceeds target threshold of 2.50 MB.`
        : `Total page transfer weight of ${(totalBytes / (1024 * 1024)).toFixed(2)} MB meets mobile budget targets (≤ 2.50 MB).`,
      measurements: {
        totalTransferBytes: totalBytes,
        totalRequests: network.totalRequests,
        firstPartyTransferBytes: network.firstPartyTransferBytes,
        thirdPartyTransferBytes: network.thirdPartyTransferBytes,
      },
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
