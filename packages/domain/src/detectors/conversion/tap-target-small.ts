import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const ConvTapTargetSmallDetector: DetectorDefinition = {
  code: 'CONV_TAP_TARGET_SMALL',
  version: '2.0.0',
  module: 'conversion',
  severity: 'medium',
  requiredEvidence: ['dom.buttons', 'dom.links'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;

    if (!observation?.dom) {
      return {
        detectorCode: 'CONV_TAP_TARGET_SMALL',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'conversion',
        severity: 'medium',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'DOM element measurements were not captured.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const interactive = [
      ...(observation.dom.buttons || []).map(b => ({ selector: b.selector, text: b.text, bbox: b.bbox })),
      ...(observation.dom.links || [])
        .filter(l => l.visibility?.visible && l.bbox.width > 0 && l.bbox.height > 0)
        .map(l => ({ selector: l.selector, text: l.text, bbox: l.bbox })),
    ];

    const smallTargets = interactive.filter(
      el => el.bbox.width > 0 && el.bbox.height > 0 && (el.bbox.width < 44 || el.bbox.height < 44)
    );

    const isDetected = smallTargets.length > 0;
    const worst = smallTargets[0];

    const measurements = {
      smallTargetCount: smallTargets.length,
      totalInteractiveEvaluated: interactive.length,
      sampleSelector: worst ? worst.selector : null,
      sampleWidth: worst ? worst.bbox.width : null,
      sampleHeight: worst ? worst.bbox.height : null,
      targetGuideline: '44x44px minimum (WCAG 2.5.5)',
    };

    const evidenceList: EvidenceRecord[] = smallTargets.slice(0, 3).map((target, idx) => ({
      id: `evd_tap_${Date.now()}_${idx}`,
      type: 'TAP_TARGET_DIMENSION_MEASUREMENT',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      selector: target.selector,
      value: `${target.bbox.width}x${target.bbox.height}`,
      unit: 'px',
      timestamp: new Date().toISOString(),
      confidence: 0.99,
      metadata: { width: target.bbox.width, height: target.bbox.height, text: target.text },
    }));

    let finding = null;
    const confidence = 0.98;

    if (isDetected && worst) {
      finding = instantiateFinding(
        'CONV_TAP_TARGET_SMALL',
        {
          width: worst.bbox.width,
          height: worst.bbox.height,
          selector: worst.selector,
        },
        evidenceList,
        confidence,
        {
          headline: `Interactive elements measured at ${worst.bbox.width}x${worst.bbox.height}px, below the 44x44px mobile guideline.`,
          title: `Interactive elements measured at ${worst.bbox.width}x${worst.bbox.height}px, below the 44x44px mobile guideline.`,
          observed: measurements,
          whyItMatters: 'Small tap targets cause accidental clicks or missed taps on touchscreen devices, creating frustration and drop-off.',
          remediation: 'Increase button padding or touch area to at least 48x48 CSS pixels on mobile viewports.',
          developerBrief: `Task: Increase tap target size\nTarget: Minimum 44x44px (recommended 48x48px).\nCurrent Element: ${worst.selector} (${worst.bbox.width}x${worst.bbox.height}px).\nAction: Add min-height: 48px; min-width: 48px; padding: 12px 20px; to mobile stylesheet.`,
        }
      );
    }

    return {
      detectorCode: 'CONV_TAP_TARGET_SMALL',
      detected: isDetected,
      status: isDetected ? 'DETECTED' : 'NOT_DETECTED',
      module: 'conversion',
      severity: 'medium',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 0.98,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isDetected
        ? `${smallTargets.length} interactive elements were measured below 44x44px (e.g. ${worst?.selector} at ${worst?.bbox.width}x${worst?.bbox.height}px).`
        : 'All measured interactive elements satisfy the 44x44px mobile touch target guideline.',
      measurements,
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
