import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ConvCtaBelowFoldDetector: DetectorDefinition = {
  code: 'CONV_CTA_BELOW_FOLD',
  version: '2.0.0',
  module: 'conversion',
  severity: 'high',
  requiredEvidence: ['interactive.ctaCandidates'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation || !observation.interactive?.ctaCandidates) {
      return {
        detectorCode: 'CONV_CTA_BELOW_FOLD',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'conversion',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'CTA candidates could not be evaluated because interactive elements were not captured.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const viewportHeight = observation.viewport?.height || 844;
    const viewportWidth = observation.viewport?.width || 390;

    // Find primary or highest-prominence CTA candidate
    const primaryCandidate =
      observation.interactive.ctaCandidates.find(c => c.classification === 'PRIMARY_CTA') ||
      observation.interactive.ctaCandidates.find(c => c.classification === 'BOOKING_CTA' || c.classification === 'CONTACT_CTA') ||
      observation.interactive.ctaCandidates[0];

    if (!primaryCandidate) {
      return {
        detectorCode: 'CONV_CTA_BELOW_FOLD',
        detected: false,
        status: 'NOT_APPLICABLE',
        module: 'conversion',
        severity: 'high',
        confidence: 1.0,
        measurementConfidence: 1.0,
        interpretationConfidence: 1.0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'No call-to-action button or link was identified on the page.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const elementTop = primaryCandidate.bbox.y;
    const elementBottom = elementTop + primaryCandidate.bbox.height;
    const isBelowFold = elementTop > viewportHeight;
    const pixelsBelowFold = Math.max(0, elementTop - viewportHeight);

    const measurements = {
      viewportWidth,
      viewportHeight,
      elementSelector: primaryCandidate.selector,
      elementTop,
      elementBottom,
      aboveFold: !isBelowFold,
      pixelsBelowFold,
      text: primaryCandidate.text,
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_cta_pos_${Date.now()}`,
        type: 'CTA_POSITION_MEASUREMENT',
        source: 'BROWSER',
        grade: 'A',
        state: 'AVAILABLE',
        selector: primaryCandidate.selector,
        value: elementTop,
        unit: 'px',
        timestamp: new Date().toISOString(),
        confidence: 0.99,
        metadata: measurements,
      },
    ];

    let finding = null;
    const confidence = 0.98;

    if (isBelowFold) {
      finding = instantiateFinding(
        'CONV_CTA_BELOW_FOLD',
        {
          topEdgePx: elementTop,
          elementTop,
          viewportHeight,
          viewportWidth,
          elementSelector: primaryCandidate.selector,
        },
        evidenceList,
        confidence,
        {
          headline: `CTA begins ${pixelsBelowFold}px below the first mobile viewport.`,
          title: `CTA begins ${pixelsBelowFold}px below the first mobile viewport.`,
          observed: measurements,
          whyItMatters: 'Mobile visitors must scroll past the initial viewport before seeing the primary action button, increasing initial drop-off.',
          remediation: 'Move the primary CTA higher in the hero section so its top edge is ≤ 844px.',
          developerBrief: `Task: Move primary CTA above the fold\nTarget: Top edge of CTA must be ≤ ${viewportHeight}px (currently ${elementTop}px, ${pixelsBelowFold}px below fold).\nTarget Element: ${primaryCandidate.selector} ("${primaryCandidate.text}")\nAction: Reduce hero top/bottom padding or relocate CTA directly beneath hero heading.`,
        }
      );
    }

    return {
      detectorCode: 'CONV_CTA_BELOW_FOLD',
      detected: isBelowFold,
      status: isBelowFold ? 'DETECTED' : 'NOT_DETECTED',
      module: 'conversion',
      severity: 'high',
      confidence,
      measurementConfidence: 0.99,
      interpretationConfidence: 0.98,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isBelowFold
        ? `Primary CTA "${primaryCandidate.text}" begins at ${elementTop}px (${pixelsBelowFold}px below the ${viewportHeight}px mobile fold).`
        : `Primary CTA "${primaryCandidate.text}" is positioned above the fold at ${elementTop}px (viewport height: ${viewportHeight}px).`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
