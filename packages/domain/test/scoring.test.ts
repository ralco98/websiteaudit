import { describe, it, expect } from 'vitest';
import {
  scoreLogNormal,
  calculateSpeedScore,
  reconcileClarityScores,
  calculateCTAProminence,
  calculateConversionScore,
  calculateOverallAuditScore,
  computeGrade,
  rankFindings,
  instantiateFinding,
} from '../src/index.js';

describe('Domain Scoring Engine', () => {
  describe('Mathematical Log-Normal Curve', () => {
    it('matches worked example from scoring-spec.md §2.1 (LCP = 5800ms -> score ~16)', () => {
      // Worked example: LCP=5800 with p10=2500, median=4000
      const score = scoreLogNormal(5800, { p10: 2500, median: 4000 });
      const roundedScore = Math.round(score * 100);
      expect(roundedScore).toBe(16);
    });

    it('returns ~90 for p10 (good) and ~50 for median (poor)', () => {
      const good = scoreLogNormal(2500, { p10: 2500, median: 4000 });
      expect(Math.round(good * 100)).toBe(90);

      const median = scoreLogNormal(4000, { p10: 2500, median: 4000 });
      expect(Math.round(median * 100)).toBe(50);
    });
  });

  describe('Speed Score', () => {
    it('calculates Speed score and sets 3-second losing_visitors flag', () => {
      const metrics = {
        lcp: 4500,
        tbt: 350,
        cls: 0.15,
        ttfb: 900,
        transferBytes: 2_500_000,
        requests: 45,
        thirdPartyBlockingMs: 120,
      };

      const result = calculateSpeedScore(metrics);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
      expect(result.losing_visitors).toBe(true); // 4500ms > 3000ms
      expect(result.stability).toBe('stable');
    });
  });

  describe('Clarity Score & Guardrails', () => {
    it('penalizes vague headlines and caps score if what_offered is unanswerable', () => {
      const rawSub = {
        headline_specificity: 18,
        value_proposition: 18,
        visual_hierarchy: 16,
        imagery_relevance: 15,
        cognitive_load: 16,
      };

      const comprehension = {
        what_offered: { answer: null, confidence: 0.2 },
        who_for: { answer: 'Small businesses', confidence: 0.8 },
        next_step: { answer: 'Book call', confidence: 0.9 },
      };

      const features = {
        h1_present: true,
        headline_words: 10,
        headline_ratio: 2.0,
        headline_contrast: 5.5,
        headline_in_image: false,
        generic_phrase: true, // "Welcome to our site"
        text_block_count: 4,
        interactive_count_hero: 2,
        has_supporting_text: true,
      };

      const result = reconcileClarityScores(rawSub, comprehension, features);
      // what_offered unanswerable caps headline_specificity <= 6 and overall <= 55
      expect(result.subscores.headline_specificity).toBeLessThanOrEqual(6);
      expect(result.score).toBeLessThanOrEqual(55);
    });
  });

  describe('Conversion Score & CTA Prominence', () => {
    it('calculates CTA Prominence P accurately', () => {
      const candidate = {
        tag: 'a',
        text: 'Get a Free Quote',
        bboxArea: 7500,
        contrastVsSurroundings: 5.0,
        topEdgePx: 450,
        whitespaceRingPx: 30,
        isFilledOrBordered: true,
        bbox: { x: 50, y: 450, w: 200, h: 50 },
      };

      const P = calculateCTAProminence(candidate);
      expect(P).toBeGreaterThan(0.70); // should be highly prominent
    });

    it('evaluates full conversion rubric and enforces critical override if no contact path', () => {
      const emptyInput = {
        ctaCandidates: [],
        hasTelLink: false,
        hasPhoneTextUnlinked: false,
        hasEmailOrMessaging: false,
        hasFormOrBooking: false,
        formFieldCount: 0,
        hasCaptcha: false,
        allFieldsHaveLabels: true,
        hasAutocomplete: true,
        tapTargetsMetPercent: 0,
        trustSignalsNearCtaCount: 0,
        hasStickyCta: false,
        overlayCoveragePercent: 0,
      };

      const result = calculateConversionScore(emptyInput);
      expect(result.score).toBeLessThanOrEqual(20);
    });
  });

  describe('Overall Scoring & Ranking', () => {
    it('computes weighted score: round(0.35*Speed + 0.35*Clarity + 0.30*Conversion)', () => {
      // Speed 61, Clarity 47, Conversion 66
      // Overall = round(0.35*61 + 0.35*47 + 0.30*66) = round(21.35 + 16.45 + 19.80) = round(57.6) = 58
      const res = calculateOverallAuditScore(61, 47, 66);
      expect(res.overall).toBe(58);
      expect(res.grade).toBe('C');
      expect(computeGrade(92)).toBe('A');
      expect(computeGrade(78)).toBe('B');
      expect(computeGrade(42)).toBe('D');
      expect(computeGrade(25)).toBe('F');
    });

    it('orders Top 10 fixes by priority formula', () => {
      const f1 = instantiateFinding('SPEED_HEAVY_IMAGE', { bytes: 4_200_000 });
      const f2 = instantiateFinding('CONV_NO_TEL_LINK', {});
      const f3 = instantiateFinding('CONV_NO_PRIMARY_CTA', {});
      const f4 = instantiateFinding('CLARITY_HEADLINE_VAGUE', {});

      const findings = [f1!, f2!, f3!, f4!];
      const { topFixes } = rankFindings(findings);

      expect(topFixes.length).toBe(4);
      // Critical conversion finding (CONV_NO_PRIMARY_CTA) should rank #1
      expect(topFixes[0].code).toBe('CONV_NO_PRIMARY_CTA');
      expect(topFixes[0].rank).toBe(1);
    });
  });
});
