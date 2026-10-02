import { SpeedMetrics } from '@convertaudit/contracts';
import { scoreLogNormal } from './math.js';

export interface SpeedAnalysisResult {
  score: number; // 0-100
  subscores: {
    lcp: number;
    tbt: number;
    cls: number;
    ttfb: number;
    weight: number;
    reqs: number;
  };
  losing_visitors: boolean;
  stability: 'stable' | 'moderate' | 'noisy';
  confidence: number;
}

export const SPEED_WEIGHTS = {
  lcp: 0.35,
  tbt: 0.20,
  cls: 0.15,
  ttfb: 0.10,
  weight: 0.10,
  reqs: 0.10,
};

export const SPEED_THRESHOLDS = {
  lcp: { p10: 2500, median: 4000 },
  tbt: { p10: 200, median: 600 },
  cls: { p10: 0.10, median: 0.25 },
  ttfb: { p10: 800, median: 1800 },
  weight: { p10: 1_000_000, median: 3_000_000 },
  reqs: { p10: 150, median: 600 },
};

/**
 * Calculates Speed score per scoring-spec.md §2
 */
export function calculateSpeedScore(
  metrics: SpeedMetrics,
  sampleSpread = 0.08
): SpeedAnalysisResult {
  const requestPressure = metrics.thirdPartyBlockingMs + 2 * metrics.requests;

  const sub = {
    lcp: scoreLogNormal(metrics.lcp, SPEED_THRESHOLDS.lcp),
    tbt: scoreLogNormal(metrics.tbt, SPEED_THRESHOLDS.tbt),
    cls: scoreLogNormal(metrics.cls, SPEED_THRESHOLDS.cls),
    ttfb: scoreLogNormal(metrics.ttfb, SPEED_THRESHOLDS.ttfb),
    weight: scoreLogNormal(metrics.transferBytes, SPEED_THRESHOLDS.weight),
    reqs: scoreLogNormal(requestPressure, SPEED_THRESHOLDS.reqs),
  };

  const weightedSum =
    SPEED_WEIGHTS.lcp * sub.lcp +
    SPEED_WEIGHTS.tbt * sub.tbt +
    SPEED_WEIGHTS.cls * sub.cls +
    SPEED_WEIGHTS.ttfb * sub.ttfb +
    SPEED_WEIGHTS.weight * sub.weight +
    SPEED_WEIGHTS.reqs * sub.reqs;

  const score = Math.round(100 * weightedSum);

  // 3-Second Rule Product Flag: LCP median > 3.0s
  const losing_visitors = metrics.lcp > 3000;

  let stability: 'stable' | 'moderate' | 'noisy' = 'stable';
  let confidence = 1.0;

  if (sampleSpread > 0.35) {
    stability = 'noisy';
    confidence = 0.6;
  } else if (sampleSpread > 0.15) {
    stability = 'moderate';
    confidence = 0.85;
  }

  return {
    score,
    subscores: {
      lcp: Math.round(sub.lcp * 100),
      tbt: Math.round(sub.tbt * 100),
      cls: Math.round(sub.cls * 100),
      ttfb: Math.round(sub.ttfb * 100),
      weight: Math.round(sub.weight * 100),
      reqs: Math.round(sub.reqs * 100),
    },
    losing_visitors,
    stability,
    confidence,
  };
}
