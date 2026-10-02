import {
  PageObservation,
  EvidenceRecord,
  EvidenceGrade,
  EvidenceState,
} from './types.js';
import { calculateConfidence } from './confidence.js';

export function createEvidenceRecord(params: {
  id: string;
  type: string;
  source: 'BROWSER' | 'DETERMINISTIC_RULE' | 'SYNTHETIC_FALLBACK';
  grade: EvidenceGrade;
  state: EvidenceState;
  selector?: string;
  selectorStability?: 'HIGH' | 'MEDIUM' | 'LOW';
  value: string | number | boolean | null;
  unit?: string;
  screenshotRef?: string;
  metadata?: Record<string, any>;
}): EvidenceRecord {
  const confidence = calculateConfidence({
    grade: params.grade,
    state: params.state,
    selectorStability: params.selectorStability || (params.selector ? 'HIGH' : 'MEDIUM'),
    hasContext: true,
  });

  return {
    id: params.id,
    type: params.type,
    source: params.source,
    grade: params.grade,
    state: params.state,
    selector: params.selector,
    value: params.value,
    unit: params.unit,
    screenshotRef: params.screenshotRef,
    timestamp: new Date().toISOString(),
    confidence,
    metadata: params.metadata || {},
  };
}

/**
 * Validates third-party vs first-party domain origin (§12)
 */
export function classifyRequestOrigin(
  requestUrl: string,
  targetHost: string
): { party: 'FIRST_PARTY' | 'THIRD_PARTY'; reason: string } {
  try {
    const reqObj = new URL(requestUrl);
    const reqHost = reqObj.hostname.toLowerCase();
    const cleanTargetHost = targetHost.toLowerCase().replace(/^www\./, '');
    const cleanReqHost = reqHost.replace(/^www\./, '');

    if (cleanReqHost === cleanTargetHost || cleanReqHost.endsWith(`.${cleanTargetHost}`)) {
      return { party: 'FIRST_PARTY', reason: `Origin matches target host ${targetHost}` };
    }
    return { party: 'THIRD_PARTY', reason: `Third party domain ${reqHost} differs from target host ${targetHost}` };
  } catch {
    return { party: 'THIRD_PARTY', reason: 'Invalid request URL format' };
  }
}
