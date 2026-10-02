import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ConvFormFrictionDetector: DetectorDefinition = {
  code: 'CONV_FORM_TOO_LONG',
  version: '2.0.0',
  module: 'conversion',
  severity: 'medium',
  requiredEvidence: ['dom.forms'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation?.dom?.forms) {
      return {
        detectorCode: 'CONV_FORM_TOO_LONG',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'conversion',
        severity: 'medium',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Form data was not captured.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const forms = observation.dom.forms.filter(f => f.isVisible && f.visibleInputCount > 0);

    if (forms.length === 0) {
      return {
        detectorCode: 'CONV_FORM_TOO_LONG',
        detected: false,
        status: 'NOT_APPLICABLE',
        module: 'conversion',
        severity: 'medium',
        confidence: 1.0,
        measurementConfidence: 1.0,
        interpretationConfidence: 1.0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'No visible lead capture forms were observed on the page.',
        measurements: { formCount: 0 },
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const primaryForm = forms[0];
    const fieldCount = primaryForm.visibleInputCount;
    const isFrictional = fieldCount > 4;

    const fieldNames = primaryForm.inputs.map(i => i.name || i.placeholder || i.labelText || i.type || 'input');
    const coreFields = primaryForm.coreLeadFields || [];
    const qualFields = primaryForm.qualificationFields || [];

    const measurements = {
      formCount: forms.length,
      fieldCount,
      fieldNames,
      coreFieldsDetected: coreFields,
      qualificationFieldsDetected: qualFields,
      hasCaptcha: primaryForm.hasCaptcha,
      hasSubmitButton: primaryForm.hasSubmitButton,
      allFieldsHaveLabels: primaryForm.inputs.every(i => i.hasLabel),
    };

    const evidenceList: EvidenceRecord[] = [
      {
        id: `evd_form_${Date.now()}`,
        type: 'FORM_STRUCTURE_ANALYSIS',
        source: 'BROWSER',
        grade: 'A',
        state: 'AVAILABLE',
        selector: primaryForm.selector,
        value: fieldCount,
        unit: 'fields',
        timestamp: new Date().toISOString(),
        confidence: 0.99,
        metadata: measurements,
      },
    ];

    let finding = null;
    const confidence = 0.98;

    if (isFrictional) {
      finding = instantiateFinding(
        'CONV_FORM_TOO_LONG',
        {
          field_count: fieldCount,
          fields: fieldNames,
          required_count: primaryForm.inputs.filter(i => i.isRequired).length,
          has_captcha: primaryForm.hasCaptcha,
        },
        evidenceList,
        confidence,
        {
          headline: `${fieldCount} user-visible fields detected in lead form (${qualFields.length} qualification fields).`,
          title: `${fieldCount} user-visible fields detected in lead form (${qualFields.length} qualification fields).`,
          observed: measurements,
          whyItMatters: 'Extensive forms requesting secondary qualification upfront can introduce cognitive friction and input fatigue on mobile touchscreens.',
          remediation: 'Consider testing a shorter first-step form with essential lead fields (Name, Phone/Email), moving secondary qualification to follow-up.',
          developerBrief: `Task: Streamline lead capture form\nCurrent Form: ${primaryForm.selector} with ${fieldCount} fields [${fieldNames.join(', ')}].\nAction: Retain core contact fields in step 1. Move qualification fields (${qualFields.join(', ') || 'secondary fields'}) into step 2 or follow-up flow.`,
        }
      );
    }

    return {
      detectorCode: 'CONV_FORM_TOO_LONG',
      detected: isFrictional,
      status: isFrictional ? 'DETECTED' : 'NOT_DETECTED',
      module: 'conversion',
      severity: 'medium',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 0.96,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isFrictional
        ? `${fieldCount} visible input fields observed in primary form (including ${qualFields.length} qualification fields).`
        : `Primary form is concise with ${fieldCount} visible fields.`,
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
