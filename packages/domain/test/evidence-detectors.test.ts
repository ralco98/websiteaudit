import { describe, it, expect } from 'vitest';
import { PageObservation } from '@convertaudit/evidence';
import {
  ConvCtaBelowFoldDetector,
  ConvNoTelLinkDetector,
  ConvNoPrimaryCtaDetector,
  ConvTapTargetSmallDetector,
  ConvFormFrictionDetector,
  ConvTrustSignalsDetector,
  ClarityHeadlineVagueDetector,
  ClarityValuePropMissingDetector,
  calculateFindingPriority,
  explainFindingPriority,
  rankFindings,
  instantiateFinding,
  DetectorContext,
} from '../src/index.js';

function createMockObservation(overrides: Partial<PageObservation> = {}): PageObservation {
  return {
    schemaVersion: 'observation.v1',
    target: {
      requestedUrl: 'https://austin-emergency-plumbing.com',
      finalUrl: 'https://austin-emergency-plumbing.com',
      host: 'austin-emergency-plumbing.com',
      timestamp: new Date().toISOString(),
    },
    viewport: {
      profile: 'mobile',
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      touch: true,
    },
    navigation: {
      status: 200,
      redirects: 0,
      navigationStart: 0,
      responseStart: 100,
      domContentLoaded: 400,
      load: 750,
      ttfb: 100,
      timingSource: 'BROWSER',
    },
    dom: {
      title: 'Emergency Plumbing in Austin | Fast 24/7 Service',
      metaDescription: '24/7 licensed emergency plumbers in Austin, TX. Call now for rapid response.',
      headings: [
        {
          tag: 'h1',
          text: 'Emergency Plumbing in Austin — 24/7 Rapid Response',
          selector: 'h1',
          bbox: { x: 20, y: 120, width: 350, height: 60 },
          fontSizePx: 28,
          fontWeight: 'bold',
        },
      ],
      links: [
        {
          text: 'Call (512) 555-0199',
          href: 'tel:+15125550199',
          rawHref: 'tel:+15125550199',
          isTel: true,
          isMailto: false,
          selector: 'a.call-btn',
          bbox: { x: 20, y: 220, width: 200, height: 48 },
          visibility: {
            inViewport: true,
            visible: true,
            partiallyVisible: false,
            fullyVisible: true,
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            zIndex: 10,
            isFixedOrSticky: false,
          },
        },
      ],
      buttons: [
        {
          tag: 'button',
          text: 'Request Emergency Dispatch',
          selector: 'button.cta-primary',
          bbox: { x: 20, y: 300, width: 350, height: 52 },
          visibility: {
            inViewport: true,
            visible: true,
            partiallyVisible: false,
            fullyVisible: true,
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            zIndex: 10,
            isFixedOrSticky: false,
          },
          fontSizePx: 18,
          fontWeight: 'bold',
          color: '#ffffff',
          backgroundColor: '#2563eb',
        },
      ],
      forms: [],
      inputs: [],
      images: [],
      videos: [],
      iframes: [],
    },
    interactive: {
      ctaCandidates: [
        {
          tag: 'button',
          text: 'Request Emergency Dispatch',
          selector: 'button.cta-primary',
          bbox: { x: 20, y: 300, width: 350, height: 52 },
          visibility: {
            inViewport: true,
            visible: true,
            partiallyVisible: false,
            fullyVisible: true,
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            zIndex: 10,
            isFixedOrSticky: false,
          },
          fontSizePx: 18,
          fontWeight: 'bold',
          color: '#ffffff',
          backgroundColor: '#2563eb',
          classification: 'PRIMARY_CTA',
          classificationReason: "Button text 'Request Emergency Dispatch'",
          classificationConfidence: 0.95,
        },
      ],
      phoneLinks: [],
      emailLinks: [],
      contactLinks: [],
      submitControls: [],
    },
    network: {
      requests: [],
      totalRequests: 12,
      totalTransferBytes: 350000,
      firstPartyTransferBytes: 300000,
      thirdPartyTransferBytes: 50000,
    },
    performance: {
      fcp: 800,
      lcp: 1400,
      lcpElement: null,
      cls: 0.02,
      longTasks: [],
      tbt: 0,
      resources: [],
    },
    console: { errors: [], warnings: [], pageErrors: [] },
    visual: { dimensions: { width: 390, height: 844 }, timestamp: new Date().toISOString() },
    phones: [
      {
        rawText: '(512) 555-0199',
        normalized: '+15125550199',
        isClickable: true,
        href: 'tel:+15125550199',
        location: 'hero',
        selector: 'a.call-btn',
        bbox: { x: 20, y: 220, width: 200, height: 48 },
      },
    ],
    trustSignals: [
      {
        type: 'review_rating',
        text: '4.9/5 stars based on 180 Google reviews',
        platform: 'google',
        ratingValue: 4.9,
        reviewCount: 180,
        isNearCta: true,
        selector: '.trust-badge',
        bbox: { x: 20, y: 370, width: 280, height: 30 },
      },
    ],
    clarityAudit: {
      h1: {
        tag: 'h1',
        text: 'Emergency Plumbing in Austin — 24/7 Rapid Response',
        selector: 'h1',
        bbox: { x: 20, y: 120, width: 350, height: 60 },
        fontSizePx: 28,
        fontWeight: 'bold',
      },
      subheadline: 'Licensed & insured master plumbers serving all Austin metro areas with 45-minute arrival guarantees.',
      serviceKeywordsDetected: ['plumbing'],
      locationKeywordsDetected: ['austin'],
      urgencyKeywordsDetected: ['24/7', 'emergency', 'rapid response'],
      benefitKeywordsDetected: ['licensed', 'insured', 'guarantee'],
      whatOffered: 'plumbing',
      whoFor: 'Austin homeowners and businesses',
      nextStepAction: 'Request Emergency Dispatch',
      clarityHeuristicMet: true,
    },
    browser: { engine: 'chromium', version: '122.0.0.0', observationStatus: 'COMPLETE' },
    ...overrides,
  };
}

describe('Evidence-First Detectors & Calibrated Scoring', () => {
  describe('Phase 8 & Phase 7: CTA Below Fold Detection', () => {
    it('detects CTA below fold with exact coordinates and generates observable evidence', () => {
      const belowFoldObs = createMockObservation({
        interactive: {
          ctaCandidates: [
            {
              tag: 'button',
              text: 'Book Free Consultation',
              selector: '#hero-cta',
              bbox: { x: 20, y: 927, width: 350, height: 54 },
              visibility: {
                inViewport: false,
                visible: true,
                partiallyVisible: false,
                fullyVisible: false,
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                zIndex: 1,
                isFixedOrSticky: false,
              },
              fontSizePx: 16,
              fontWeight: 'bold',
              color: '#fff',
              backgroundColor: '#000',
              classification: 'PRIMARY_CTA',
              classificationReason: 'Primary button',
              classificationConfidence: 0.95,
            },
          ],
          phoneLinks: [],
          emailLinks: [],
          contactLinks: [],
          submitControls: [],
        },
      });

      const res = ConvCtaBelowFoldDetector.evaluate({ observation: belowFoldObs, profile: 'mobile' });
      expect(res.status).toBe('DETECTED');
      expect(res.detected).toBe(true);
      expect(res.confidence).toBe(0.98);
      expect(res.measurements.pixelsBelowFold).toBe(83); // 927 - 844 = 83px
      expect(res.measurements.elementTop).toBe(927);
      expect(res.measurements.viewportHeight).toBe(844);

      // Verify finding attributes
      expect(res.finding).not.toBeNull();
      expect(res.finding?.headline).toBe('CTA begins 83px below the first mobile viewport.');
      expect(res.finding?.observed).toBeDefined();
      expect(typeof res.finding?.observed).toBe('object');
      expect((res.finding?.observed as any).pixelsBelowFold).toBe(83);
    });

    it('returns NOT_DETECTED when CTA is above fold', () => {
      const aboveFoldObs = createMockObservation();
      const res = ConvCtaBelowFoldDetector.evaluate({ observation: aboveFoldObs, profile: 'mobile' });
      expect(res.status).toBe('NOT_DETECTED');
      expect(res.detected).toBe(false);
      expect(res.finding).toBeNull();
    });
  });

  describe('Phase 9: Phone Detection & False-Positive Prevention', () => {
    it('detects unlinked plain text phone and provides exact DOM evidence with 0.99 confidence', () => {
      const plainPhoneObs = createMockObservation({
        dom: {
          ...createMockObservation().dom,
          links: [], // No tel links
        },
        phones: [
          {
            rawText: '(512) 555-0199',
            normalized: '+15125550199',
            isClickable: false,
            href: null,
            location: 'hero',
            selector: 'p.phone-text',
            bbox: { x: 20, y: 150, width: 180, height: 24 },
          },
        ],
      });

      const res = ConvNoTelLinkDetector.evaluate({ observation: plainPhoneObs, profile: 'mobile' });
      expect(res.status).toBe('DETECTED');
      expect(res.confidence).toBe(0.99);
      expect(res.measurements.phoneNumber).toBe('(512) 555-0199');
      expect(res.measurements.clickable).toBe(false);
      expect(res.measurements.href).toBeNull();
      expect(res.finding?.headline).toContain('rendered as plain text and is not clickable');
    });

    it('returns NOT_DETECTED when phone is wrapped in valid tel: link', () => {
      const clickableObs = createMockObservation();
      const res = ConvNoTelLinkDetector.evaluate({ observation: clickableObs, profile: 'mobile' });
      expect(res.status).toBe('NOT_DETECTED');
      expect(res.detected).toBe(false);
    });

    it('returns NOT_APPLICABLE when no phone number exists on page', () => {
      const noPhoneObs = createMockObservation({
        dom: { ...createMockObservation().dom, links: [] },
        phones: [],
      });
      const res = ConvNoTelLinkDetector.evaluate({ observation: noPhoneObs, profile: 'mobile' });
      expect(res.status).toBe('NOT_APPLICABLE');
      expect(res.detected).toBe(false);
    });
  });

  describe('Phase 10: Form Friction & Field Breakdown', () => {
    it('detects form friction with breakdown of core vs qualification fields', () => {
      const formObs = createMockObservation({
        dom: {
          ...createMockObservation().dom,
          forms: [
            {
              selector: '#contact-form',
              action: '/submit',
              method: 'POST',
              isHttps: true,
              isVisible: true,
              inputCount: 6,
              visibleInputCount: 6,
              inputs: [
                { tag: 'input', name: 'fullName', isRequired: true, isVisible: true, selector: '#name', hasLabel: true },
                { tag: 'input', name: 'email', isRequired: true, isVisible: true, selector: '#email', hasLabel: true },
                { tag: 'input', name: 'phone', isRequired: true, isVisible: true, selector: '#phone', hasLabel: true },
                { tag: 'input', name: 'company', isRequired: false, isVisible: true, selector: '#company', hasLabel: true },
                { tag: 'select', name: 'budget', isRequired: false, isVisible: true, selector: '#budget', hasLabel: true },
                { tag: 'textarea', name: 'timeline', isRequired: false, isVisible: true, selector: '#timeline', hasLabel: true },
              ],
              hasSubmitButton: true,
              hasCaptcha: false,
              isIframe: false,
              formType: 'FIRST_PARTY_FORM',
              bbox: { x: 20, y: 400, width: 350, height: 450 },
              coreLeadFields: ['fullname', 'email', 'phone'],
              qualificationFields: ['company', 'budget', 'timeline'],
            },
          ],
        },
      });

      const res = ConvFormFrictionDetector.evaluate({ observation: formObs, profile: 'mobile' });
      expect(res.status).toBe('DETECTED');
      expect(res.measurements.fieldCount).toBe(6);
      expect(res.measurements.coreFieldsDetected).toEqual(['fullname', 'email', 'phone']);
      expect(res.measurements.qualificationFieldsDetected).toEqual(['company', 'budget', 'timeline']);
      expect(res.finding?.headline).toContain('6 user-visible fields detected in lead form (3 qualification fields)');
    });

    it('returns NOT_DETECTED for concise form with <= 4 fields', () => {
      const shortFormObs = createMockObservation({
        dom: {
          ...createMockObservation().dom,
          forms: [
            {
              selector: '#lead-form',
              isVisible: true,
              inputCount: 2,
              visibleInputCount: 2,
              inputs: [
                { tag: 'input', name: 'phone', isRequired: true, isVisible: true, selector: '#phone', hasLabel: true },
                { tag: 'input', name: 'name', isRequired: true, isVisible: true, selector: '#name', hasLabel: true },
              ],
              hasSubmitButton: true,
              hasCaptcha: false,
              isIframe: false,
              isHttps: true,
              formType: 'FIRST_PARTY_FORM',
              bbox: { x: 0, y: 0, width: 300, height: 100 },
              coreLeadFields: ['phone', 'name'],
              qualificationFields: [],
            },
          ],
        },
      });

      const res = ConvFormFrictionDetector.evaluate({ observation: shortFormObs, profile: 'mobile' });
      expect(res.status).toBe('NOT_DETECTED');
    });
  });

  describe('Phase 11: Hero / 5-Second Clarity Detection', () => {
    it('detects vague headlines like "Welcome to our site" and explains with observable data', () => {
      const vagueObs = createMockObservation({
        dom: {
          ...createMockObservation().dom,
          headings: [
            {
              tag: 'h1',
              text: 'Welcome to Our Website',
              selector: 'h1',
              bbox: { x: 20, y: 100, width: 350, height: 50 },
              fontSizePx: 32,
              fontWeight: 'bold',
            },
          ],
        },
        clarityAudit: {
          h1: { tag: 'h1', text: 'Welcome to Our Website', selector: 'h1', bbox: { x: 20, y: 100, width: 350, height: 50 }, fontSizePx: 32, fontWeight: 'bold' },
          subheadline: null,
          serviceKeywordsDetected: [],
          locationKeywordsDetected: [],
          urgencyKeywordsDetected: [],
          benefitKeywordsDetected: [],
          whatOffered: null,
          whoFor: 'Prospective Customers',
          nextStepAction: null,
          clarityHeuristicMet: false,
        },
      });

      const res = ClarityHeadlineVagueDetector.evaluate({ observation: vagueObs, profile: 'mobile' });
      expect(res.status).toBe('DETECTED');
      expect(res.measurements.genericPhraseDetected).toBe(true);
      expect(res.measurements.serviceKeywordsFound).toBe(false);
      expect(res.finding?.headline).toContain('does not explicitly communicate the core service');
    });

    it('returns NOT_DETECTED when headline communicates clear service keywords', () => {
      const clearObs = createMockObservation();
      const res = ClarityHeadlineVagueDetector.evaluate({ observation: clearObs, profile: 'mobile' });
      expect(res.status).toBe('NOT_DETECTED');
      expect(res.detected).toBe(false);
    });
  });

  describe('Phase 12: Trust Signal Detection (No Fake Data)', () => {
    it('detects missing trust signals near CTA without fabricating fake ratings', () => {
      const noTrustObs = createMockObservation({ trustSignals: [] });
      const res = ConvTrustSignalsDetector.evaluate({ observation: noTrustObs, profile: 'mobile' });
      expect(res.status).toBe('DETECTED');
      expect(res.measurements.totalTrustSignalsDetected).toBe(0);
      expect(res.finding?.headline).toContain('No verified trust badges, ratings, or guarantees were detected');
      // Verifies no fake rating is suggested in developer brief
      expect(res.finding?.developerBrief).toContain('Do not fabricate ratings');
    });

    it('returns NOT_DETECTED when verified Google review rating is adjacent to CTA', () => {
      const trustObs = createMockObservation();
      const res = ConvTrustSignalsDetector.evaluate({ observation: trustObs, profile: 'mobile' });
      expect(res.status).toBe('NOT_DETECTED');
      expect(res.detected).toBe(false);
    });
  });

  describe('Phase 6: Priority Scoring & Calibration', () => {
    it('computes explainable priority: (severity × impact × conversionRelevance × confidence) / effort', () => {
      const fCritical = instantiateFinding('CONV_NO_PRIMARY_CTA', {}, [], 0.98);
      expect(fCritical).not.toBeNull();
      const priority = calculateFindingPriority(fCritical!);
      // severity=8.0 (critical), impact=1.5, convRel=1.5, conf=0.98, effort=1.0 -> 8 * 1.5 * 1.5 * 0.98 / 1 = 17.64
      expect(priority).toBe(17.64);

      const explanation = explainFindingPriority(fCritical!);
      expect(explanation.explanation).toContain('CRITICAL priority');
      expect(explanation.explanation).toContain('98% evidence confidence');
    });

    it('calibrates rank order so high-confidence critical conversion leads rank #1', () => {
      const f1 = instantiateFinding('CONV_NO_PRIMARY_CTA', {}, [], 0.98)!;
      const f2 = instantiateFinding('CONV_NO_TEL_LINK', {}, [], 0.99)!;
      const f3 = instantiateFinding('SPEED_HEAVY_IMAGE', { bytes: 3_000_000 }, [], 0.95)!;
      const f4 = instantiateFinding('CONV_NO_TRUST_NEAR_CTA', {}, [], 0.90)!;

      const { topFixes } = rankFindings([f3, f4, f2, f1]);
      expect(topFixes[0].code).toBe('CONV_NO_PRIMARY_CTA');
      expect(topFixes[0].rank).toBe(1);
    });
  });
});
