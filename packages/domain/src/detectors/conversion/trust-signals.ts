import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ConvTrustSignalsDetector: DetectorDefinition = {
  code: 'CONV_NO_TRUST_NEAR_CTA',
  version: '2.0.0',
  module: 'conversion',
  severity: 'low',
  requiredEvidence: ['trustSignals'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation) {
      return {
        detectorCode: 'CONV_NO_TRUST_NEAR_CTA',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'conversion',
        severity: 'low',
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

    const trustSignals = observation.trustSignals || [];
    const signalsNearCta = trustSignals.filter(s => s.isNearCta);
    const hasTrustNearCta = signalsNearCta.length > 0;

    const measurements = {
      totalTrustSignalsDetected: trustSignals.length,
      signalsNearCtaCount: signalsNearCta.length,
      observedSignalTypes: trustSignals.map(s => s.type),
      verifiedPlatforms: trustSignals.map(s => s.platform).filter(Boolean),
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_trust_${Date.now()}`,
        type: 'TRUST_SIGNAL_AUDIT',
        source: 'DETERMINISTIC_RULE',
        grade: 'B',
        state: 'AVAILABLE',
        value: signalsNearCta.length,
        unit: 'signals',
        timestamp: new Date().toISOString(),
        confidence: 0.90,
        metadata: measurements,
      },
    ];

    let finding = null;
    const confidence = 0.90;

    if (!hasTrustNearCta) {
      finding = instantiateFinding(
        'CONV_NO_TRUST_NEAR_CTA',
        {},
        evidenceList,
        confidence,
        {
          headline: 'No verified trust badges, ratings, or guarantees were detected near your primary call-to-action.',
          title: 'No verified trust badges, ratings, or guarantees were detected near your primary call-to-action.',
          observed: measurements,
          whyItMatters: 'Visitors often experience hesitation at the point of action without visible confirmation of credibility, licensing, or satisfaction proof.',
          remediation: 'If your business has verified customer ratings, licensing credentials, or satisfaction guarantees, position them directly adjacent to the primary CTA.',
          developerBrief: 'Task: Add trust microcopy adjacent to primary CTA\nAction: If verified customer review data (e.g. Google Rating, BBB, HomeAdvisor) or warranty information exists, add a 1-line badge or rating directly below the primary button. Do not fabricate ratings.',
        }
      );
    }

    return {
      detectorCode: 'CONV_NO_TRUST_NEAR_CTA',
      detected: !hasTrustNearCta,
      status: !hasTrustNearCta ? 'DETECTED' : 'NOT_DETECTED',
      module: 'conversion',
      severity: 'low',
      confidence,
      measurementConfidence: 0.95,
      interpretationConfidence: 0.90,
      evidenceGrade: 'B',
      evidence: evidenceList,
      explanation: !hasTrustNearCta
        ? 'No verified trust signals (ratings, reviews, guarantees, licenses) were found within the hero or near the primary CTA.'
        : `${signalsNearCta.length} trust signal(s) observed near the primary CTA.`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
