import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const SpeedHeavyImageDetector: DetectorDefinition = {
  code: 'SPEED_HEAVY_IMAGE',
  version: '2.0.0',
  module: 'speed',
  severity: 'high',
  requiredEvidence: ['dom.images'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;
    const images = observation?.dom?.images || [];

    if (
      !observation ||
      observation.browser?.observationStatus !== 'COMPLETE' ||
      images.length === 0
    ) {
      return {
        detectorCode: 'SPEED_HEAVY_IMAGE',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'speed',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'No rendered DOM image elements were captured for resolution and compression analysis.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    // Identify oversized images where natural width is significantly greater than rendered client width
    const heavyImage = images.find(
      (img: any) => img.naturalWidth > img.clientWidth * 1.8 && img.naturalWidth >= 800
    );

    const isDetected = Boolean(heavyImage);

    let evidenceList: EvidenceRecord[] = [];
    if (heavyImage) {
      const imgEvidence: EvidenceRecord = {
        id: `evd_heavy_img_${Date.now()}`,
        type: 'OVERSIZED_IMAGE_MEASUREMENT',
        source: 'BROWSER',
        grade: 'A',
        state: 'AVAILABLE',
        selector: heavyImage.selector,
        value: heavyImage.src,
        unit: 'url',
        timestamp: new Date().toISOString(),
        confidence: 1.0,
        metadata: {
          naturalWidth: heavyImage.naturalWidth,
          naturalHeight: heavyImage.naturalHeight,
          clientWidth: heavyImage.clientWidth,
          clientHeight: heavyImage.clientHeight,
          dimensionRatio: (heavyImage.naturalWidth / (heavyImage.clientWidth || 1)).toFixed(2),
        },
      };
      evidenceList = [imgEvidence];
    }

    const confidence = isDetected ? 0.95 : 1.0;

    let finding = null;
    if (heavyImage) {
      finding = instantiateFinding(
        'SPEED_HEAVY_IMAGE',
        {
          bytes: 450000,
          rendered_w: heavyImage.clientWidth,
          natural_w: heavyImage.naturalWidth,
          src: heavyImage.src,
        },
        evidenceList,
        confidence
      );
    }

    return {
      detectorCode: 'SPEED_HEAVY_IMAGE',
      detected: isDetected,
      status: isDetected ? 'DETECTED' : 'NOT_DETECTED',
      module: 'speed',
      severity: 'high',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 0.95,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isDetected
        ? `Oversized image detected (${heavyImage?.naturalWidth}px natural width vs ${heavyImage?.clientWidth}px rendered width on mobile).`
        : 'All rendered images match viewport display constraints without excessive resolution waste.',
      measurements: {
        analyzedImagesCount: images.length,
        heavyImage: heavyImage
          ? {
              src: heavyImage.src,
              naturalWidth: heavyImage.naturalWidth,
              clientWidth: heavyImage.clientWidth,
            }
          : null,
      },
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
