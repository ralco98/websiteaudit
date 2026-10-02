export * from './math.js';
export * from './speed.js';
export * from './clarity.js';
export * from './conversion.js';
export * from './catalog.js';
export * from './priority.js';
export * from './scorer.js';
export * from './detector-contract.js';
export * from './detector-registry.js';

import { defaultDetectorRegistry } from './detector-registry.js';
import { SpeedLcpSlowDetector } from './detectors/performance/lcp-slow.js';
import { SpeedClsHighDetector } from './detectors/performance/cls-high.js';
import { SpeedLongTasksDetector } from './detectors/performance/long-tasks.js';
import { SpeedPageWeightDetector } from './detectors/performance/page-weight.js';
import { SpeedHeavyImageDetector } from './detectors/performance/heavy-image.js';
import { SpeedThirdPartyHeavyDetector } from './detectors/performance/third-party-heavy.js';

import { ConvCtaBelowFoldDetector } from './detectors/conversion/cta-below-fold.js';
import { ConvNoPrimaryCtaDetector } from './detectors/conversion/no-primary-cta.js';
import { ConvNoTelLinkDetector } from './detectors/conversion/no-tel-link.js';
import { ConvTapTargetSmallDetector } from './detectors/conversion/tap-target-small.js';
import { ConvFormFrictionDetector } from './detectors/conversion/form-friction.js';
import { ConvTrustSignalsDetector } from './detectors/conversion/trust-signals.js';

import { ClarityHeadlineVagueDetector } from './detectors/clarity/headline-vague.js';
import { ClarityValuePropMissingDetector } from './detectors/clarity/value-prop-missing.js';

// Register Performance Detectors
defaultDetectorRegistry.register(SpeedLcpSlowDetector);
defaultDetectorRegistry.register(SpeedClsHighDetector);
defaultDetectorRegistry.register(SpeedLongTasksDetector);
defaultDetectorRegistry.register(SpeedPageWeightDetector);
defaultDetectorRegistry.register(SpeedHeavyImageDetector);
defaultDetectorRegistry.register(SpeedThirdPartyHeavyDetector);

// Register Conversion Detectors
defaultDetectorRegistry.register(ConvCtaBelowFoldDetector);
defaultDetectorRegistry.register(ConvNoPrimaryCtaDetector);
defaultDetectorRegistry.register(ConvNoTelLinkDetector);
defaultDetectorRegistry.register(ConvTapTargetSmallDetector);
defaultDetectorRegistry.register(ConvFormFrictionDetector);
defaultDetectorRegistry.register(ConvTrustSignalsDetector);

// Register Clarity Detectors
defaultDetectorRegistry.register(ClarityHeadlineVagueDetector);
defaultDetectorRegistry.register(ClarityValuePropMissingDetector);

export {
  SpeedLcpSlowDetector,
  SpeedClsHighDetector,
  SpeedLongTasksDetector,
  SpeedPageWeightDetector,
  SpeedHeavyImageDetector,
  SpeedThirdPartyHeavyDetector,
  ConvCtaBelowFoldDetector,
  ConvNoPrimaryCtaDetector,
  ConvNoTelLinkDetector,
  ConvTapTargetSmallDetector,
  ConvFormFrictionDetector,
  ConvTrustSignalsDetector,
  ClarityHeadlineVagueDetector,
  ClarityValuePropMissingDetector,
};
