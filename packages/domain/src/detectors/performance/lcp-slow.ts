import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const SpeedLcpSlowDetector: DetectorDefinition = {
  code: 'SPEED_LCP_SLOW',
  version: '2.0.0',
  module: 'speed',
  severity: 'high',
  requiredEvidence: ['performance.lcp'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;
    const lcp = observation?.performance?.lcp;

    // Gate: Check if browser observation succeeded and LCP measurement is available (§7, §10, §22)
    if (
      !observation ||
      observation.browser?.observationStatus !== 'COMPLETE' ||
      lcp === null ||
      lcp === undefined
    ) {
      return {
        detectorCode: 'SPEED_LCP_SLOW',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'speed',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'LCP could not be measured by the browser PerformanceObserver during the observation window.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const lcpElement = observation.performance.lcpElement;
    const isSlow = lcp > 2500;

    const measurementEvidence: EvidenceRecord = {
      id: `evd_lcp_${Date.now()}`,
      type: 'LCP_MEASUREMENT',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      selector: lcpElement?.selector || 'body',
      value: lcp,
      unit: 'ms',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: {
        tagName: lcpElement?.tagName,
        snippet: lcpElement?.textSnippet,
        bbox: lcpElement?.bbox,
      },
    };

    const thresholdEvidence: EvidenceRecord = {
      id: `evd_lcp_thresh_${Date.now()}`,
      type: 'THRESHOLD_EVALUATION',
      source: 'DETERMINISTIC_RULE',
      grade: 'B',
      state: 'AVAILABLE',
      selector: lcpElement?.selector || 'body',
      value: isSlow,
      unit: 'boolean',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: { observed: lcp, threshold: 2500, relation: '>' },
    };

    const evidenceList = [measurementEvidence, thresholdEvidence];
    const measurementConfidence = 1.0;
    const interpretationConfidence = 1.0;
    const confidence = measurementConfidence * interpretationConfidence;

    let finding = null;
    if (isSlow) {
      finding = instantiateFinding(
        'SPEED_LCP_SLOW',
        {
          lcp_ms: lcp,
          element_selector: lcpElement?.selector || 'hero element',
        },
        evidenceList,
        confidence
      );
    }

    return {
      detectorCode: 'SPEED_LCP_SLOW',
      detected: isSlow,
      status: isSlow ? 'DETECTED' : 'NOT_DETECTED',
      module: 'speed',
      severity: 'high',
      confidence,
      measurementConfidence,
      interpretationConfidence,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isSlow
        ? `Mobile Largest Contentful Paint of ${lcp}ms exceeds target threshold of 2500ms.`
        : `Mobile Largest Contentful Paint of ${lcp}ms meets speed requirements (≤ 2500ms).`,
      measurements: { lcpMs: lcp, lcpElement },
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
