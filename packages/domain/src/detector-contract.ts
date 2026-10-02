import { PageObservation, ViewportProfile, EvidenceGrade, EvidenceRecord } from '@convertaudit/evidence';
import { Finding, ModuleName } from '@convertaudit/contracts';

/**
 * Detector Execution Context (§3)
 */
export interface DetectorContext {
  observation: PageObservation;
  profile: ViewportProfile;
  pageIntent?: string;
  detectorVersion?: string;
}

/**
 * Detector Status Distinction (§4)
 */
export type DetectorStatus =
  | 'DETECTED'
  | 'NOT_DETECTED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_APPLICABLE'
  | 'ERROR';

/**
 * Normalized Detector Execution Result (§4, §5)
 */
export interface DetectorResult {
  detectorCode: string;
  detected: boolean;
  status: DetectorStatus;
  module: ModuleName;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // measurementConfidence * interpretationConfidence (§6)
  measurementConfidence: number; // Grade A certainty
  interpretationConfidence: number; // Grade B rule certainty
  evidenceGrade: EvidenceGrade;
  evidence: EvidenceRecord[];
  explanation: string;
  measurements: Record<string, any>;
  detectorVersion: string;
  finding?: Finding | null;
}

/**
 * Detector Definition Contract (§7, §20)
 */
export interface DetectorDefinition {
  code: string;
  version: string;
  module: ModuleName;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  requiredEvidence: string[]; // e.g. ['performance.lcp']
  evaluate(context: DetectorContext): DetectorResult;
}
