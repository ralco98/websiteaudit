import { Page } from 'playwright';
import {
  DOMHeading,
  DOMLink,
  DOMButton,
  DOMForm,
  DOMInput,
  DOMImage,
  DOMVideo,
  DOMIframe,
  PhoneObservation,
  TrustSignalObservation,
  ClarityObservation,
  ViewportMeasurement,
} from '@convertaudit/evidence';

export interface CollectedDOMData {
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
  phones: PhoneObservation[];
  trustSignals: TrustSignalObservation[];
  clarityAudit: ClarityObservation;
  viewportMeasurements: Record<string, ViewportMeasurement>;
}

export class BrowserDOMExtractor {
  public async extract(page: Page): Promise<CollectedDOMData> {
    try {
      const extracted = await page.evaluate(() => {
        const title = document.title || '';
        const metaDescNode = document.querySelector('meta[name="description"]');
        const metaDescription = metaDescNode ? metaDescNode.getAttribute('content') || '' : '';

        function getBbox(el: Element) {
          const r = el.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        }

        function getVisibility(el: Element) {
          const style = window.getComputedStyle(el);
          const bbox = getBbox(el);
          const display = style.display;
          const visibility = style.visibility;
          const opacity = parseFloat(style.opacity || '1');
          const zIndex = style.zIndex !== 'auto' ? parseInt(style.zIndex, 10) : null;
          const isFixedOrSticky = style.position === 'fixed' || style.position === 'sticky';

          const visible =
            display !== 'none' &&
            visibility !== 'hidden' &&
            opacity > 0.05 &&
            bbox.width > 0 &&
            bbox.height > 0;

          const windowH = window.innerHeight;
          const inViewport = visible && bbox.y < windowH && bbox.y + bbox.height > 0;
          const fullyVisible = inViewport && bbox.y >= 0 && bbox.y + bbox.height <= windowH;
          const partiallyVisible = inViewport && !fullyVisible;

          return {
            inViewport,
            visible,
            partiallyVisible,
            fullyVisible,
            display,
            visibility,
            opacity,
            zIndex,
            isFixedOrSticky,
          };
        }

        function getSelector(el: Element): string {
          if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return `#${el.id}`;
          const tag = el.tagName.toLowerCase();
          const name = el.getAttribute('name');
          if (name) return `${tag}[name="${name}"]`;
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) return `${tag}[aria-label="${ariaLabel}"]`;

          const parent = el.parentElement;
          if (parent && parent.id) return `#${parent.id} > ${tag}`;
          return tag;
        }

        // 1. Headings
        const headings: any[] = [];
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
          const style = window.getComputedStyle(el);
          headings.push({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 200) || '',
            selector: getSelector(el),
            bbox: getBbox(el),
            fontSizePx: Math.round(parseFloat(style.fontSize || '16')),
            fontWeight: style.fontWeight || 'normal',
          });
        });

        // 2. Links
        const links: any[] = [];
        document.querySelectorAll('a[href]').forEach((el) => {
          const href = el.getAttribute('href') || '';
          const text = el.textContent?.trim().slice(0, 100) || '';
          links.push({
            text,
            href,
            rawHref: href,
            isTel: href.toLowerCase().startsWith('tel:'),
            isMailto: href.toLowerCase().startsWith('mailto:'),
            selector: getSelector(el),
            bbox: getBbox(el),
            visibility: getVisibility(el),
          });
        });

        // 3. Buttons & Role=Button
        const buttons: any[] = [];
        document.querySelectorAll('button, input[type="submit"], [role="button"]').forEach((el) => {
          const style = window.getComputedStyle(el);
          buttons.push({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim() || el.getAttribute('value') || el.getAttribute('aria-label') || '',
            role: el.getAttribute('role') || undefined,
            ariaLabel: el.getAttribute('aria-label') || undefined,
            selector: getSelector(el),
            bbox: getBbox(el),
            visibility: getVisibility(el),
            fontSizePx: Math.round(parseFloat(style.fontSize || '14')),
            fontWeight: style.fontWeight || 'normal',
            color: style.color || '',
            backgroundColor: style.backgroundColor || '',
          });
        });

        // 4. Forms & Inputs with Core vs Secondary Field Separation (§10)
        const forms: any[] = [];
        const inputsList: any[] = [];

        const CORE_LEAD_FIELD_REGEX = /name|first_?name|last_?name|full_?name|phone|tel|mobile|email|message|notes|comment|inquiry/i;

        document.querySelectorAll('form').forEach((formEl) => {
          const isVisible = getVisibility(formEl).visible;
          const inputs: any[] = [];
          const coreFields: string[] = [];
          const qualFields: string[] = [];

          formEl.querySelectorAll('input, select, textarea').forEach((inputEl) => {
            const type = inputEl.getAttribute('type') || 'text';
            if (type === 'hidden') return;

            const id = inputEl.getAttribute('id');
            const name = inputEl.getAttribute('name') || '';
            const placeholder = inputEl.getAttribute('placeholder') || '';
            const hasLabel = Boolean(id && document.querySelector(`label[for="${id}"]`));
            const labelText = id ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim() : undefined;

            const fieldIdent = (name || id || placeholder || labelText || type).toLowerCase();
            if (CORE_LEAD_FIELD_REGEX.test(fieldIdent)) {
              coreFields.push(fieldIdent);
            } else {
              qualFields.push(fieldIdent);
            }

            const inputObs = {
              tag: inputEl.tagName.toLowerCase(),
              type,
              name: name || undefined,
              id: id || undefined,
              placeholder: placeholder || undefined,
              hasLabel,
              labelText,
              autocomplete: inputEl.getAttribute('autocomplete') || undefined,
              isRequired: inputEl.hasAttribute('required'),
              isVisible: getVisibility(inputEl).visible,
              selector: getSelector(inputEl),
            };

            inputs.push(inputObs);
            inputsList.push(inputObs);
          });

          const action = formEl.getAttribute('action') || '';
          const hasSubmit = Boolean(formEl.querySelector('button[type="submit"], input[type="submit"]'));
          const hasCaptcha = Boolean(formEl.querySelector('.g-recaptcha, .h-captcha, [data-sitekey], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'));

          forms.push({
            selector: getSelector(formEl),
            action,
            method: (formEl.getAttribute('method') || 'GET').toUpperCase(),
            isHttps: action.startsWith('https:') || window.location.protocol === 'https:',
            isVisible,
            inputCount: inputs.length,
            visibleInputCount: inputs.filter(i => i.isVisible).length,
            inputs,
            hasSubmitButton: hasSubmit,
            hasCaptcha,
            isIframe: false,
            formType: action.startsWith('https://') && !action.includes(window.location.hostname) ? 'THIRD_PARTY_FORM' : 'FIRST_PARTY_FORM',
            bbox: getBbox(formEl),
            coreLeadFields: coreFields,
            qualificationFields: qualFields,
          });
        });

        // 5. Images
        const images: any[] = [];
        document.querySelectorAll('img').forEach((el) => {
          const img = el as HTMLImageElement;
          images.push({
            src: img.currentSrc || img.src || '',
            alt: img.alt || undefined,
            loading: img.getAttribute('loading') || undefined,
            fetchpriority: img.getAttribute('fetchpriority') || undefined,
            naturalWidth: img.naturalWidth || 0,
            naturalHeight: img.naturalHeight || 0,
            clientWidth: Math.round(img.clientWidth),
            clientHeight: Math.round(img.clientHeight),
            selector: getSelector(img),
            bbox: getBbox(img),
          });
        });

        // 6. Videos & Iframes
        const videos: any[] = [];
        document.querySelectorAll('video').forEach((el) => {
          videos.push({
            src: el.src || el.querySelector('source')?.src || undefined,
            autoplay: el.autoplay,
            muted: el.muted,
            isIframe: false,
            selector: getSelector(el),
          });
        });

        const iframes: any[] = [];
        document.querySelectorAll('iframe').forEach((el) => {
          iframes.push({
            src: el.src || '',
            title: el.title || undefined,
            selector: getSelector(el),
            bbox: getBbox(el),
          });
        });

        // 7. Robust Phone Detection with False-Positive Prevention (§9)
        const phones: PhoneObservation[] = [];
        const seenNumbers = new Set<string>();

        // Regex matches standard US and International numbers:
        // Requires area code and min 10 digits; avoids dates like 2024-05-18 or 10/12/2024, ZIPs (5 digits), IDs
        const PHONE_REGEX = /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9][0-8][0-9])\s*\)|([2-9][0-8][0-9]))\s*(?:[.-]\s*)?([2-9][0-9]{2})\s*(?:[.-]\s*)?([0-9]{4}))|(?:\+[2-9]\d{0,2}[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4})/g;

        function normalizePhone(raw: string): string {
          const digits = raw.replace(/\D/g, '');
          if (digits.length === 10) return `+1${digits}`;
          if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
          return raw.startsWith('+') ? `+${digits}` : digits;
        }

        function determineLocation(el: Element, bbox: { y: number }): PhoneObservation['location'] {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') return 'sticky';
          if (el.closest('header, nav') || bbox.y < 120) return 'header';
          if (bbox.y <= 844) return 'hero';
          if (el.closest('footer') || bbox.y > (document.body.scrollHeight - 500)) return 'footer';
          return 'body';
        }

        // A. Direct tel: links (Ground Truth Grade A)
        document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
          const href = a.getAttribute('href') || '';
          const rawNumber = href.replace(/^tel:/i, '').trim();
          const normalized = normalizePhone(rawNumber);
          const bbox = getBbox(a);
          if (!seenNumbers.has(normalized) && normalized.replace(/\D/g, '').length >= 7) {
            seenNumbers.add(normalized);
            phones.push({
              rawText: a.textContent?.trim() || rawNumber,
              normalized,
              isClickable: true,
              href,
              location: determineLocation(a, bbox),
              selector: getSelector(a),
              bbox,
            });
          }
        });

        // B. Visible text nodes scanning with strict false positive rejection
        const textElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button, li');
        textElements.forEach((el) => {
          // Avoid scanning script/style or huge containers
          if (el.children.length > 3) return;
          const text = el.textContent?.trim() || '';
          if (text.length < 10 || text.length > 200) return;

          // Exclude dates (e.g. 2024-10-12, 12/31/2023)
          if (/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/.test(text)) return;
          // Exclude dollar amounts, tracking numbers, or pure timestamps
          if (/\$\s*\d|\b[0-2]?\d:[0-5]\d\b/.test(text)) return;

          let match;
          PHONE_REGEX.lastIndex = 0;
          while ((match = PHONE_REGEX.exec(text)) !== null) {
            const raw = match[0].trim();
            const normalized = normalizePhone(raw);
            const digitCount = normalized.replace(/\D/g, '').length;

            // Reject if less than 10 digits (e.g. 5-digit zip codes) or more than 15
            if (digitCount < 10 || digitCount > 15) continue;

            if (!seenNumbers.has(normalized)) {
              seenNumbers.add(normalized);
              const parentLink = el.closest('a');
              const isTelLink = Boolean(parentLink && (parentLink.getAttribute('href') || '').toLowerCase().startsWith('tel:'));
              const bbox = getBbox(el);

              phones.push({
                rawText: raw,
                normalized,
                isClickable: isTelLink,
                href: isTelLink ? parentLink?.getAttribute('href') || null : null,
                location: determineLocation(el, bbox),
                selector: getSelector(el),
                bbox,
              });
            }
          }
        });

        // 8. Trust Signal Extraction (§12)
        const trustSignals: TrustSignalObservation[] = [];
        const TRUST_PLATFORMS: Record<string, TrustSignalObservation['platform']> = {
          google: 'google',
          yelp: 'yelp',
          trustpilot: 'trustpilot',
          bbb: 'bbb',
          'better business bureau': 'bbb',
          angie: 'angie',
          houzz: 'houzz',
        };

        const trustCandidates = document.querySelectorAll('[class*="review"], [class*="rating"], [class*="testimonial"], [class*="badge"], [class*="trust"], [id*="trust"], [id*="review"], [class*="star"]');
        trustCandidates.forEach((el) => {
          if (el.children.length > 5) return;
          const text = el.textContent?.trim() || '';
          if (!text && !el.querySelector('svg, img')) return;

          const lower = text.toLowerCase();
          let platform: TrustSignalObservation['platform'] = undefined;
          for (const [key, plat] of Object.entries(TRUST_PLATFORMS)) {
            if (lower.includes(key)) {
              platform = plat;
              break;
            }
          }

          let ratingVal: number | undefined;
          const rateMatch = text.match(/([3-5](?:\.[0-9])?)\s*(?:\/\s*5|\s*stars?|\s*rating)/i);
          if (rateMatch && rateMatch[1]) {
            ratingVal = parseFloat(rateMatch[1]);
          }

          let revCount: number | undefined;
          const countMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})*)\+?\s*reviews?/i);
          if (countMatch && countMatch[1]) {
            revCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
          }

          let type: TrustSignalObservation['type'] = 'testimonial';
          if (ratingVal) type = 'review_rating';
          else if (revCount) type = 'review_count';
          else if (/guarantee|warranty|satisfaction/i.test(lower)) type = 'guarantee';
          else if (/licensed|insured|bonded/i.test(lower)) type = 'licensed_insured';
          else if (/accredited|bbb/i.test(lower)) type = 'accreditation';
          else if (/award|voted|best\s*of/i.test(lower)) type = 'award';
          else if (el.querySelector('img[alt*="logo" i], img[src*="logo" i]')) type = 'client_logo';

          const bbox = getBbox(el);
          // Only include if visible
          if (bbox.width > 0 && bbox.height > 0) {
            trustSignals.push({
              type,
              text: text.slice(0, 150),
              platform,
              ratingValue: ratingVal,
              reviewCount: revCount,
              isNearCta: bbox.y <= 900,
              selector: getSelector(el),
              bbox,
            });
          }
        });

        // 9. Clarity & 5-Second Test Extraction (§11)
        const h1El = document.querySelector('h1');
        const h1Obs: DOMHeading | null = h1El ? {
          tag: 'h1',
          text: h1El.textContent?.trim().slice(0, 200) || '',
          selector: getSelector(h1El),
          bbox: getBbox(h1El),
          fontSizePx: Math.round(parseFloat(window.getComputedStyle(h1El).fontSize || '24')),
          fontWeight: window.getComputedStyle(h1El).fontWeight || 'bold',
        } : null;

        const subEl = document.querySelector('h1 ~ p, .hero p, [class*="hero"] p, header p');
        const subheadline = subEl?.textContent?.trim().slice(0, 200) || null;

        const allHeroText = `${title} ${h1Obs?.text || ''} ${subheadline || ''}`.toLowerCase();

        const SERVICE_KEYWORDS = [
          'plumbing', 'roofing', 'hvac', 'lawyer', 'attorney', 'dentist', 'dental',
          'doctor', 'cleaning', 'accounting', 'cpa', 'towing', 'electrician', 'contractor',
          'locksmith', 'auto repair', 'consulting', 'software', 'platform', 'app',
          'audit', 'security', 'analytics', 'marketing', 'design', 'development'
        ];
        const LOCATION_KEYWORDS = [
          'in ', 'near me', 'austin', 'dallas', 'houston', 'new york', 'los angeles',
          'chicago', 'miami', 'denver', 'seattle', 'san francisco', 'atlanta', 'london'
        ];
        const URGENCY_KEYWORDS = [
          '24/7', 'emergency', 'same day', 'immediate', 'fast', 'within 1 hour', 'instant'
        ];
        const BENEFIT_KEYWORDS = [
          'guaranteed', 'licensed', 'insured', 'free quote', 'affordable', 'expert',
          'trusted', 'certified', 'no obligation', 'top rated'
        ];

        const serviceDetected = SERVICE_KEYWORDS.filter(k => allHeroText.includes(k));
        const locationDetected = LOCATION_KEYWORDS.filter(k => allHeroText.includes(k));
        const urgencyDetected = URGENCY_KEYWORDS.filter(k => allHeroText.includes(k));
        const benefitDetected = BENEFIT_KEYWORDS.filter(k => allHeroText.includes(k));

        const clarityAudit: ClarityObservation = {
          h1: h1Obs,
          subheadline,
          serviceKeywordsDetected: serviceDetected,
          locationKeywordsDetected: locationDetected,
          urgencyKeywordsDetected: urgencyDetected,
          benefitKeywordsDetected: benefitDetected,
          whatOffered: serviceDetected.length > 0 ? serviceDetected.join(', ') : null,
          whoFor: 'Prospective Customers',
          nextStepAction: document.querySelector('button, a.btn, [role="button"]')?.textContent?.trim() || null,
          clarityHeuristicMet: Boolean(h1Obs && (serviceDetected.length > 0 || subheadline)),
        };

        // 10. Multi-Viewport Measurement (§7)
        const primaryCtaEl = document.querySelector('button, [role="button"], a.btn, a[class*="cta"], a[href^="tel:"]');
        const primaryCtaBbox = primaryCtaEl ? getBbox(primaryCtaEl) : null;
        const vpMeasurements: Record<string, ViewportMeasurement> = {};

        [
          { name: '390x844', w: 390, h: 844 },
          { name: '375x812', w: 375, h: 812 },
          { name: '412x915', w: 412, h: 915 },
        ].forEach(vp => {
          const ctaTop = primaryCtaBbox ? primaryCtaBbox.y : null;
          const aboveFold = ctaTop !== null && ctaTop <= vp.h;
          const belowFold = ctaTop !== null ? Math.max(0, ctaTop - vp.h) : 0;

          vpMeasurements[vp.name] = {
            viewportWidth: vp.w,
            viewportHeight: vp.h,
            heroHeight: Math.min(vp.h, document.body.scrollHeight),
            h1Top: h1Obs ? h1Obs.bbox.y : null,
            primaryCtaTop: ctaTop,
            primaryCtaAboveFold: aboveFold,
            pixelsBelowFold: belowFold,
            hasHorizontalOverflow: document.documentElement.scrollWidth > vp.w,
            fixedStickyCta: Boolean(document.querySelector('[style*="position: fixed"], [style*="position: sticky"], .fixed, .sticky')),
            smallTapTargetCount: Array.from(document.querySelectorAll('button, a')).filter(el => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
            }).length,
          };
        });

        return {
          title,
          metaDescription,
          headings,
          links,
          buttons,
          forms,
          inputs: inputsList,
          images,
          videos,
          iframes,
          phones,
          trustSignals,
          clarityAudit,
          viewportMeasurements: vpMeasurements,
        };
      });

      return extracted;
    } catch {
      return {
        title: '',
        metaDescription: '',
        headings: [],
        links: [],
        buttons: [],
        forms: [],
        inputs: [],
        images: [],
        videos: [],
        iframes: [],
        phones: [],
        trustSignals: [],
        clarityAudit: {
          h1: null,
          subheadline: null,
          serviceKeywordsDetected: [],
          locationKeywordsDetected: [],
          urgencyKeywordsDetected: [],
          benefitKeywordsDetected: [],
          whatOffered: null,
          whoFor: null,
          nextStepAction: null,
          clarityHeuristicMet: false,
        },
        viewportMeasurements: {},
      };
    }
  }
}
