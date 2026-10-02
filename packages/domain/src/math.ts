/**
 * High-precision standard normal cumulative distribution function Φ(z)
 * Approximation using Abramowitz and Stegun formula 7.1.26 (error < 1.5e-7)
 */
export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.3989422804014327; // 1 / sqrt(2 * pi)

  const absZ = Math.abs(z);
  const t = 1.0 / (1.0 + p * absZ);
  const pdf = c * Math.exp(-0.5 * absZ * absZ);
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const cdf = 1.0 - pdf * poly;

  return z >= 0 ? cdf : 1.0 - cdf;
}

/**
 * Log-normal metric to sub-score mapping per scoring-spec.md §2.1
 * σ = ln(median / p10) / 1.2816
 * score(x) = 1 − Φ( ln(x / median) / σ ), clamped to [0, 1]
 */
export function scoreLogNormal(x: number, { p10, median }: { p10: number; median: number }): number {
  if (x <= 0) return 1;
  const sigma = Math.log(median / p10) / 1.2816;
  const z = Math.log(x / median) / sigma;
  const score = 1.0 - normalCdf(z);
  return Math.max(0, Math.min(1, score));
}
