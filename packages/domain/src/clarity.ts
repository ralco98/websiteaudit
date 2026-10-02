import { ClaritySubscores, ClarityComprehension } from '@convertaudit/contracts';

export interface DeterministicHeroFeatures {
  h1_present: boolean;
  headline_words: number;
  headline_ratio: number; // headline font size / body font size
  headline_contrast: number; // e.g. 4.5:1
  headline_in_image: boolean;
  generic_phrase: boolean; // e.g. "Welcome to"
  text_block_count: number;
  interactive_count_hero: number;
  has_supporting_text: boolean;
}

export interface ClarityAnalysisResult {
  score: number;
  subscores: ClaritySubscores;
  needs_escalation: boolean;
  needs_human_review: boolean;
  confidence: number;
}

/**
 * Reconciles and bounds AI Clarity subscores with deterministic signals per scoring-spec.md §3
 */
export function reconcileClarityScores(
  rawSubscores: ClaritySubscores,
  comprehension: ClarityComprehension,
  features: DeterministicHeroFeatures,
  interPassVariance = 0
): ClarityAnalysisResult {
  let {
    headline_specificity,
    value_proposition,
    visual_hierarchy,
    imagery_relevance,
    cognitive_load,
  } = rawSubscores;

  // 1. Blind Comprehension Test penalties (§3.2)
  let overallCap = 100;
  if (!comprehension.what_offered.answer || comprehension.what_offered.confidence < 0.5) {
    headline_specificity = Math.min(headline_specificity, 6);
    overallCap = Math.min(overallCap, 55);
  }

  if (!comprehension.who_for.answer || comprehension.who_for.confidence < 0.5) {
    value_proposition = Math.min(value_proposition, 12);
  }

  // 2. Deterministic Guard Rails (§3.4)
  if (features.generic_phrase) {
    headline_specificity = Math.min(headline_specificity, 8);
  }
  if (features.headline_words <= 2) {
    headline_specificity = Math.min(headline_specificity, 10);
  }
  if (!features.has_supporting_text) {
    value_proposition = Math.min(value_proposition, 10);
  }
  if (features.headline_ratio < 1.5) {
    visual_hierarchy = Math.min(visual_hierarchy, 9);
  }
  if (features.text_block_count > 9) {
    cognitive_load = Math.min(cognitive_load, 9);
  }

  // Clamping each sub-score to [0, 20]
  const clamp20 = (v: number) => Math.max(0, Math.min(20, Math.round(v)));

  const reconciledSubscores: ClaritySubscores = {
    headline_specificity: clamp20(headline_specificity),
    value_proposition: clamp20(value_proposition),
    visual_hierarchy: clamp20(visual_hierarchy),
    imagery_relevance: clamp20(imagery_relevance),
    cognitive_load: clamp20(cognitive_load),
  };

  const rawSum =
    reconciledSubscores.headline_specificity +
    reconciledSubscores.value_proposition +
    reconciledSubscores.visual_hierarchy +
    reconciledSubscores.imagery_relevance +
    reconciledSubscores.cognitive_load;

  const score = Math.min(overallCap, rawSum);

  // Confidence & Escalation logic (§3.6)
  const minCompConf = Math.min(
    comprehension.what_offered.confidence,
    comprehension.who_for.confidence,
    comprehension.next_step.confidence
  );

  const nearestGradeBoundary = [35, 55, 75, 90].reduce((prev, curr) =>
    Math.abs(curr - score) < Math.abs(prev - score) ? curr : prev
  );
  const nearBoundary = Math.abs(score - nearestGradeBoundary) <= 3;

  const needs_escalation = minCompConf < 0.6 || nearBoundary;
  const needs_human_review = interPassVariance > 8;

  let confidence = Math.max(0.4, Math.min(1.0, minCompConf));
  if (needs_human_review) {
    confidence = Math.min(confidence, 0.5);
  }

  return {
    score,
    subscores: reconciledSubscores,
    needs_escalation,
    needs_human_review,
    confidence,
  };
}
