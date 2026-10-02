import { Finding, ModuleName, Severity } from '@convertaudit/contracts';
import { FINDING_CATALOG } from './catalog.js';

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  [Severity.CRITICAL]: 8.0,
  [Severity.HIGH]: 5.0,
  [Severity.MEDIUM]: 3.0,
  [Severity.LOW]: 1.0,
  [Severity.INFO]: 0.0,
};

const EFFORT_COSTS: Record<1 | 2 | 3, number> = {
  1: 1.0, // < 15 min (Easy)
  2: 1.6, // < 2 h (Medium)
  3: 2.6, // developer needed (Complex)
};

const MODULE_ORDER_TIE_BREAKER: Record<ModuleName, number> = {
  conversion: 3, // conversion highest priority because it directly drives revenue
  clarity: 2,
  speed: 1,
};

export interface PriorityBreakdown {
  severityWeight: number;
  impactWeight: number;
  conversionRelevance: number;
  confidence: number;
  effortCost: number;
  rawPriority: number;
  normalizedScore: number;
  explanation: string;
}

/**
 * Computes priority score for a finding per scoring-spec.md §5.1 & prompt Phase 6:
 * priority = (severity × businessImpact × conversionRelevance × confidence) / effort
 */
export function calculateFindingPriority(finding: Finding): number {
  const sevWeight = SEVERITY_WEIGHTS[finding.severityNum] ?? 1.0;
  const effortCost = EFFORT_COSTS[finding.effort] ?? 1.0;
  const def = FINDING_CATALOG[finding.code];
  const impact = def ? def.impactWeight : 1.0;
  const convRel = def ? (def.conversionRelevance ?? 1.0) : 1.0;
  const conf = Math.max(0.1, Math.min(1.0, finding.confidence !== undefined ? finding.confidence : 1.0));

  const priority = (sevWeight * impact * convRel * conf) / effortCost;
  return Math.round(priority * 100) / 100;
}

/**
 * Computes an explainable priority breakdown for a finding
 */
export function explainFindingPriority(finding: Finding): PriorityBreakdown {
  const sevWeight = SEVERITY_WEIGHTS[finding.severityNum] ?? 1.0;
  const effortCost = EFFORT_COSTS[finding.effort] ?? 1.0;
  const def = FINDING_CATALOG[finding.code];
  const impact = def ? def.impactWeight : 1.0;
  const convRel = def ? (def.conversionRelevance ?? 1.0) : 1.0;
  const conf = Math.max(0.1, Math.min(1.0, finding.confidence !== undefined ? finding.confidence : 1.0));

  const rawPriority = (sevWeight * impact * convRel * conf) / effortCost;
  const normalizedScore = Math.round(rawPriority * 100) / 100;

  const effortDesc = finding.effort === 1 ? 'minimal effort' : finding.effort === 2 ? 'moderate effort' : 'developer effort';
  const explanation = `${finding.severity.toUpperCase()} priority: directly impacts ${finding.module} conversion (relevance ${convRel}x), supported by ${Math.round(conf * 100)}% evidence confidence, requiring ${effortDesc}.`;

  return {
    severityWeight: sevWeight,
    impactWeight: impact,
    conversionRelevance: convRel,
    confidence: conf,
    effortCost,
    rawPriority,
    normalizedScore,
    explanation,
  };
}

/**
 * Sorts findings by priority descending, breaks ties, and ranks the Top 10 fixes
 */
export function rankFindings(findings: Finding[]): {
  rankedFindings: Finding[];
  topFixes: Finding[];
} {
  const withPriority = findings.map(f => {
    const priority = calculateFindingPriority(f);
    return {
      ...f,
      priority,
      priorityScore: priority,
    };
  });

  withPriority.sort((a, b) => {
    // 1. Priority descending
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // 2. Module tie-breaker (conversion > clarity > speed)
    const modA = MODULE_ORDER_TIE_BREAKER[a.module] ?? 0;
    const modB = MODULE_ORDER_TIE_BREAKER[b.module] ?? 0;
    if (modB !== modA) {
      return modB - modA;
    }
    // 3. Finding code alphabetical
    return a.code.localeCompare(b.code);
  });

  // Assign ranks 1..10 to top fixes
  const topFixes: Finding[] = [];
  withPriority.forEach((f, index) => {
    if (index < 10) {
      f.rank = index + 1;
      topFixes.push(f);
    } else {
      f.rank = null;
    }
  });

  return {
    rankedFindings: withPriority,
    topFixes,
  };
}
