/**
 * ConvertAudit AI — Evidence & PageObservation Normalized Contracts (§23, §24, §25)
 */

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D';

export type EvidenceState =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'LEGACY'
  | 'SYNTHETIC';

export type BrowserObservationStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'FAILED'
  | 'BROWSER_UNAVAILABLE';

export type ViewportProfile = 'mobile' | 'desktop';

export interface ViewportConfig {
  profile: ViewportProfile;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  touch: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementVisibility {
  inViewport: boolean;
  visible: boolean;
  partiallyVisible: boolean;
  fullyVisible: boolean;
  display: string;
  visibility: string;
  opacity: number;
  zIndex: number | null;
  isFixedOrSticky: boolean;
}

export interface SelectorMetadata {
  selector: string;
  stability: 'HIGH' | 'MEDIUM' | 'LOW'; // HIGH: id/data-attr, MEDIUM: aria/semantic, LOW: path
  fallbackSelector?: string;
}

export interface DOMHeading {
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
  selector: string;
  bbox: BoundingBox;
  fontSizePx: number;
  fontWeight: string;
  contrastRatio?: number;
}

export interface DOMLink {
  text: string;
  href: string;
  rawHref: string;
  isTel: boolean;
  isMailto: boolean;
  selector: string;
  bbox: BoundingBox;
  visibility: ElementVisibility;
}

export interface DOMButton {
  tag: string;
  text: string;
  role?: string;
  ariaLabel?: string;
  selector: string;
  bbox: BoundingBox;
  visibility: ElementVisibility;
  fontSizePx: number;
  fontWeight: string;
  color: string;
  backgroundColor: string;
}

export interface DOMInput {
  tag: 'input' | 'select' | 'textarea';
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  hasLabel: boolean;
  labelText?: string;
  autocomplete?: string;
  isRequired: boolean;
  isVisible: boolean;
  selector: string;
}

export interface DOMForm {
  selector: string;
  action?: string;
  method?: string;
  isHttps: boolean;
  isVisible: boolean;
  inputCount: number;
  visibleInputCount: number;
  inputs: DOMInput[];
  hasSubmitButton: boolean;
  hasCaptcha: boolean;
  isIframe: boolean;
  formType: 'FIRST_PARTY_FORM' | 'THIRD_PARTY_FORM' | 'IFRAME_FORM' | 'UNKNOWN_FORM';
  bbox: BoundingBox;
  coreLeadFields?: string[];
  qualificationFields?: string[];
}

export interface PhoneObservation {
  rawText: string;
  normalized: string;
  isClickable: boolean;
  href: string | null;
  location: 'header' | 'hero' | 'body' | 'footer' | 'sticky';
  selector: string;
  bbox: BoundingBox;
}

export interface TrustSignalObservation {
  type:
    | 'review_rating'
    | 'review_count'
    | 'testimonial'
    | 'guarantee'
    | 'licensed_insured'
    | 'accreditation'
    | 'security_badge'
    | 'award'
    | 'client_logo';
  text: string;
  platform?: 'google' | 'yelp' | 'trustpilot' | 'bbb' | 'angie' | 'houzz' | 'other';
  ratingValue?: number;
  reviewCount?: number;
  isNearCta: boolean;
  distanceToPrimaryCtaPx?: number;
  selector: string;
  bbox: BoundingBox;
}

export interface ClarityObservation {
  h1: DOMHeading | null;
  subheadline: string | null;
  serviceKeywordsDetected: string[];
  locationKeywordsDetected: string[];
  urgencyKeywordsDetected: string[];
  benefitKeywordsDetected: string[];
  whatOffered: string | null;
  whoFor: string | null;
  nextStepAction: string | null;
  clarityHeuristicMet: boolean;
}

export interface ViewportMeasurement {
  viewportWidth: number;
  viewportHeight: number;
  heroHeight: number;
  h1Top: number | null;
  primaryCtaTop: number | null;
  primaryCtaAboveFold: boolean;
  pixelsBelowFold: number;
  hasHorizontalOverflow: boolean;
  fixedStickyCta: boolean;
  smallTapTargetCount: number;
}

export interface DOMImage {
  src: string;
  alt?: string;
  loading?: string;
  fetchpriority?: string;
  naturalWidth: number;
  naturalHeight: number;
  clientWidth: number;
  clientHeight: number;
  selector: string;
  bbox: BoundingBox;
}

export interface DOMVideo {
  src?: string;
  autoplay: boolean;
  muted: boolean;
  isIframe: boolean;
  selector: string;
}

export interface DOMIframe {
  src: string;
  title?: string;
  selector: string;
  bbox: BoundingBox;
}

export interface CTACandidateObservation {
  tag: string;
  text: string;
  href?: string;
  selector: string;
  bbox: BoundingBox;
  visibility: ElementVisibility;
  fontSizePx: number;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  classification:
    | 'PRIMARY_CTA'
    | 'SECONDARY_CTA'
    | 'PHONE_CTA'
    | 'EMAIL_CTA'
    | 'CONTACT_CTA'
    | 'BOOKING_CTA'
    | 'FORM_SUBMIT'
    | 'NAVIGATION'
    | 'TRUST_SIGNAL';
  classificationReason: string;
  classificationConfidence: number;
}

export interface NetworkRequestObservation {
  url: string;
  finalUrl?: string;
  method: string;
  status: number | null;
  resourceType: string;
  mimeType: string;
  durationMs: number | null;
  transferBytes: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
  contentLength: number | null;
  party: 'FIRST_PARTY' | 'THIRD_PARTY';
  partyReason: string;
  cacheControl?: string;
  contentEncoding?: string;
  protocol?: string;
  failureReason?: string;
}

export interface LCPElementObservation {
  valueMs: number;
  selector: string;
  tagName: string;
  textSnippet?: string;
  resourceUrl?: string;
  bbox: BoundingBox | null;
}

export interface LongTaskObservation {
  startTimeMs: number;
  durationMs: number;
  blockingTimeMs: number; // duration - 50
  attributionUrl?: string;
}

export interface ResourceTimingObservation {
  name: string;
  initiatorType: string;
  startTimeMs: number;
  durationMs: number;
  transferSize: number;
}

export interface ConsoleLog {
  type: 'error' | 'warning' | 'exception';
  message: string;
  source?: string;
  timestamp: string;
}

export interface VisualObservation {
  viewportScreenshotPath?: string;
  viewportScreenshotUrl?: string;
  dimensions: { width: number; height: number };
  timestamp: string;
}

export interface PageObservation {
  schemaVersion: 'observation.v1';
  target: {
    requestedUrl: string;
    finalUrl: string;
    host: string;
    timestamp: string;
  };
  viewport: ViewportConfig;
  navigation: {
    status: number | null;
    redirects: number;
    navigationStart: number;
    responseStart: number;
    domContentLoaded: number;
    load: number;
    ttfb: number | null;
    timingSource: 'BROWSER' | 'UNAVAILABLE';
  };
  dom: {
    title: string;
    metaDescription: string;
    headings: DOMHeading[];
    links: DOMLink[];
    buttons: DOMButton[];
    forms: DOMForm[];
    inputs: DOMInput[];
    images: DOMImage[];
    videos: DOMVideo[];
    iframes: DOMIframe[];
  };
  interactive: {
    ctaCandidates: CTACandidateObservation[];
    phoneLinks: DOMLink[];
    emailLinks: DOMLink[];
    contactLinks: DOMLink[];
    submitControls: DOMButton[];
  };
  network: {
    requests: NetworkRequestObservation[];
    totalRequests: number;
    totalTransferBytes: number;
    firstPartyTransferBytes: number;
    thirdPartyTransferBytes: number;
  };
  performance: {
    fcp: number | null;
    lcp: number | null;
    lcpElement: LCPElementObservation | null;
    cls: number | null;
    longTasks: LongTaskObservation[];
    tbt: number | null;
    resources: ResourceTimingObservation[];
  };
  console: {
    errors: ConsoleLog[];
    warnings: ConsoleLog[];
    pageErrors: ConsoleLog[];
  };
  visual: VisualObservation;
  phones?: PhoneObservation[];
  trustSignals?: TrustSignalObservation[];
  clarityAudit?: ClarityObservation;
  viewportMeasurements?: Record<string, ViewportMeasurement>;
  browser: {
    engine: 'chromium';
    version: string;
    observationStatus: BrowserObservationStatus;
  };
}

export interface EvidenceRecord {
  id: string;
  type: string;
  source: 'BROWSER' | 'DETERMINISTIC_RULE' | 'SYNTHETIC_FALLBACK';
  grade: EvidenceGrade;
  state: EvidenceState;
  selector?: string;
  value: string | number | boolean | null;
  unit?: string;
  screenshotRef?: string;
  timestamp: string;
  confidence: number;
  metadata: Record<string, any>;
}
