import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ConvNoPrimaryCtaDetector: DetectorDefinition = {
  code: 'CONV_NO_PRIMARY_CTA',
  version: '2.0.0',
  module: 'conversion',
  severity: 'critical',
  requiredEvidence: ['interactive.ctaCandidates'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation || !observation.interactive?.ctaCandidates) {
      return {
        detectorCode: 'CONV_NO_PRIMARY_CTA',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'conversion',
        severity: 'critical',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'CTA candidates could not be evaluated.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const candidates = observation.interactive.ctaCandidates;
    const hasPrimaryOrAction = candidates.some(
      c =>
        c.classification === 'PRIMARY_CTA' ||
        c.classification === 'BOOKING_CTA' ||
        c.classification === 'PHONE_CTA' ||
        c.classification === 'CONTACT_CTA' ||
        c.classification === 'FORM_SUBMIT'
    );

    const isMissing = candidates.length === 0 || !hasPrimaryOrAction;

    const measurements = {
      totalCtaCandidates: candidates.length,
      primaryActionFound: hasPrimaryOrAction,
      buttonCount: observation.dom?.buttons?.length || 0,
      linkCount: observation.dom?.links?.length || 0,
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_no_cta_${Date.now()}`,
        type: 'PRIMARY_CTA_AUDIT',
        source: 'BROWSER',
        grade: 'A',
        state: 'AVAILABLE',
        value: !hasPrimaryOrAction,
        unit: 'boolean',
        timestamp: new Date().toISOString(),
        confidence: 0.96,
        metadata: measurements,
      },
    ];

    let finding = null;
    const confidence = 0.96;

    if (isMissing) {
      finding = instantiateFinding(
        'CONV_NO_PRIMARY_CTA',
        {},
        evidenceList,
        confidence,
        {
          headline: 'No primary call-to-action button was detected on the landing page.',
          title: 'No primary call-to-action button was detected on the landing page.',
          observed: measurements,
          whyItMatters: 'Without an immediate and visible call-to-action, visitors face uncertainty about how to proceed and are more likely to leave without converting.',
          remediation: 'Add a prominent primary action button ("Get a Free Quote", "Book Online", or "Call Now") in the hero section.',
          developerBrief: 'Task: Implement primary CTA button\nLocation: Above the fold (< 844px mobile height).\nAction: Create a prominent <button> or <a> with ≥ 48px height, high-contrast background, and actionable verb-led copy.',
        }
      );
    }

    return {
      detectorCode: 'CONV_NO_PRIMARY_CTA',
      detected: isMissing,
      status: isMissing ? 'DETECTED' : 'NOT_DETECTED',
      module: 'conversion',
      severity: 'critical',
      confidence,
      measurementConfidence: 0.98,
      interpretationConfidence: 0.95,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isMissing
        ? 'No visible call-to-action button or conversion link was identified on the page.'
        : `Primary call-to-action identified among ${candidates.length} interactive elements.`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
