/**
 * ConvertAudit AI — Domain Enums matching schema.sql smallint mappings
 */

export enum AuditStatus {
  QUEUED = 0,
  VALIDATING = 1,
  CAPTURING = 2,
  ANALYZING = 3,
  SCORING = 4,
  COMPLETE = 10,
  PARTIAL = 11,
  FAILED = 12,
  CANCELED = 13,
}

export enum ModuleStatus {
  PENDING = 0,
  RUNNING = 1,
  SUCCEEDED = 2,
  FAILED = 3,
  SKIPPED = 4,
}

export enum CreditState {
  RESERVED = 0,
  COMMITTED = 1,
  REFUNDED = 2,
  NONE = 3,
}

export enum Grade {
  A = 0,
  B = 1,
  C = 2,
  D = 3,
  F = 4,
  NOT_SCORED = 9,
}

export enum Severity {
  INFO = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
  CRITICAL = 5,
}

export enum ModuleId {
  SPEED = 1,
  CLARITY = 2,
  CONVERSION = 3,
}

export type ModuleName = 'speed' | 'clarity' | 'conversion';

export enum Plan {
  FREE = 0,
  STARTER = 1,
  AGENCY = 2,
  AGENCY_PRO = 3,
  ENTERPRISE = 4,
}

export enum Role {
  OWNER = 0,
  ADMIN = 1,
  MEMBER = 2,
  VIEWER = 3,
}

export enum FindingState {
  ACTIVE = 0,
  RESOLVED = 1,
  DISMISSED = 2,
  HIDDEN = 3,
}

export type FindingCategory = 'speed' | 'clarity' | 'conversion' | 'trust' | 'ux' | 'technical';
export type FindingType = 'TECHNICAL' | 'CLARITY' | 'CONVERSION' | 'TRUST' | 'UX';
export type EvidenceType = 'dom' | 'performance' | 'visual' | 'network' | 'rule' | 'ai';
export type EvidenceSource = 'BROWSER' | 'DETERMINISTIC_RULE' | 'SYNTHETIC_FALLBACK' | 'AI_HEURISTIC';

export interface ExternalBenchmark {
  claim: string;
  source: string;
  context?: string;
  date?: string;
}

export interface FindingEvidence {
  type: 'request' | 'bbox' | 'selector' | 'metric' | 'text' | 'dom';
  hash?: string;
  bytes?: number;
  selector?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  shot?: 'viewport' | 'fullpage';
  value?: string | number | boolean;
  detail?: string;
  label?: string;
}

export interface Finding {
  code: string;
  id: number;
  module: ModuleName;
  category?: FindingCategory;
  findingType?: FindingType;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  severityNum: Severity;
  effort: 1 | 2 | 3; // 1: <15min, 2: <2h, 3: developer needed
  priority: number;
  priorityScore?: number;
  rank?: number | null; // 1..10 for top fixes
  confidence: number;
  state?: 'active' | 'resolved' | 'dismissed' | 'hidden';
  params: Record<string, any>;
  evidence: FindingEvidence[];
  evidenceType?: EvidenceType;
  source?: EvidenceSource;
  headline: string;
  title?: string;
  impact: string;
  whyItMatters?: string;
  fix: string;
  remediation?: string;
  developer_brief: string;
  developerBrief?: string;

  // Separation of Observations, Heuristics, Benchmarks, and Inferences
  observed?: Record<string, any> | string;
  heuristic?: string;
  benchmark?: ExternalBenchmark;
  inference?: string;
  assumptions?: string[];
}

export interface Scores {
  overall: number | null;
  speed: number | null;
  clarity: number | null;
  conversion: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
}

export interface SpeedMetrics {
  lcp: number; // ms
  tbt: number; // ms
  cls: number; // index
  ttfb: number; // ms
  transferBytes: number; // bytes
  requests: number; // count
  thirdPartyBlockingMs: number; // ms
}

export interface ClaritySubscores {
  headline_specificity: number; // 0-20
  value_proposition: number; // 0-20
  visual_hierarchy: number; // 0-20
  imagery_relevance: number; // 0-20
  cognitive_load: number; // 0-20
}

export interface ClarityComprehension {
  what_offered: { answer: string | null; confidence: number };
  who_for: { answer: string | null; confidence: number };
  next_step: { answer: string | null; confidence: number };
}

export interface ConversionRubricResult {
  item: string;
  pointsEarned: number;
  maxPoints: number;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface PrimaryCTAInfo {
  tag: string;
  text: string;
  prominence: number;
  isAboveFold: boolean;
  contrastRatio: number;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface ReportV1 {
  schema: 'report.v1';
  audit: {
    id: string;
    site_id?: string;
    host: string;
    normalized_url: string;
    status: string;
    created_at: string;
    finished_at?: string;
    duration_ms?: number;
    profile_version: number;
    scoring_version: number;
    revision: number;
    cached_capture: boolean;
    losing_visitors: boolean;
  };
  scores: Scores;
  speed: {
    score: number;
    metrics_lab: SpeedMetrics;
    metrics_field?: { lcp?: number; cls?: number; inp?: number } | null;
    stability: 'stable' | 'moderate' | 'noisy';
    samples: number;
    waterfall_top: Array<{
      url: string;
      bytes: number;
      duration_ms: number;
      type: string;
      isRenderBlocking?: boolean;
    }>;
  };
  clarity: {
    score: number;
    subscores: ClaritySubscores;
    comprehension: ClarityComprehension;
    pins: Array<{ id: number; x: number; y: number; label: string }>;
    needs_human_review: boolean;
    suggested_rewrites?: Array<{ original: string; rewrite: string; rationale: string }>;
  };
  conversion: {
    score: number;
    rubric: ConversionRubricResult[];
    primary_cta: PrimaryCTAInfo | null;
    contact_paths: Array<{ type: 'tel' | 'mailto' | 'form' | 'booking' | 'messaging'; target: string; isProminent: boolean }>;
    overlay_penalty: number;
  };
  findings: Finding[];
  top_fixes: Finding[];
  artifacts: {
    viewport_5s?: string;
    fullpage?: string;
  };
}

export interface CreateAuditRequest {
  url: string;
  client_id?: string;
  pages?: string[];
  force?: boolean;
  fresh?: boolean;
  webhook_url?: string;
}

export interface AuditAcceptedResponse {
  id: string;
  status: 'QUEUED';
  deduped?: boolean;
  cached_capture?: boolean;
  estimated_seconds: number;
  links: {
    self: string;
    events: string;
    report: string;
  };
}
