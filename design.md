ConvertAudit AI — Design Specification

Interface layouts, UX paradigms, visual hierarchy, and component patterns. Design target: a non-technical business owner on a phone, and an agency user on a laptop.

1. Design Principles
#	Principle	Practical Rule
D1	Answer first	The first screen of any report states the grade and the single most important fix before any chart.
D2	Zero jargon in headlines	Technical terms appear only in expandable "Technical detail" sections, always with a tooltip definition.
D3	Show, don't tell	Every finding pairs text with a visual anchor: annotated screenshot, waterfall bar, or highlighted element.
D4	Progressive disclosure	Summary → finding → evidence → developer brief. Each layer is one click deeper.
D5	Wait gracefully	Audits take ~60–90 s. Streaming partial results converts waiting into reading.
D6	Agency-ready by default	Every surface that appears in a report is themeable via Brand Profile tokens.
2. Visual System
2.1 Design Tokens

Tokens are the single source of truth, delivered as CSS custom properties. Brand Profiles override the --brand-* group only; semantic status colors are never overridable, to preserve meaning.

css
:root {
  /* Brand (overridable per Brand Profile) */
  --brand-primary: #4F46E5;
  --brand-primary-contrast: #FFFFFF;
  --brand-accent: #0EA5E9;
  --brand-surface: #FFFFFF;
  --brand-ink: #0F172A;

  /* Semantic status (locked) */
  --status-critical: #DC2626;
  --status-high:     #EA580C;
  --status-medium:   #CA8A04;
  --status-low:      #2563EB;
  --status-good:     #16A34A;
  --status-info:     #64748B;

  /* Neutrals */
  --gray-50:#F8FAFC; --gray-100:#F1F5F9; --gray-200:#E2E8F0;
  --gray-500:#64748B; --gray-700:#334155; --gray-900:#0F172A;

  /* Spacing (4px base) */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --space-12:48px;

  /* Radius & elevation */
  --radius-sm:6px; --radius-md:12px; --radius-lg:20px;
  --shadow-1:0 1px 2px rgba(15,23,42,.08);
  --shadow-2:0 8px 24px rgba(15,23,42,.12);
}
2.2 Typography
Role	Font (fallback stack)	Size / Line	Weight
Display (grade, score)	Inter, system-ui, sans-serif	56 / 60	800
H1	Inter	32 / 40	700
H2	Inter	24 / 32	700
H3	Inter	18 / 26	600
Body	Inter	16 / 24	400
Caption	Inter	13 / 18	500
Mono (selectors, code)	JetBrains Mono, ui-monospace, monospace	13 / 20	400

Agency Brand Profiles may substitute the Display/H1/H2 font from a vetted list of 20 Google Fonts. Fonts are self-hosted and embedded in PDFs.

2.3 Color Usage Rules
Status colors always accompany an icon and a text label; color is never the sole signal (WCAG 1.4.1).
Minimum text contrast 4.5:1 (7:1 for body text in PDFs intended for print). Brand colors failing contrast are auto-adjusted for text use and the user is warned in the Brand editor.
Grade colors: A/B → --status-good, C → --status-medium, D → --status-high, F → --status-critical.
2.4 Responsive Breakpoints
Name	Min width	Layout
xs	0	Single column, bottom tab bar
sm	640 px	Single column, wider gutters
md	768 px	Two-column report (summary rail + content)
lg	1024 px	Left navigation + content + optional evidence drawer
xl	1280 px	Max content width 1200 px, centered
3. Information Architecture
Public
├── /                      Landing page + URL input (free teaser audit)
├── /pricing
├── /r/{shareToken}        Public shared report (respects Brand Profile)
└── /login, /signup

App (authenticated)
├── /app                   Dashboard (recent audits, credits, quick-audit bar)
├── /app/audits            Audit history with filters
├── /app/audits/{id}       Report view (tabs: Overview · Speed · Clarity · Conversion · Evidence)
├── /app/audits/{id}/export  Export dialog (PDF / JSON / share link)
├── /app/monitors          Scheduled re-audits and trend charts
├── /app/brands            Brand Profiles (agency)
├── /app/clients           Prospect/client folders (agency)
├── /app/team              Members and roles
├── /app/billing           Plan, credits, invoices
└── /app/settings          API keys, webhooks, account
4. Key Screen Layouts
4.1 Landing + Quick Audit (Desktop)
┌──────────────────────────────────────────────────────────────────────┐
│  [Logo]                       Pricing   Agencies   Log in  [Start]   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│      Find out why your website isn't bringing in leads.              │
│      Free audit in under 90 seconds. No jargon.                      │
│                                                                      │
│      ┌────────────────────────────────────────┐ ┌──────────────┐     │
│      │ https://yourbusiness.com               │ │ Audit my site│     │
│      └────────────────────────────────────────┘ └──────────────┘     │
│      ✓ Mobile speed   ✓ 5-second clarity   ✓ Lead-capture check      │
│                                                                      │
│      ┌── Sample report preview (annotated phone mockup) ──────┐      │
│      └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────┘

Free teaser audits show the overall grade plus 3 findings; remaining findings are blurred behind a signup gate. The URL field validates client-side (scheme auto-prepend, trims whitespace) and is authoritatively validated server-side.

4.2 Audit Progress Screen
┌──────────────────────────────────────────────────────────────────────┐
│  Auditing  yourbusiness.com                                 [Cancel] │
│                                                                      │
│  ████████████████░░░░░░░░░░░░  52%   ~35 s remaining                 │
│                                                                      │
│  ✔ Loaded page on a simulated phone            (4.1 s)               │
│  ✔ Measured speed & Core Web Vitals             → Speed: 61  [view]  │
│  ◐ Reading your homepage like a first-time visitor…                  │
│  ○ Looking for buttons, forms & phone links                          │
│  ○ Building your action plan                                         │
│                                                                      │
│  ┌── Live preview ─────────────────────┐                             │
│  │  [phone screenshot at t=5s]         │  ← appears as soon as       │
│  └─────────────────────────────────────┘    capture completes        │
└──────────────────────────────────────────────────────────────────────┘

Stage rows map 1:1 to Module Run states. Completed modules become clickable and open their result inline without leaving the page.

4.3 Report Overview (Desktop lg)
┌────────────┬─────────────────────────────────────────────────────────┐
│ yourbiz.com│  ┌─────────┐  Overall  58 / 100   Grade C · Leaking leads│
│ Sep 28 '26 │  │   C     │  "Fix the 3 items below to recover most of  │
│            │  │  58     │   the visitors you're losing on phones."    │
│ ▸ Overview │  └─────────┘                                             │
│   Speed    │  ┌ Speed 61 ┐ ┌ Clarity 47 ┐ ┌ Conversion 66 ┐           │
│   Clarity  │  └──────────┘ └────────────┘ └───────────────┘           │
│   Conversion                                                         │
│   Evidence │  TOP FIXES                                    Effort     │
│            │  1 ● Critical  Your main image is 4.2 MB      ▮▯▯ Easy   │
│ [Export ▾] │  2 ● High      No phone number tap-to-call    ▮▯▯ Easy   │
│ [Share]    │  3 ● High      Headline doesn't say what you  ▮▮▯ Medium │
│ [Re-audit] │                you sell                                  │
│            │  ▸ Show 7 more                                           │
└────────────┴─────────────────────────────────────────────────────────┘
4.4 Report Overview (Mobile xs)
Sticky top bar: domain + grade chip.
Vertical stack: Grade card → 3 score chips (horizontally scrollable) → Top Fixes list.
Bottom tab bar: Overview · Speed · Clarity · Conversion · More.
Export and Share collapse into a bottom sheet triggered by a floating action button.
4.5 Clarity Tab — the "5-Second View"
┌──────────────────────────────────────────────────────────────────────┐
│  What a first-time visitor sees at 5 seconds                         │
│  ┌──────────────┐   Score 47/100        Confidence: High             │
│  │  phone frame │   ─────────────────────────────────────           │
│  │  screenshot  │   Headline specificity        ▮▮▯▯▯  6/20         │
│  │  with pins   │   Value proposition           ▮▮▮▯▯ 10/20         │
│  │  ① ② ③       │   Visual hierarchy            ▮▮▯▯▯  8/20         │
│  └──────────────┘   Imagery relevance           ▮▮▮▮▯ 13/20         │
│                     Cognitive load              ▮▮▯▯▯ 10/20         │
│                                                                      │
│  ① Headline: "Welcome to our website"                                │
│     Problem: says nothing about what you sell.                       │
│     Suggested rewrite: "Emergency plumbing in Leeds — at your door   │
│     within 60 minutes"                        [Copy]                 │
└──────────────────────────────────────────────────────────────────────┘

Numbered pins on the screenshot correspond to numbered findings; hovering (or tapping) a pin highlights its finding and vice versa.

4.6 Speed Tab
Headline gauge: mobile load time vs. the 3-second line.
Core Web Vitals strip: LCP, CLS, TBT (labelled "responsiveness proxy"), TTFB with band coloring.
Field vs Lab toggle: shows CrUX data when available; otherwise displays "Not enough real-visitor data for this site."
Waterfall: horizontal request timeline, sortable by size or duration; heavy scripts and images pre-highlighted.
Weight breakdown: stacked bar by resource type; third-party domains listed with blocking time contribution.
4.7 Conversion Tab

Annotated screenshot with overlays: green outline = detected Primary CTA, red dashed outline = missing/buried zone, blue outline = phone/email links. A checklist below lists each rubric line as Pass / Warn / Fail with the point value earned.

4.8 Agency Brand Editor
┌───────────────────────────┬──────────────────────────────────────────┐
│ Brand Profile: "Acme Web" │  LIVE PREVIEW (PDF page 1)               │
│ Logo      [Upload]        │  ┌────────────────────────────────┐      │
│ Primary   [■ #1D4ED8]     │  │ [Acme logo]   Website Audit    │      │
│ Accent    [■ #F59E0B]     │  │ for Prospect Co.               │      │
│ Font      [Inter ▾]       │  │        Grade C · 58/100        │      │
│ Contact   [text]          │  └────────────────────────────────┘      │
│ Footer    [text]          │  Contrast check: ✔ AA passed             │
│ CTA link  [https://…]     │  [Page 1] [Page 2] [Last page]           │
│ Domain    reports.acme.com│                                          │
│ [Save]  [Set as default]  │                                          │
└───────────────────────────┴──────────────────────────────────────────┘

The preview re-renders through the same template the PDF worker uses, guaranteeing parity.

5. Component Library
Component	Variants / States	Notes
UrlInput	idle, focus, invalid, submitting	Auto-prepends https://; inline validation messages
GradeBadge	A–F, sm/md/lg	Letter + color + label text
ScoreRing	0–100, animated	Respects prefers-reduced-motion
MetricTile	good / needs-improvement / poor / unavailable	Shows value, unit, band, tooltip
FindingCard	collapsed, expanded, dismissed, resolved	Severity chip, effort meter, "Copy dev brief"
SeverityChip	critical/high/medium/low/info	Icon + text + color
EffortMeter	1–3 pips	Easy / Medium / Developer needed
EvidenceViewer	screenshot, DOM snippet, waterfall row	Zoom, pan, pin overlay
Waterfall	sort by start/size/duration	Virtualized for 300+ rows
ProgressStepper	pending, running, done, failed, skipped	Live via SSE
PhoneFrame	390×844	Frames screenshots consistently
ExportDialog	PDF, JSON, link	Shows brand selector and page-range options
BrandPreview	live	Uses production PDF template
Paywall	teaser blur	Blurs findings ≥ #4 for free tier
EmptyState	first-run, no-results	Always includes a single primary action
Toast / InlineAlert	info, success, warn, error	aria-live="polite" (assertive for errors)
5.1 FindingCard Anatomy
┌──────────────────────────────────────────────────────────────┐
│ ● HIGH   Speed   Effort ▮▯▯                       [⋯ menu]  │
│ Your homepage image is 4.2 MB — phones wait 3 extra seconds  │
│ Why it matters: 53% of mobile visitors leave pages that      │
│ take over 3 seconds. (Google/SOASTA research)                │
│ ┌ Evidence ─────────────────────────────────────────────┐    │
│ │ hero-banner.png · 4.2 MB · loads at 5.8 s             │    │
│ └───────────────────────────────────────────────────────┘    │
│ ▸ How to fix (plain English)                                 │
│ ▸ Developer brief   [Copy]                                   │
│ ▸ Technical detail                                           │
└──────────────────────────────────────────────────────────────┘

Order within a card is fixed: headline → impact → evidence → fix → dev brief → technical detail.

6. UX Paradigms & Interaction Patterns
Pattern	Specification
Streaming results	Server-Sent Events push module completions. UI appends results without layout shift (reserve skeleton heights).
Optimistic actions	Marking a finding "Resolved" updates UI immediately; reverts with a toast on failure.
Re-audit diffing	Re-running an audit shows deltas: ▲ +12 Speed, resolved findings struck through, new findings tagged NEW.
Copy-first	Suggested headlines, dev briefs, and selectors have one-click copy with confirmation.
Undoable destructive actions	Deleting an audit soft-deletes for 30 days with an Undo toast.
Contextual upsell	Upgrade prompts appear only at natural blocks (locked findings, export, brand editor), never as modal interruptions during an audit.
Error transparency	If a site blocks our crawler, the UI says so and explains what it means, with a recovery action ("Try again", "Whitelist our IP range").
6.1 Loading, Empty, and Error States
State	Presentation
Loading	Skeletons matching final layout; no spinners over 400 ms without progress text
Empty history	Illustration-free card: "Run your first audit" + UrlInput
Partial audit	Banner: "Clarity analysis unavailable. Speed and Conversion are complete." + Retry module button
Blocked target	"This site refused our visit (HTTP 403 / bot protection)." + guidance
Invalid target	Inline error under input: "We can only audit public websites." No internal detail leaked
Quota exhausted	Non-blocking banner with credit count and upgrade/top-up buttons
7. White-Label Report (PDF) Layout
Page	Content
1 — Cover	Agency logo, prospect domain, date, grade badge, overall score, optional prepared-for/by
2 — Executive summary	3-sentence narrative, three module scores, top 3 fixes
3 — Speed	Load-time gauge, Core Web Vitals table, top 5 heavy resources
4 — Clarity	5-second screenshot with pins, sub-score bars, suggested rewrites
5 — Conversion	Annotated screenshot, rubric checklist
6 — Action plan	Ordered fix list with effort and impact, grouped "Do today / This week / Hand to developer"
7 — Next steps	Agency contact block, CTA button/QR to booking link, custom footer, optional disclaimer
Page size A4 or US Letter (tenant setting). Margins 18 mm.
Fonts embedded; images at 2× density; target file size ≤ 3 MB.
"Powered by ConvertAudit AI" footer is mandatory on Starter, removable on Agency and above.
Every PDF includes tagged-PDF structure and alt text on screenshots for accessibility.
8. Accessibility Requirements (WCAG 2.2 AA)
Full keyboard operability; visible focus ring (2 px, --brand-primary, 3:1 against adjacent colors).
Tap targets ≥ 44×44 px in the app UI.
Screenshot annotations expose a text-equivalent list of pins in DOM order.
Charts provide a data-table alternative via "View as table."
Motion respects prefers-reduced-motion; progress announcements use aria-live.
Form errors are programmatically associated (aria-describedby) and never color-only.
9. Content & Microcopy Guidelines
Rule	Example
Lead with the visitor's experience	✔ "Phone visitors wait 5.8 s to see your main image." ✘ "LCP is 5.8 s."
Use second person, active voice	✔ "Add a phone button." ✘ "A phone button should be added."
Quantify impact when sourced	✔ "Pages loading in over 3 s lose more than half of mobile visitors." Only cite statistics with a documented source in the citation registry.
Never blame	✔ "Your hero doesn't yet say what you sell." ✘ "Your headline is bad."
Fix instructions ≤ 3 steps for owners	Longer procedures move to the Developer Brief
9.1 Developer Brief Template
Task: Compress and resize hero image
Where: <img class="hero__img"> on https://example.com/
Problem: 4.2 MB PNG, 3200×1800, served to a 390 px-wide viewport
Target: ≤ 150 KB WebP/AVIF, width ≤ 800 px, add width/height attributes and fetchpriority="high"
Verify: LCP ≤ 2.5 s on mobile emulation; re-run ConvertAudit to confirm
10. Design QA Checklist (Release Gate)
 All status colors pair with icon + text
 Every report screen tested at 360, 390, 768, 1280 px
 PDF renders identically in preview and export (pixel-diff threshold ≤ 0.5%)
 Brand override with extreme colors (pure yellow on white) triggers contrast auto-correction
 Long domain names (≥ 63 chars) and non-Latin text do not break layouts
 Right-to-left content in audited pages does not affect UI direction
 Axe-core automated run reports zero serious/critical violations