import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ConvNoTelLinkDetector: DetectorDefinition = {
  code: 'CONV_NO_TEL_LINK',
  version: '2.0.0',
  module: 'conversion',
  severity: 'high',
  requiredEvidence: ['phones'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation) {
      return {
        detectorCode: 'CONV_NO_TEL_LINK',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'conversion',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Page observation data was not available to evaluate phone numbers.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const phones = observation.phones || [];
    // Also check links for tel:
    const telLinks = (observation.dom?.links || []).filter(l => l.isTel);

    // If a valid clickable tel: link exists, phone is clickable
    if (telLinks.length > 0 || phones.some(p => p.isClickable)) {
      return {
        detectorCode: 'CONV_NO_TEL_LINK',
        detected: false,
        status: 'NOT_DETECTED',
        module: 'conversion',
        severity: 'high',
        confidence: 0.99,
        measurementConfidence: 1.0,
        interpretationConfidence: 0.99,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Verified clickable tap-to-call link (tel:) detected on page.',
        measurements: { clickablePhoneCount: telLinks.length + phones.filter(p => p.isClickable).length },
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    // Check if plain unlinked phone numbers were observed
    const unlinkedPhone = phones.find(p => !p.isClickable);

    if (!unlinkedPhone) {
      // No phone number detected on the page at all
      return {
        detectorCode: 'CONV_NO_TEL_LINK',
        detected: false,
        status: 'NOT_APPLICABLE',
        module: 'conversion',
        severity: 'high',
        confidence: 0.95,
        measurementConfidence: 0.95,
        interpretationConfidence: 0.95,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'No phone number was observed on this landing page.',
        measurements: { phoneCount: 0 },
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const measurements = {
      phoneNumber: unlinkedPhone.rawText,
      normalized: unlinkedPhone.normalized,
      selector: unlinkedPhone.selector,
      clickable: false,
      href: null,
      location: unlinkedPhone.location,
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_phone_${Date.now()}`,
        type: 'UNLINKED_PHONE_MEASUREMENT',
        source: 'BROWSER',
        grade: 'A',
        state: 'AVAILABLE',
        selector: unlinkedPhone.selector,
        value: unlinkedPhone.rawText,
        unit: 'string',
        timestamp: new Date().toISOString(),
        confidence: 0.99,
        metadata: measurements,
      },
    ];

    const confidence = 0.99;
    const finding = instantiateFinding(
      'CONV_NO_TEL_LINK',
      {
        phoneNumber: unlinkedPhone.rawText,
        phone_text: unlinkedPhone.rawText,
        selector: unlinkedPhone.selector,
      },
      evidenceList,
      confidence,
      {
        headline: `Phone number ${unlinkedPhone.rawText} is rendered as plain text and is not clickable.`,
        title: `Phone number ${unlinkedPhone.rawText} is rendered as plain text and is not clickable.`,
        observed: measurements,
        whyItMatters: 'Mobile visitors cannot tap to dial immediately and must manually copy-paste or memorize the number, introducing friction for phone leads.',
        remediation: `Wrap the phone number in an HTML <a href="tel:${unlinkedPhone.normalized}"> hyperlink.`,
        developerBrief: `Task: Convert plain text phone to tap-to-call link\nTarget Element: ${unlinkedPhone.selector}\nCurrent: "${unlinkedPhone.rawText}"\nAction: Replace with <a href="tel:${unlinkedPhone.normalized}" class="btn-phone">Call ${unlinkedPhone.rawText}</a>.`,
      }
    );

    return {
      detectorCode: 'CONV_NO_TEL_LINK',
      detected: true,
      status: 'DETECTED',
      module: 'conversion',
      severity: 'high',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 0.99,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: `Observed phone number "${unlinkedPhone.rawText}" at ${unlinkedPhone.selector} is plain text with no tel: href.`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
