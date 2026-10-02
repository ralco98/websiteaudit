import { Scores } from '@convertaudit/contracts';

export type GradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';

export interface AuditScoreResult {
  overall: number;
  grade: GradeLetter;
  speed: number;
  clarity: number;
  conversion: number;
}

export function computeGrade(score: number): GradeLetter {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * Computes overall score & letter grade per scoring-spec.md §5:
 * Overall = round(0.35·Speed + 0.35·Clarity + 0.30·Conversion)
 */
export function calculateOverallAuditScore(
  speedScore: number,
  clarityScore: number,
  conversionScore: number
): AuditScoreResult {
  const overall = Math.round(
    0.35 * speedScore + 0.35 * clarityScore + 0.30 * conversionScore
  );

  const grade = computeGrade(overall);

  return {
    overall,
    grade,
    speed: speedScore,
    clarity: clarityScore,
    conversion: conversionScore,
  };
}
