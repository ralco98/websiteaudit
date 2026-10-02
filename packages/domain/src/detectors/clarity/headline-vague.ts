import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ClarityHeadlineVagueDetector: DetectorDefinition = {
  code: 'CLARITY_HEADLINE_VAGUE',
  version: '2.0.0',
  module: 'clarity',
  severity: 'high',
  requiredEvidence: ['dom.headings'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation?.dom) {
      return {
        detectorCode: 'CLARITY_HEADLINE_VAGUE',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'clarity',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'B',
        evidence: [],
        explanation: 'DOM headings were not captured.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const h1 = observation.dom.headings?.find(h => h.tag === 'h1');
    const h1Text = h1?.text || '';

    const GENERIC_PATTERNS = [
      /^welcome\b/i,
      /^home\b/i,
      /^about\s*us\b/i,
      /leading\s*the\s*future/i,
      /your\s*success/i,
      /we\s*make\s*it\s*happen/i,
      /innovative\s*solutions/i,
      /trusted\s*partner/i,
    ];

    const isGeneric = GENERIC_PATTERNS.some(p => p.test(h1Text));
    const isVeryShort = h1Text.split(/\s+/).filter(Boolean).length <= 2;
    const isMissingH1 = !h1 || h1Text.length === 0;

    const clarityAudit = observation.clarityAudit;
    const serviceFound = (clarityAudit?.serviceKeywordsDetected?.length || 0) > 0;
    const locationFound = (clarityAudit?.locationKeywordsDetected?.length || 0) > 0;

    const isVague = isMissingH1 || isGeneric || (isVeryShort && !serviceFound);

    const measurements = {
      h1Observed: h1Text || '(none detected)',
      h1Selector: h1?.selector || 'h1',
      genericPhraseDetected: isGeneric,
      wordCount: h1Text.split(/\s+/).filter(Boolean).length,
      serviceKeywordsFound: serviceFound,
      locationFound,
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_h1_${Date.now()}`,
        type: 'HEADLINE_CONTENT_ANALYSIS',
        source: 'DETERMINISTIC_RULE',
        grade: 'B',
        state: 'AVAILABLE',
        selector: h1?.selector || 'h1',
        value: h1Text || 'MISSING_H1',
        unit: 'string',
        timestamp: new Date().toISOString(),
        confidence: 0.90,
        metadata: measurements,
      },
    ];

    let finding = null;
    const confidence = isMissingH1 ? 0.98 : isGeneric ? 0.92 : 0.82;

    if (isVague) {
      finding = instantiateFinding(
        'CLARITY_HEADLINE_VAGUE',
        {
          current_headline: h1Text || 'Missing H1 Heading',
          service_found: serviceFound,
          location_found: locationFound,
        },
        evidenceList,
        confidence,
        {
          headline: isMissingH1
            ? 'No H1 main headline was detected in the hero section.'
            : `The headline "${h1Text}" does not explicitly communicate the core service or offering.`,
          title: isMissingH1
            ? 'No H1 main headline was detected in the hero section.'
            : `The headline "${h1Text}" does not explicitly communicate the core service or offering.`,
          observed: measurements,
          whyItMatters: 'Visitors evaluate relevance within the first few seconds; generic or missing headlines leave prospective customers uncertain whether they are in the right place.',
          remediation: 'Replace generic phrasing with a clear statement of your specific offering, target location, and primary benefit.',
          developerBrief: `Task: Rewrite hero H1 headline\nCurrent: "${h1Text || 'None'}"\nSuggested Pattern: [Core Service] in [Location] — [Primary Customer Benefit].\nAction: Update the <h1> tag text content in hero.`,
        }
      );
    }

    return {
      detectorCode: 'CLARITY_HEADLINE_VAGUE',
      detected: isVague,
      status: isVague ? 'DETECTED' : 'NOT_DETECTED',
      module: 'clarity',
      severity: 'high',
      confidence,
      measurementConfidence: 0.95,
      interpretationConfidence: 0.85,
      evidenceGrade: 'B',
      evidence: evidenceList,
      explanation: isVague
        ? `Observed H1 headline "${h1Text || '(missing)'}" does not explicitly communicate the business service.`
        : `Observed H1 headline "${h1Text}" clearly communicates offering keywords.`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
