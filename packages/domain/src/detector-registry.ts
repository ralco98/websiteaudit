import { DetectorDefinition, DetectorContext, DetectorResult } from './detector-contract.js';

export class DetectorRegistry {
  private detectors = new Map<string, DetectorDefinition>();

  public register(detector: DetectorDefinition): void {
    this.detectors.set(detector.code, detector);
  }

  public get(code: string): DetectorDefinition | undefined {
    return this.detectors.get(code);
  }

  public getAll(): DetectorDefinition[] {
    return Array.from(this.detectors.values());
  }

  public evaluate(code: string, context: DetectorContext): DetectorResult | null {
    const detector = this.detectors.get(code);
    if (!detector) return null;
    return detector.evaluate(context);
  }

  public evaluateModule(module: 'speed' | 'clarity' | 'conversion', context: DetectorContext): DetectorResult[] {
    return Array.from(this.detectors.values())
      .filter(d => d.module === module)
      .map(d => d.evaluate(context));
  }
}

export const defaultDetectorRegistry = new DetectorRegistry();
