import { ConversionRubricResult, PrimaryCTAInfo } from '@convertaudit/contracts';

export interface CTACandidateInput {
  tag: string;
  text: string;
  bboxArea: number; // in px²
  contrastVsSurroundings: number; // e.g. 4.5
  topEdgePx: number; // e.g. 240
  whitespaceRingPx: number; // whitespace around in px
  isFilledOrBordered: boolean;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface ConversionInput {
  ctaCandidates: CTACandidateInput[];
  hasTelLink: boolean;
  hasPhoneTextUnlinked: boolean;
  hasEmailOrMessaging: boolean;
  hasFormOrBooking: boolean;
  formFieldCount: number;
  hasCaptcha: boolean;
  allFieldsHaveLabels: boolean;
  hasAutocomplete: boolean;
  tapTargetsMetPercent: number; // 0 to 1
  trustSignalsNearCtaCount: number; // 0, 1, 2+
  hasStickyCta: boolean;
  overlayCoveragePercent: number; // 0 to 1 (e.g. 0.35)
}

export interface ConversionAnalysisResult {
  score: number;
  primary_cta: PrimaryCTAInfo | null;
  rubric: ConversionRubricResult[];
  overlay_penalty: number;
  contact_paths: Array<{ type: 'tel' | 'mailto' | 'form' | 'booking' | 'messaging'; target: string; isProminent: boolean }>;
}

const ACTION_VERBS = [
  'get', 'book', 'call', 'claim', 'start', 'try', 'schedule', 'request',
  'order', 'join', 'buy', 'hire', 'consult', 'download', 'register'
];

export function calculateVerbScore(text: string): number {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);
  if (words.length === 0 || !words[0]) return 0;

  const firstWord = words[0];
  const hasActionVerb = ACTION_VERBS.includes(firstWord);

  if (hasActionVerb && words.length >= 2) return 1.0; // specific action verb + object ("Get a quote")
  if (hasActionVerb) return 0.6; // verb only ("Call")
  if (['contact', 'submit', 'click here', 'learn more'].some(g => lower.includes(g))) return 0.2; // generic
  return 0.1;
}

/**
 * Calculates CTA Prominence P per scoring-spec.md §4.2:
 * P = 0.28·A + 0.24·C + 0.18·Pos + 0.15·Copy + 0.10·Iso + 0.05·Shape
 */
export function calculateCTAProminence(candidate: CTACandidateInput): number {
  const A = Math.min(1.0, candidate.bboxArea / 6000.0);
  const C = Math.min(1.0, candidate.contrastVsSurroundings / 4.5);
  
  let Pos = 0.2;
  if (candidate.topEdgePx + (candidate.bbox?.h || 40) <= 844) {
    Pos = 1.0; // fully above fold
  } else if (candidate.topEdgePx <= 844) {
    Pos = 0.6; // partially above fold
  }

  const Copy = calculateVerbScore(candidate.text);
  const Iso = Math.min(1.0, candidate.whitespaceRingPx / 24.0);
  const Shape = candidate.isFilledOrBordered ? 1.0 : 0.4;

  const P = 0.28 * A + 0.24 * C + 0.18 * Pos + 0.15 * Copy + 0.10 * Iso + 0.05 * Shape;
  return Math.round(P * 100) / 100;
}

/**
 * Evaluates the 100-point deterministic Conversion rubric per scoring-spec.md §4.1
 */
export function calculateConversionScore(input: ConversionInput): ConversionAnalysisResult {
  const rubric: ConversionRubricResult[] = [];

  // 1. Identify Primary CTA
  let primaryCtaCandidate: CTACandidateInput | null = null;
  let highestP = 0;

  for (const cand of input.ctaCandidates) {
    const P = calculateCTAProminence(cand);
    if (P > highestP) {
      highestP = P;
      primaryCtaCandidate = cand;
    }
  }

  // Item 1: Primary CTA present & prominent (30 pts)
  let ctaPoints = 0;
  if (primaryCtaCandidate && highestP >= 0.2) {
    ctaPoints = Math.round(30 * Math.min(1.0, highestP / 0.70));
    if (primaryCtaCandidate.topEdgePx > 844) {
      ctaPoints = Math.max(0, ctaPoints - 6); // below fold penalty
    }
  }
  rubric.push({
    item: 'Primary CTA Presence & Prominence',
    pointsEarned: ctaPoints,
    maxPoints: 30,
    status: ctaPoints >= 24 ? 'pass' : ctaPoints >= 15 ? 'warn' : 'fail',
    detail: primaryCtaCandidate
      ? `Highest prominence CTA "${primaryCtaCandidate.text}" scored P=${highestP}`
      : 'No visible call-to-action button found above the fold',
  });

  // Item 2: CTA copy quality (10 pts)
  let copyPoints = 0;
  if (primaryCtaCandidate) {
    const verbScore = calculateVerbScore(primaryCtaCandidate.text);
    if (verbScore >= 0.8) copyPoints = 10;
    else if (verbScore >= 0.5) copyPoints = 5;
    else copyPoints = 0;
  }
  rubric.push({
    item: 'CTA Copy Quality',
    pointsEarned: copyPoints,
    maxPoints: 10,
    status: copyPoints === 10 ? 'pass' : copyPoints === 5 ? 'warn' : 'fail',
    detail: primaryCtaCandidate ? `Copy: "${primaryCtaCandidate.text}"` : 'No CTA',
  });

  // Item 3: Contact-path availability (20 pts)
  let contactPoints = 0;
  if (input.hasTelLink) contactPoints += 8;
  if (input.hasEmailOrMessaging) contactPoints += 5;
  if (input.hasFormOrBooking) contactPoints += 7;
  contactPoints = Math.min(20, contactPoints);

  rubric.push({
    item: 'Contact Path Availability (Phone, Email, Form)',
    pointsEarned: contactPoints,
    maxPoints: 20,
    status: contactPoints >= 15 ? 'pass' : contactPoints >= 8 ? 'warn' : 'fail',
    detail: `Phone: ${input.hasTelLink ? 'Yes' : 'No'}, Email: ${input.hasEmailOrMessaging ? 'Yes' : 'No'}, Form/Booking: ${input.hasFormOrBooking ? 'Yes' : 'No'}`,
  });

  // Item 4: Form friction (15 pts)
  let formPoints = 15;
  if (input.hasFormOrBooking) {
    if (input.formFieldCount > 3) {
      formPoints -= Math.min(9, (input.formFieldCount - 3) * 1.5);
    }
    if (input.hasCaptcha) formPoints -= 3;
    if (!input.allFieldsHaveLabels) formPoints -= 2;
    if (!input.hasAutocomplete) formPoints -= 1;
    formPoints = Math.max(0, Math.round(formPoints));
  } else if (!input.hasTelLink) {
    formPoints = 0;
  }
  rubric.push({
    item: 'Form Friction & Field Efficiency',
    pointsEarned: formPoints,
    maxPoints: 15,
    status: formPoints >= 12 ? 'pass' : formPoints >= 7 ? 'warn' : 'fail',
    detail: input.hasFormOrBooking ? `${input.formFieldCount} fields, CAPTCHA: ${input.hasCaptcha}` : 'No form',
  });

  // Item 5: Mobile ergonomics (10 pts)
  const ergoPoints = Math.round(10 * Math.max(0, Math.min(1, input.tapTargetsMetPercent)));
  rubric.push({
    item: 'Mobile Tap Target Ergonomics (48x48px)',
    pointsEarned: ergoPoints,
    maxPoints: 10,
    status: ergoPoints >= 8 ? 'pass' : ergoPoints >= 5 ? 'warn' : 'fail',
    detail: `${Math.round(input.tapTargetsMetPercent * 100)}% of interactive elements meet minimum tap target guidelines`,
  });

  // Item 6: Trust signals near CTA (10 pts)
  let trustPoints = 0;
  if (input.trustSignalsNearCtaCount >= 2) trustPoints = 10;
  else if (input.trustSignalsNearCtaCount === 1) trustPoints = 5;
  rubric.push({
    item: 'Trust & Credibility Signals Near CTA',
    pointsEarned: trustPoints,
    maxPoints: 10,
    status: trustPoints === 10 ? 'pass' : trustPoints === 5 ? 'warn' : 'fail',
    detail: `${input.trustSignalsNearCtaCount} trust badges/reviews within 300px of primary CTA`,
  });

  // Item 7: Persistent access (5 pts)
  const stickyPoints = input.hasStickyCta ? 5 : 0;
  rubric.push({
    item: 'Sticky/Persistent CTA on Scroll',
    pointsEarned: stickyPoints,
    maxPoints: 5,
    status: stickyPoints === 5 ? 'pass' : 'warn',
    detail: input.hasStickyCta ? 'Sticky conversion bar active' : 'No persistent mobile CTA bar',
  });

  // Overlay penalty
  let overlayPenalty = 0;
  if (input.overlayCoveragePercent > 0.60) overlayPenalty = 15;
  else if (input.overlayCoveragePercent > 0.30) overlayPenalty = 8;

  const rawSum = ctaPoints + copyPoints + contactPoints + formPoints + ergoPoints + trustPoints + stickyPoints;
  let finalScore = Math.max(0, Math.min(100, Math.round(rawSum - overlayPenalty)));

  // Critical override: no CTA and no contact path
  const hasAnyContact = input.hasTelLink || input.hasEmailOrMessaging || input.hasFormOrBooking;
  if (!primaryCtaCandidate && !hasAnyContact) {
    finalScore = Math.min(20, finalScore);
  }

  const primary_cta: PrimaryCTAInfo | null = primaryCtaCandidate ? {
    tag: primaryCtaCandidate.tag,
    text: primaryCtaCandidate.text,
    prominence: highestP,
    isAboveFold: primaryCtaCandidate.topEdgePx <= 844,
    contrastRatio: primaryCtaCandidate.contrastVsSurroundings,
    bbox: primaryCtaCandidate.bbox,
  } : null;

  const contact_paths: Array<{ type: 'tel' | 'mailto' | 'form' | 'booking' | 'messaging'; target: string; isProminent: boolean }> = [];
  if (input.hasTelLink) contact_paths.push({ type: 'tel', target: 'tel:phone', isProminent: true });
  if (input.hasEmailOrMessaging) contact_paths.push({ type: 'mailto', target: 'mailto:info', isProminent: false });
  if (input.hasFormOrBooking) contact_paths.push({ type: 'form', target: '#form', isProminent: true });

  return {
    score: finalScore,
    primary_cta,
    rubric,
    overlay_penalty: overlayPenalty,
    contact_paths,
  };
}
