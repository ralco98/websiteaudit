# ConvertAudit AI — Scoring, Detection & Accuracy Specification

> The precise, testable algorithms behind every score and finding. Deterministic wherever possible, AI-graded only where judgment is unavoidable, and always constrained by measurable evidence. Versioned as `scoring_version` (current: **3**) and stored with every audit.

---

## 1. Principles for Accurate Output

1. **Measure, don't guess.** Any claim that can be computed from the page (sizes, timings, contrast, tap-target size, presence of `tel:`) is computed by code.
2. **AI judges only what code cannot** (is the headline meaningful to a stranger?) and is *bounded* by deterministic guard rails.
3. **Every finding is falsifiable**: it carries `evidence` (selector + bbox, request hash, measured value, screenshot pin) a human can verify in seconds.
4. **Stability is reported.** Each score has a `confidence` and, for lab metrics, a `stability`; noisy results show ranges.
5. **No silent penalties.** Score = 100 − Σ(deductions) is not used; scores come from named sub-scores, so any number can be explained.
6. **Reproducible**: same inputs + same `scoring_version` ⇒ same outputs (AI passes excepted, and those are cached and variance-checked).

---

## 2. Speed Score (0–100)

### 2.1 Metric → Sub-score Function

For a metric value *x* with control points **p10** (score 0.90) and **median** (score 0.50):

```
σ        = ln(median / p10) / 1.2816
score(x) = 1 − Φ( ln(x / median) / σ )          Φ = standard normal CDF, clamp to [0,1]
```

This log-normal curve is smooth, monotonic, never saturates abruptly, and (by construction) hits 0.90 at the "good" threshold and 0.50 at the "poor" threshold.

| Metric | p10 (good) | median (poor) | Unit | Weight |
|---|---:|---:|---|---:|
| LCP | 2,500 | 4,000 | ms | 0.35 |
| TBT (lab proxy for INP) | 200 | 600 | ms | 0.20 |
| CLS | 0.10 | 0.25 | — | 0.15 |
| TTFB | 800 | 1,800 | ms | 0.10 |
| Transfer weight | 1,000,000 | 3,000,000 | bytes | 0.10 |
| Request pressure = `thirdPartyBlockingMs + 2 × requestCount` | 150 | 600 | ms-equivalent | 0.10 |

```
Speed = round( 100 × Σ weight_i × score_i )
```

**Worked example** — LCP = 5,800 ms:
`σ = ln(4000/2500)/1.2816 = 0.3667`; `z = ln(5800/4000)/0.3667 = 1.0135`; `Φ(z) = 0.8446` → sub-score `0.155` (16/100).

### 2.2 The 3-Second Rule Flag

`losing_visitors = (lcp_median > 3000 ms)`. This adds an Overview banner and boosts priority of speed findings, but never changes the numeric score (the curve already encodes it).

### 2.3 Lab/Field Reconciliation

- If CrUX field data exists for the origin (≥ 28 days, p75): display beside lab values; **do not blend into the score**.
- If field p75 LCP is "Good" but lab is "Poor" (or vice versa), add an informational note: *"Real visitors experience faster/slower loads than our simulated phone."*

### 2.4 Stability

`spread = (max − min) / median` across samples for LCP. `stable` < 0.15, `moderate` 0.15–0.35, `noisy` > 0.35. Noisy results: display range, cap `confidence` at 0.6.

---

## 3. Clarity Score (0–100) — "5-Second Rule"

### 3.1 Inputs

Viewport screenshot at t = 5 s (390×844, 1×), ordered hero text blocks (text, font-size, weight, color contrast, position), deterministic hero features (§3.3), and `<title>`/meta description/JSON-LD (used **only** for the comprehension check, never shown to the model in pass 1).

### 3.2 Blind Comprehension Test (first, and most important)

The model is asked to answer as a first-time visitor who has never seen the site:

```json
{ "what_offered": {"answer": "...", "confidence": 0-1},
  "who_for":      {"answer": "...", "confidence": 0-1},
  "next_step":    {"answer": "...", "confidence": 0-1} }
```

Then a **judge step** (small model or embedding similarity ≥ 0.75 vs. the site's own title/description/`Organization` schema, whichever available) rates each answer: `correct`, `partial`, `wrong`, `unanswerable`.

| Comprehension outcome | Effect |
|---|---|
| `what_offered` = unanswerable/wrong | `headline_specificity ≤ 6`, overall Clarity capped at 55 |
| `who_for` unanswerable | `value_proposition ≤ 12` |
| `next_step` unanswerable | Adds finding `CLARITY_NEXT_STEP_UNCLEAR` |
| All three correct | No cap |

### 3.3 Deterministic Hero Features

| Feature | Definition | Use |
|---|---|---|
| `h1_present` | Visible `<h1>` or role=heading level 1 in hero | Guard for headline detection |
| `headline_words` | Word count of dominant text block | Very short (≤ 2) or long (> 22) penalized |
| `headline_ratio` | Headline font-size ÷ body font-size | < 1.5 ⇒ weak hierarchy |
| `headline_contrast` | WCAG contrast of headline vs. local background (sampled from screenshot pixels behind text bbox) | < 3:1 ⇒ `CLARITY_LOW_CONTRAST_HEADLINE` |
| `headline_in_image` | Dominant text found by OCR/vision but absent from DOM text | Headline baked into image ⇒ finding + accessibility/SEO note |
| `generic_phrase` | Match against lexicon ("Welcome to", "Home", "Your success is our priority", …) | Heuristic vague-headline signal |
| `text_block_count` | Distinct text blocks in hero | > 9 ⇒ clutter |
| `interactive_count_hero` | Buttons/links in hero (excluding nav) | > 5 ⇒ clutter |
| `image_text_ratio` | Hero area covered by image vs. text | Context for imagery scoring |
| `carousel_detected` | Auto-advancing slider in hero | `CLARITY_AUTO_CAROUSEL_HERO` |
| `cta_in_hero` | Primary CTA (from Conversion module) inside hero | Cross-module consistency |

### 3.4 Sub-scores (0–20 each, sum = Clarity)

| Sub-score | Anchors (AI rubric; integer 0–20) | Deterministic guard |
|---|---|---|
| **Headline specificity** | 0–4: no headline or "Welcome"; 5–9: generic category ("Quality services"); 10–14: names offering OR audience; 15–20: names offering + audience/outcome + differentiator | `generic_phrase` ⇒ ≤ 8; `headline_words ≤ 2` ⇒ ≤ 10 |
| **Value proposition** | 0–4: none; 5–9: features only; 10–14: benefit stated; 15–20: benefit + proof/quantification + who it's for | Missing supporting text block ⇒ ≤ 10 |
| **Visual hierarchy** | 0–4: nothing dominant; 5–9: competing focal points; 10–14: clear headline, weak CTA; 15–20: clear path headline → support → CTA | `headline_ratio < 1.5` ⇒ ≤ 9 |
| **Imagery relevance** | 0–4: missing/broken/irrelevant; 5–9: generic stock; 10–14: relevant but unspecific; 15–20: shows product/service/people/results | No hero image ⇒ neutral 10 (not penalized) |
| **Cognitive load** | 0–4: overwhelming; 5–9: crowded; 10–14: acceptable; 15–20: focused (≤ 3 message elements + 1–2 actions) | `text_block_count > 9` ⇒ ≤ 9 |

### 3.5 Reconciliation (Guard Rails)

```
final_sub = clamp( ai_sub , 0, guard_cap_sub )
disagreement = |ai_headline_specificity − det_headline_specificity_estimate|
if disagreement > 6 → mark needsEscalation
```

`det_headline_specificity_estimate` is a small monotone function of `generic_phrase`, `headline_words`, and presence of a noun-phrase naming a service/product (POS-tag heuristic). It is intentionally conservative: it never raises a score above what AI produced; it only caps or flags disagreement.

### 3.6 Confidence & Escalation

```
confidence = min(model_reported_conf (mean of three answers), 1 − variance/20)   (variance across passes when escalated)
needsEscalation = min(conf_i) < 0.6  OR  disagreement > 6 points  OR  |Clarity − nearest_grade_boundary| ≤ 3
```

Escalated audits run 3 samples on the stronger model; the reported sub-scores are per-dimension medians; if inter-pass range > 8 total points ⇒ label **"Needs human review"** and cap displayed confidence at 0.5.

### 3.7 Rewrite Suggestions

Rewrites may reuse only facts present on the page (business name, service, location, phone). A post-filter rejects any suggestion containing numbers, guarantees, awards, or locations that don't appear in page text (rule A-06).

---

## 4. Conversion Score (0–100) — Fully Deterministic

### 4.1 Rubric

| # | Component | Points | Scoring |
|---|---|---:|---|
| 1 | Primary CTA present & prominent | 30 | 0 if none; else `30 × min(1, P / 0.70)` where P = prominence (§4.2); −6 if below fold at 390×844 (partial credit remains) |
| 2 | CTA copy quality | 10 | 10 verb-led + specific ("Get a free quote"); 5 verb-led generic ("Contact us"); 0 non-actionable ("Submit", "Click here", "Learn more" as the only CTA) |
| 3 | Contact-path availability | 20 | 8 `tel:` link visible without scroll or in sticky header; 5 visible email/`mailto:`/messaging link; 7 form or booking widget reachable within 2 viewport heights. Sum capped at 20 |
| 4 | Form friction | 15 | Start 15; −1.5 per field beyond 3 (max −9); −3 if CAPTCHA; −2 if any field lacks an associated label; −1 if no `autocomplete` on name/email/phone; multi-step form −0 (neutral); no form present ⇒ awarded 15 only if a `tel:`/booking CTA exists, else 0 |
| 5 | Mobile ergonomics | 10 | 10 × share of interactive hero/CTA elements with tap target ≥ 48×48 px and ≥ 8 px spacing |
| 6 | Trust signals near CTA | 10 | Reviews/rating, guarantee, certification, client logos within 300 px of primary CTA: 10 ≥ 2 distinct types; 5 one type; 0 none |
| 7 | Persistent access | 5 | 5 sticky/fixed CTA or call button on scroll; else 0 |
| — | Overlay penalty | −0 to −15 | Modal/interstitial/cookie wall covering > 30% of viewport at 5 s: −8; > 60%: −15 (cookie banners < 30% ignored) |

`Conversion = clamp(round(Σ points − overlay_penalty), 0, 100)`

Critical override: if there is **no CTA and no contact path**, Conversion is capped at 20 and finding `CONV_NO_CONTACT_METHOD` (critical) is raised.

### 4.2 Primary CTA Prominence

Candidates: `button`, `a`, `input[type=submit|button]`, `[role=button]` visible in the first 2 viewport heights, with non-empty accessible name.

```
P = 0.28·A + 0.24·C + 0.18·Pos + 0.15·Copy + 0.10·Iso + 0.05·Shape
A     = min(1, bboxArea / 6000 px²)                              size (≈ 150×40)
C     = min(1, contrastVsSurroundings / 4.5)                     color contrast of button bg vs. adjacent bg
Pos   = 1 if fully above 844 px; 0.6 if top edge above 844; else 0.2
Copy  = verbScore(text)                                          lexicon: 1.0 specific action verb+object, 0.6 verb only, 0.2 generic, 0 none
Iso   = min(1, whitespaceRing / 24 px)                           clear space around the element
Shape = 1 if filled/solid or bordered button-like; 0.4 if plain text link
```

The **primary CTA** is the highest-P candidate; `P ≥ 0.55` counts as "prominent". Competing-CTA finding fires when ≥ 3 candidates in hero have `P ≥ 0.55` and pairwise |ΔP| < 0.08.

### 4.3 Detectors

| Detector | Method |
|---|---|
| Phone | `a[href^="tel:"]` visible; separately regex over visible text for phone patterns (E.164 & common national formats) not inside a `tel:` link ⇒ `CONV_PHONE_NOT_LINKED` |
| Email/messaging | `mailto:`, `wa.me`, `m.me`, `sms:` |
| Forms | `<form>` with ≥ 1 input excluding search/newsletter-footer forms unless they are the only form; label association via `for`/wrapping/`aria-label`; CAPTCHA via known widget selectors/iframes |
| Booking widgets | Known providers' iframe/script signatures (Calendly, Cal.com, Acuity, OpenTable, etc.) |
| Buried contact | Earliest y-position of any contact path > 2 × viewport height ⇒ `CONV_CONTACT_BURIED` |
| Dead CTA | Primary CTA `href` empty, `#`, or `javascript:void(0)` with no click handler evidence and no ancestor form ⇒ `CONV_CTA_DEAD_LINK` |
| Overlay | Fixed/absolute elements with z-index ≥ 1000 and viewport coverage computed from bboxes |

---

## 5. Overall Score, Grade, Priority

```
Overall = round(0.35·Speed + 0.35·Clarity + 0.30·Conversion)         (modules with status ≠ SUCCEEDED are excluded and weights renormalized; report is marked PARTIAL)
Grade   = A ≥ 90, B ≥ 75, C ≥ 55, D ≥ 35, else F
```

### 5.1 Priority (Top Fixes ordering)

```
priority = sev_weight × impact × conf / effort_cost
sev_weight : critical 8, high 5, medium 3, low 1, info 0
effort_cost: 1 → 1.0, 2 → 1.6, 3 → 2.6
conf       : evidence confidence 0.5–1.0 (measured = 1.0; AI-derived = model confidence)
impact     : 0.5–1.5 magnitude factor per finding type, e.g.
             SPEED_HEAVY_IMAGE:  clamp(0.5 + secondsSavedEstimate/4, 0.5, 1.5)
             CONV_*:             1.0 if in hero, 0.7 if below fold
```

Ties broken by `module` order (conversion > clarity > speed, because lead capture is the business outcome) then by finding code. The top 10 receive `rank` 1..10.

### 5.2 Severity Escalation Rules

| Condition | Escalation |
|---|---|
| `lcp_median > 6000 ms` | `SPEED_LCP_SLOW` → critical |
| Page unusable (no content rendered by 10 s) | Single critical finding `SPEED_LCP_SLOW` with evidence "blank" |
| `SPEED_HEAVY_IMAGE` on the LCP element | High → critical if transfer > 1.5 MB |
| Any critical finding | Overview shows "Fix this first" banner |

### 5.3 Estimated Impact Statements

Business-impact sentences use only sourced, conservative claims from the citation registry. Example: speed findings cite that longer mobile load times correlate with higher bounce probability (source, year, URL stored in the registry). The product never promises specific revenue gains; an optional **Lead-Loss Estimator** (roadmap) requires the user to input traffic and conversion rate and labels output as an illustrative estimate.

---

## 6. Finding Catalog (IDs match `schema.sql` → `finding_codes`)

Severity: 1 info · 2 low · 3 medium · 4 high · 5 critical. Effort: 1 < 15 min · 2 < 2 h · 3 developer.

### 6.1 Speed (1xx)

| ID | Code | Sev | Eff | Trigger | Params |
|---|---|:-:|:-:|---|---|
| 101 | SPEED_LCP_SLOW | 4 | 2 | LCP median > 3,000 ms | `lcp_ms`, `element_selector`, `element_type` |
| 102 | SPEED_HEAVY_IMAGE | 4 | 1 | Image transfer > 200 KB **and** above the fold or is LCP element | `url_hash`, `bytes`, `rendered_w`, `natural_w` |
| 103 | SPEED_IMAGE_FORMAT | 3 | 1 | JPEG/PNG > 100 KB where WebP/AVIF estimate saves ≥ 30% | `bytes`, `est_saving_bytes` |
| 104 | SPEED_IMAGE_OVERSIZED | 3 | 2 | Natural width > 2× rendered CSS width × DPR(3 → cap 2×) | `natural_w`, `rendered_w` |
| 105 | SPEED_LCP_IMAGE_DEPRIORITIZED | 4 | 1 | LCP element is an image with `loading="lazy"` or without `fetchpriority=high`/preload, and load delay > 500 ms | `selector`, `delay_ms` |
| 106 | SPEED_RENDER_BLOCKING | 4 | 2 | Render-blocking CSS/JS delaying FCP/LCP > 300 ms | `count`, `total_delay_ms`, `top_urls` |
| 107 | SPEED_LONG_TASKS_JS | 4 | 3 | TBT > 300 ms | `tbt_ms`, `top_scripts` (by blocking time) |
| 108 | SPEED_THIRD_PARTY_HEAVY | 3 | 2 | Third-party blocking time > 250 ms or > 40% of transfer | `blocking_ms`, `top_domains` |
| 109 | SPEED_TTFB_SLOW | 4 | 3 | TTFB > 800 ms (lab median) | `ttfb_ms`, `server_header`, `cdn_detected` |
| 110 | SPEED_NO_COMPRESSION | 3 | 1 | Text resources > 1.4 KB served without gzip/br totalling > 50 KB uncompressed | `bytes_wasted` |
| 111 | SPEED_NO_CACHE_HEADERS | 2 | 1 | Static assets lacking `Cache-Control` ≥ 7 days | `count`, `bytes` |
| 112 | SPEED_CLS_HIGH | 3 | 2 | CLS > 0.1 | `cls`, `shift_sources` (selectors lacking dimensions) |
| 113 | SPEED_FONT_BLOCKING | 3 | 1 | Web fonts without `font-display: swap/optional` delaying text render | `families`, `delay_ms` |
| 114 | SPEED_PAGE_WEIGHT | 3 | 2 | Transfer > 3 MB | `bytes`, `top_types` |
| 115 | SPEED_TOO_MANY_REQUESTS | 2 | 2 | Requests > 120 | `count` |
| 116 | SPEED_HEAVY_VIDEO | 3 | 1 | Video body > 2 MB fetched during initial load or autoplay above fold | `bytes`, `autoplay` |

### 6.2 Clarity (2xx)

| ID | Code | Sev | Eff | Trigger |
|---|---|:-:|:-:|---|
| 201 | CLARITY_HEADLINE_VAGUE | 4 | 1 | `headline_specificity ≤ 8` or generic phrase |
| 202 | CLARITY_NO_VALUE_PROP | 4 | 1 | `value_proposition ≤ 8` |
| 203 | CLARITY_NO_AUDIENCE | 3 | 1 | Comprehension `who_for` unanswerable |
| 204 | CLARITY_NEXT_STEP_UNCLEAR | 4 | 1 | Comprehension `next_step` unanswerable **or** no CTA in hero |
| 205 | CLARITY_WEAK_HIERARCHY | 3 | 2 | `visual_hierarchy ≤ 9` or `headline_ratio < 1.5` |
| 206 | CLARITY_GENERIC_IMAGERY | 3 | 2 | `imagery_relevance ≤ 9` |
| 207 | CLARITY_HERO_CLUTTER | 3 | 2 | `cognitive_load ≤ 9` or feature thresholds |
| 208 | CLARITY_LOW_CONTRAST_HEADLINE | 3 | 1 | `headline_contrast < 3:1` |
| 209 | CLARITY_HEADLINE_IN_IMAGE | 3 | 2 | Dominant text not in DOM |
| 210 | CLARITY_AUTO_CAROUSEL_HERO | 2 | 2 | Auto-advancing hero slider detected |

### 6.3 Conversion (3xx)

| ID | Code | Sev | Eff | Trigger |
|---|---|:-:|:-:|---|
| 301 | CONV_NO_PRIMARY_CTA | 5 | 1 | No candidate with `P ≥ 0.55` in first 2 viewports |
| 302 | CONV_CTA_BELOW_FOLD | 4 | 1 | Primary CTA top edge > 844 px |
| 303 | CONV_CTA_LOW_CONTRAST | 4 | 1 | CTA contrast vs. surroundings < 3:1 |
| 304 | CONV_CTA_GENERIC_COPY | 3 | 1 | Copy score ≤ 0.2 |
| 305 | CONV_CTA_COMPETING | 3 | 2 | ≥ 3 near-equal prominent CTAs in hero |
| 306 | CONV_NO_TEL_LINK | 4 | 1 | No `tel:` link on a page whose category heuristics suggest local/service business, or none visible on mobile |
| 307 | CONV_PHONE_NOT_LINKED | 3 | 1 | Phone number text not wrapped in `tel:` |
| 308 | CONV_CONTACT_BURIED | 4 | 1 | First contact path > 2 viewport heights down |
| 309 | CONV_FORM_TOO_LONG | 3 | 1 | Fields > 5 in primary form |
| 310 | CONV_FORM_CAPTCHA | 2 | 2 | Visible CAPTCHA challenge on primary form |
| 311 | CONV_FORM_NO_LABELS | 2 | 1 | Inputs without programmatic labels |
| 312 | CONV_TAP_TARGET_SMALL | 3 | 1 | < 48×48 px targets in hero/CTA area |
| 313 | CONV_INTRUSIVE_OVERLAY | 4 | 1 | Overlay covering > 30% of viewport at 5 s |
| 314 | CONV_NO_STICKY_CTA | 2 | 2 | No persistent CTA on a page > 3 viewports tall |
| 315 | CONV_NO_TRUST_NEAR_CTA | 2 | 1 | No trust signal within 300 px of primary CTA |
| 316 | CONV_NO_CONTACT_METHOD | 5 | 1 | No form, phone, email, booking, or messaging link |
| 317 | CONV_CTA_DEAD_LINK | 4 | 1 | Primary CTA has no functional destination |

### 6.4 Finding Object (in `report.v1`)

```json
{
  "code": "SPEED_HEAVY_IMAGE", "id": 102, "module": "speed", "severity": 4, "effort": 1,
  "priority": 6.42, "rank": 2, "confidence": 1.0,
  "params": { "bytes": 4402311, "rendered_w": 390, "natural_w": 3200, "url_hash": "9f2c…" },
  "evidence": [
    { "type": "request", "hash": "9f2c…", "bytes": 4402311, "start_ms": 640, "end_ms": 5810 },
    { "type": "bbox", "x": 0, "y": 88, "w": 390, "h": 240, "shot": "viewport" }
  ]
}
```

Text (headline, impact, plain fix, developer brief) is produced by **localized templates** keyed by `code` and filled from `params` at render time — so copy improvements ship instantly to all historical reports without migrations.

---

## 7. Accuracy Validation & Calibration

### 7.1 Golden Set

- **Size**: 600 sites (200 local services, 150 e-commerce, 100 SaaS/B2B, 100 content/blogs, 50 edge cases: SPA, non-English, heavy media, bot-protected).
- **Human labels**: 3 trained raters independently score Clarity sub-scores and note CTA/contact presence; disagreements adjudicated. Inter-rater reliability (ICC) must be ≥ 0.80 before labels are accepted.
- **Ground truth for deterministic modules**: hand-verified subset (200 sites) for CTA location, `tel:` presence, form fields, and overlay coverage.
- **Refresh**: 15% of sites rotated quarterly to prevent overfitting.

### 7.2 Acceptance Metrics

| Module | Metric | Requirement |
|---|---|---|
| Speed | Mean absolute difference vs. WebPageTest (same profile) on LCP | ≤ 15% median, ≤ 25% p90 |
| Speed | Test–retest σ of Speed score (10 runs/site) | ≤ 3 points (stable sites) |
| Clarity | MAE vs. human consensus (0–100) | ≤ 8 |
| Clarity | Spearman ρ vs. human ranking | ≥ 0.80 |
| Clarity | Test–retest σ (cache disabled) | ≤ 3 points |
| Clarity | Prompt-injection corpus (100 payloads) max score shift | ≤ 5 points |
| Conversion | Primary CTA detection: precision / recall | ≥ 0.92 / ≥ 0.90 |
| Conversion | `tel:`/form/email detection F1 | ≥ 0.97 |
| Conversion | Determinism | σ = 0 across repeated runs on the same capture |
| Findings | Human-judged "correct and useful" rate (sample of 500) | ≥ 90% |
| Findings | False-positive rate for critical severity | ≤ 3% |

### 7.3 Regression Policy

Any change to `scoring_version`, prompts, models, Chromium/Lighthouse, or throttling profile re-runs the golden set. Release is blocked if: median absolute score drift > 3 points (deterministic modules) or > 5 (Clarity), or any acceptance metric regresses. Intentional drift requires a `scoring_version`/`profile_version` bump and a visible "baseline reset" marker on trend charts.

### 7.4 Ongoing Calibration

1. In-product **"Was this finding accurate?"** thumbs feed a labeled queue; findings with < 80% approval over ≥ 50 votes are auto-flagged for review.
2. Weekly drift monitor compares the distribution of scores and finding rates to the trailing 8 weeks; > 2σ shifts alert.
3. Monthly error review of the 50 lowest-rated findings drives detector fixes; each fix adds a regression case to the golden set.

---

## 8. Edge-Case Handling (Accuracy)

| Case | Handling |
|---|---|
| Parked/maintenance page | Detected by heuristics (tiny DOM, phrases, registrar fingerprints) → no score, single critical finding |
| SPA with delayed render | Wait for DOM stability (no mutations 1 s) up to cap; if content appears after 5 s, Clarity evaluates the 5-s frame (as a visitor would) and adds note |
| Cookie wall blocking content | Second capture after CMP dismissal for Clarity; Conversion penalizes overlay separately |
| Non-English pages | Clarity confidence capped at 0.7; comprehension judged by multilingual model; note displayed |
| Geo-redirect / consent redirect | Record redirect chain; audit final URL; warn if final host differs from input |
| A/B test variants | Note possible variant; recommend re-audit; confidence −0.05 |
| Very long pages | Fullpage screenshot capped; below-fold detectors operate on DOM, not pixels |
| Dark hero video with white text | Contrast sampled from actual screenshot pixels, not CSS colors |
| RTL languages | Layout features mirror-aware; position metrics use logical start/end |
