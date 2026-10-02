import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const SpeedClsHighDetector: DetectorDefinition = {
  code: 'SPEED_CLS_HIGH',
  version: '2.0.0',
  module: 'speed',
  severity: 'medium',
  requiredEvidence: ['performance.cls'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;
    const cls = observation?.performance?.cls;

    if (
      !observation ||
      observation.browser?.observationStatus !== 'COMPLETE' ||
      cls === null ||
      cls === undefined
    ) {
      return {
        detectorCode: 'SPEED_CLS_HIGH',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'speed',
        severity: 'medium',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Cumulative Layout Shift could not be measured by the browser during the observation window.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const isHigh = cls > 0.10;

    const measurementEvidence: EvidenceRecord = {
      id: `evd_cls_${Date.now()}`,
      type: 'CLS_MEASUREMENT',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      value: cls,
      unit: 'score',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: { observationWindow: 'initial_load_1.5s' },
    };

    const thresholdEvidence: EvidenceRecord = {
      id: `evd_cls_thresh_${Date.now()}`,
      type: 'THRESHOLD_EVALUATION',
      source: 'DETERMINISTIC_RULE',
      grade: 'B',
      state: 'AVAILABLE',
      value: isHigh,
      unit: 'boolean',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: { observed: cls, threshold: 0.10, relation: '>' },
    };

    const evidenceList = [measurementEvidence, thresholdEvidence];
    const confidence = 1.0;

    let finding = null;
    if (isHigh) {
      finding = instantiateFinding('SPEED_CLS_HIGH', { cls }, evidenceList, confidence);
    }

    return {
      detectorCode: 'SPEED_CLS_HIGH',
      detected: isHigh,
      status: isHigh ? 'DETECTED' : 'NOT_DETECTED',
      module: 'speed',
      severity: 'medium',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 1.0,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isHigh
        ? `Observed initial Cumulative Layout Shift of ${cls} exceeds acceptable threshold of 0.10.`
        : `Observed initial Cumulative Layout Shift of ${cls} meets stability requirements (≤ 0.10).`,
      measurements: { cls, observationWindow: 'initial_load_1.5s' },
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
