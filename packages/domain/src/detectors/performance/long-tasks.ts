import { DetectorDefinition, DetectorContext, DetectorResult } from '../../detector-contract.js';
import { instantiateFinding } from '../../catalog.js';
import { EvidenceRecord } from '@convertaudit/evidence';

export const SpeedLongTasksDetector: DetectorDefinition = {
  code: 'SPEED_LONG_TASKS_JS',
  version: '2.0.0',
  module: 'speed',
  severity: 'high',
  requiredEvidence: ['performance.longTasks', 'performance.tbt'],

  evaluate(context: DetectorContext): DetectorResult {
    const { observation } = context;
    const tbt = observation?.performance?.tbt;
    const longTasks = observation?.performance?.longTasks || [];

    if (
      !observation ||
      observation.browser?.observationStatus !== 'COMPLETE' ||
      tbt === null ||
      tbt === undefined
    ) {
      return {
        detectorCode: 'SPEED_LONG_TASKS_JS',
        detected: false,
        status: 'INSUFFICIENT_EVIDENCE',
        module: 'speed',
        severity: 'high',
        confidence: 0,
        measurementConfidence: 0,
        interpretationConfidence: 0,
        evidenceGrade: 'A',
        evidence: [],
        explanation: 'Long tasks and Total Blocking Time could not be measured by the browser during the observation window.',
        measurements: {},
        detectorVersion: '2.0.0',
        finding: null,
      };
    }

    const longestTaskMs = longTasks.reduce((max: number, task: any) => Math.max(max, task.durationMs), 0);
    const isExcessive = tbt > 200 || longTasks.length >= 3;

    const countEvidence: EvidenceRecord = {
      id: `evd_lt_count_${Date.now()}`,
      type: 'LONG_TASK_COUNT',
      source: 'BROWSER',
      grade: 'A',
      state: 'AVAILABLE',
      value: longTasks.length,
      unit: 'tasks',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: { longestTaskMs, observationWindow: 'initial_load_1.5s' },
    };

    const tbtEvidence: EvidenceRecord = {
      id: `evd_tbt_${Date.now()}`,
      type: 'COMPUTED_TBT',
      source: 'DETERMINISTIC_RULE',
      grade: 'B',
      state: 'AVAILABLE',
      value: tbt,
      unit: 'ms',
      timestamp: new Date().toISOString(),
      confidence: 1.0,
      metadata: { formula: 'sum(max(0, duration - 50ms))' },
    };

    const evidenceList = [countEvidence, tbtEvidence];
    const confidence = 1.0;

    let finding = null;
    if (isExcessive) {
      finding = instantiateFinding(
        'SPEED_RENDER_BLOCKING', // Maps to render-blocking JS/long tasks finding template
        { blocking_count: longTasks.length, tbt_ms: tbt, longest_task_ms: longestTaskMs },
        evidenceList,
        confidence
      );
    }

    return {
      detectorCode: 'SPEED_LONG_TASKS_JS',
      detected: isExcessive,
      status: isExcessive ? 'DETECTED' : 'NOT_DETECTED',
      module: 'speed',
      severity: 'high',
      confidence,
      measurementConfidence: 1.0,
      interpretationConfidence: 1.0,
      evidenceGrade: 'A',
      evidence: evidenceList,
      explanation: isExcessive
        ? `Computed Total Blocking Time of ${tbt}ms across ${longTasks.length} long tasks exceeds target threshold of 200ms.`
        : `Total Blocking Time of ${tbt}ms across ${longTasks.length} long tasks meets CPU responsiveness targets (≤ 200ms).`,
      measurements: {
        taskCount: longTasks.length,
        tbtMs: tbt,
        longestTaskMs,
        observationWindow: 'initial_load_1.5s',
      },
      detectorVersion: '2.0.0',
      finding,
    };
  },
};
