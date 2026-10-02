import { EvidenceGrade, EvidenceState } from './types.js';

export interface ConfidenceInput {
  grade: EvidenceGrade;
  state: EvidenceState;
  sampleCount?: number;
  selectorStability?: 'HIGH' | 'MEDIUM' | 'LOW';
  hasContext?: boolean;
}

/**
 * Deterministic Confidence Utility (§26)
 * Confidence C = measurementCertainty * detectorCertainty * contextCompleteness
 */
export function calculateConfidence(input: ConfidenceInput): number {
  // Gate check: If evidence is unavailable or synthetic fallback, confidence is zero or capped
  if (input.state === 'UNAVAILABLE' || input.state === 'INSUFFICIENT_EVIDENCE') {
    return 0.0;
  }
  if (input.state === 'SYNTHETIC' || input.state === 'LEGACY') {
    return 0.40; // capped for legacy
  }

  // 1. Measurement Certainty (Grade A = 1.0, Grade B = 0.85, Grade C = 0.60, Grade D = 0.20)
  let measurementCertainty = 0.20;
  if (input.grade === 'A') measurementCertainty = 1.0;
  else if (input.grade === 'B') measurementCertainty = 0.85;
  else if (input.grade === 'C') measurementCertainty = 0.60;

  // 2. Detector Certainty (Selector stability & sample count)
  let detectorCertainty = 0.90;
  if (input.selectorStability === 'HIGH') detectorCertainty = 1.0;
  else if (input.selectorStability === 'MEDIUM') detectorCertainty = 0.90;
  else if (input.selectorStability === 'LOW') detectorCertainty = 0.75;

  if (input.sampleCount && input.sampleCount > 1) {
    detectorCertainty = Math.min(1.0, detectorCertainty + 0.05);
  }

  // 3. Context Completeness
  const contextCompleteness = input.hasContext !== false ? 1.0 : 0.80;

  const confidence = measurementCertainty * detectorCertainty * contextCompleteness;
  return Math.round(confidence * 100) / 100;
}
