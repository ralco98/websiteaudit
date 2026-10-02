import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ClarityValuePropMissingDetector: DetectorDefinition = {
  code: 'CLARITY_NO_VALUE_PROP',
  version: '2.0.0',
  module: 'clarity',
  severity: 'high',
  requiredEvidence: ['dom.headings'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation) {
      return {
        detectorCode: 'CLARITY_NO_VALUE_PROP',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'clarity',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'B',
        evidence: [],
        explanation: 'Page observation was not available.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const subheadline = observation.clarityAudit?.subheadline;
    const hasValueProp = Boolean(subheadline && subheadline.length > 15);

    const measurements = {
      subheadlineDetected: subheadline || '(none observed)',
      hasSupportingHeroText: hasValueProp,
      heroParagraphCount: observation.clarityAudit?.subheadline ? 1 : 0,
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_vp_${Date.now()}`,
        type: 'VALUE_PROP_AUDIT',
        source: 'DETERMINISTIC_RULE',
        grade: 'B',
        state: 'AVAILABLE',
        value: hasValueProp,
        unit: 'boolean',
        timestamp: new Date().toISOString(),
        confidence: 0.88,
        metadata: measurements,
      },
    ];

    let finding = null;
    const confidence = 0.85;

    if (!hasValueProp) {
      finding = instantiateFinding(
        'CLARITY_NO_VALUE_PROP',
        {},
        evidenceList,
        confidence,
        {
          headline: 'Your hero section lacks a supporting value proposition sub-headline.',
          title: 'Your hero section lacks a supporting value proposition sub-headline.',
          observed: measurements,
          whyItMatters: 'Without an immediate supporting description or differentiator, visitors must deduce what makes your business unique, increasing exit likelihood.',
          remediation: 'Insert a 1-2 sentence supporting description directly below the main H1 stating your key advantage (e.g. speed, warranty, local experience).',
          developerBrief: 'Task: Add hero value proposition sub-headline\nAction: Insert a supporting <p> element (16-18px) directly under <h1> stating the customer benefit and key differentiator.',
        }
      );
    }

    return {
      detectorCode: 'CLARITY_NO_VALUE_PROP',
      detected: !hasValueProp,
      status: !hasValueProp ? 'DETECTED' : 'NOT_DETECTED',
      module: 'clarity',
      severity: 'high',
      confidence,
      measurementConfidence: 0.90,
      interpretationConfidence: 0.85,
      evidenceGrade: 'B',
      evidence: evidenceList,
      explanation: !hasValueProp
        ? 'No supporting paragraph text explaining customer value was observed under the hero headline.'
        : `Supporting hero description observed: "${subheadline?.slice(0, 80)}..."`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
