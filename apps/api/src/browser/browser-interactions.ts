import {
  CTACandidateObservation,
  DOMLink,
  DOMButton,
} from '@convertaudit/evidence';

const PRIMARY_ACTION_PATTERNS = [
  /\b(?:call|call now|dial now)\b/i,
  /\b(?:get quote|request quote|free quote|instant quote|get a quote)\b/i,
  /\b(?:book now|book appointment|schedule|schedule online|book a call)\b/i,
  /\b(?:contact|contact us|get in touch|reach out)\b/i,
  /\b(?:get started|start now|start free trial|try free|sign up)\b/i,
  /\b(?:request service|emergency service|order service|need service)\b/i,
  /\b(?:buy now|order now|checkout|purchase)\b/i,
  /\b(?:submit|send message|request callback|claim offer|join now)\b/i,
];

const ACTION_VERBS = [
  'get', 'book', 'call', 'claim', 'start', 'try', 'schedule', 'request',
  'order', 'join', 'buy', 'hire', 'consult', 'download', 'register', 'apply', 'reserve'
];

/**
 * Robust Deterministic CTA Classifier (§16, Prompt Phase 8)
 */
export function classifyCTACandidate(
  node: DOMButton | DOMLink
): CTACandidateObservation['classification'] {
  const text = node.text.toLowerCase().trim();
  const href = 'href' in node ? (node.href || '').toLowerCase() : '';

  // 1. Phone CTA (Must detect tel: or explicit phone phrasing)
  if (href.startsWith('tel:') || /call\s*now|tap\s*to\s*call|\bcall\b|\(\d{3}\)/i.test(text)) {
    return 'PHONE_CTA';
  }

  // 2. Email CTA
  if (href.startsWith('mailto:') || /\b(?:email us|send email|mail us)\b/i.test(text)) {
    return 'EMAIL_CTA';
  }

  // 3. Booking CTA (Destination or text verified)
  if (
    /book|appointment|schedule|calendar|reserve|consultation/i.test(text) ||
    href.includes('booking') ||
    href.includes('calendly') ||
    href.includes('acuity') ||
    href.includes('/book') ||
    href.includes('/schedule')
  ) {
    return 'BOOKING_CTA';
  }

  // 4. Contact & Quote CTA
  if (
    /quote|estimate|pricing|inquire|contact|reach out/i.test(text) ||
    href.includes('contact') ||
    href.includes('quote') ||
    href.includes('estimate')
  ) {
    return 'CONTACT_CTA';
  }

  // 5. Form Submit Control
  if (
    ('tag' in node && node.tag === 'input' && (node as any).type === 'submit') ||
    /^(?:submit|send|send message|request callback)$/i.test(text)
  ) {
    return 'FORM_SUBMIT';
  }

  // 6. Explicit Primary CTA Match via Phrase Patterns
  for (const pattern of PRIMARY_ACTION_PATTERNS) {
    if (pattern.test(text)) {
      return 'PRIMARY_CTA';
    }
  }

  // 7. Verb-led Lead Match
  const firstWord = text.split(/\s+/)[0];
  if (ACTION_VERBS.includes(firstWord)) {
    return 'PRIMARY_CTA';
  }

  // 8. Secondary CTA (Informational)
  if (['learn more', 'read more', 'about us', 'our story', 'see details', 'view features', 'explore'].some(v => text.includes(v))) {
    return 'SECONDARY_CTA';
  }

  // 9. Semantic Button/CTA Class Fallback
  const selector = (node.selector || '').toLowerCase();
  if (selector.includes('btn-primary') || selector.includes('cta-primary') || selector.includes('hero-btn')) {
    return 'PRIMARY_CTA';
  }

  return 'NAVIGATION';
}

/**
 * Evaluates Interaction Safety (§19)
 * Returns false for payment, appointment booking commit, form submit, or destructive actions.
 */
export function isSafeToClick(element: { text: string; href?: string; tag: string }): boolean {
  const lowerText = element.text.toLowerCase();
  const lowerHref = (element.href || '').toLowerCase();

  const unsafeKeywords = [
    'pay', 'buy now', 'checkout', 'purchase', 'confirm order',
    'delete', 'remove', 'cancel', 'submit', 'place order',
    'subscribe', 'sign up now', 'login', 'sign in'
  ];

  for (const kw of unsafeKeywords) {
    if (lowerText.includes(kw) || lowerHref.includes(kw)) {
      return false;
    }
  }

  return true;
}
