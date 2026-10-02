ConvertAudit AI — Knowledge Base

Canonical reference for what ConvertAudit AI is, why it exists, the vocabulary it uses, and the principles every engineering decision must respect.

1. System Overview

ConvertAudit AI is a multi-tenant SaaS platform that accepts a public business URL and returns, within roughly 60–90 seconds, a plain-language report explaining why the site is failing to convert visitors into leads, and precisely what to fix.

Attribute	Value
Primary users	Small-business owners (self-serve), digital agencies and consultants (white-label)
Input	A single public URL (homepage by default; optional up to 5 additional pages on paid tiers)
Output	Interactive web report, exportable PDF, machine-readable JSON
Time-to-first-insight target	≤ 20 s (speed module streams first)
Time-to-complete target (p95)	≤ 90 s
Audit device profile	Mobile-first (emulated mid-tier Android, throttled 4G)
1.1 Problem Statement

Small-business owners see traffic but no leads and cannot diagnose why. Existing tools (Lighthouse, PageSpeed Insights, GTmetrix) emit developer-oriented metrics with no prioritization and no link to revenue. Agencies rebuild the same manual audit for every prospect, which does not scale for outbound sales.

1.2 Solution Summary

Four capability pillars, each producing structured Findings that feed a single scoring engine:

Pillar	Module ID	Question it answers
Mobile Speed & Core Web Vitals	speed	Does the page load fast enough on a phone that visitors stay?
AI Clarity ("5-Second Rule")	clarity	Can a stranger tell what this business does and what to do next within 5 seconds?
CTA & Conversion Friction	conversion	Is there an obvious, reachable, working way to become a lead?
White-Label Report Generator	report	Can an agency ship this as a branded lead magnet without touching a design tool?

speed, clarity, and conversion are analysis modules. report is a presentation module that consumes their output.

2. Core Philosophy
Business language first. Every finding has a plain-English headline ("Your phone visitors wait 5.8 seconds before seeing your main image"), a business-impact sentence, and only then the technical detail.
Prioritized, never exhaustive. A report shows at most 10 prioritized fixes. Additional findings are retained but collapsed. Owners act on short lists.
Evidence-backed. Every finding carries evidence: a screenshot crop with a bounding box, a DOM selector, a waterfall entry, or a measured value. No unverifiable claims.
Deterministic where possible, generative where necessary. Metrics, DOM checks, and thresholds are deterministic code. The LLM is used only for judgment tasks (headline strength, value-proposition clarity) and for rewording, never for measurement.
Honest about uncertainty. AI-derived scores carry a confidence value; low-confidence results are labelled "Needs human review" rather than presented as fact.
Hand-off ready. Each fix includes a "Developer Brief" block that can be copied to a freelancer verbatim.
Safe by default. The platform fetches arbitrary third-party URLs. Treating every target as hostile is a foundational assumption (see security.md).
3. Domain Concepts
3.1 Entities
Concept	Definition
Tenant	Billing and isolation boundary. Either an individual (type=solo) or an agency (type=agency).
User	A person belonging to exactly one Tenant with a role (owner, admin, member, viewer).
Brand Profile	Agency-defined white-label identity: logo, colors, fonts, contact block, custom domain, footer text.
Audit	One execution of the analysis pipeline against one Target. Immutable once terminal.
Target	Canonical, normalized URL plus resolved final URL after redirects.
Module Run	The execution of a single analysis module within an Audit, with its own status and timing.
Finding	An atomic, evidenced observation with severity, category, impact estimate, and remediation.
Score	0–100 value per module plus a weighted overall score.
Report	A rendered representation of an Audit (web view, PDF, JSON) bound to a Brand Profile.
Artifact	Binary output stored in object storage: screenshots, HAR files, PDFs.
Credit	Unit of consumption. 1 Credit = 1 single-page audit.
3.2 Key Terms
Term	Definition
Lab data	Metrics measured in a controlled synthetic run by our workers.
Field data	Real-user metrics from the Chrome UX Report (CrUX), when available for the origin. Shown alongside lab data, never blended.
LCP	Largest Contentful Paint. Good ≤ 2.5 s, Needs Improvement ≤ 4.0 s, Poor > 4.0 s.
CLS	Cumulative Layout Shift. Good ≤ 0.10, Needs Improvement ≤ 0.25, Poor > 0.25.
INP	Interaction to Next Paint. Good ≤ 200 ms, Needs Improvement ≤ 500 ms, Poor > 500 ms. Field-only; lab runs report TBT (Total Blocking Time) as the proxy and label it as such.
TTFB	Time to First Byte. Flag if > 800 ms in lab.
3-Second Rule	Product threshold: if the mobile lab LCP exceeds 3.0 s, the page is flagged as "losing visitors." This is stricter than Google's 2.5 s "good" bound only for messaging emphasis; classification labels still follow Google's bands.
5-Second Rule	The above-the-fold view captured at 5 s after navigation start must let a naive viewer answer: What is this? Who is it for? What do I do next?
Hero Section	The first viewport-height region (390×844 CSS px on the mobile profile) below the header.
Primary CTA	The single most visually and semantically prominent conversion action in the hero.
Conversion Friction	Any element or absence that increases effort between arrival and lead submission.
Tap Target	Interactive element; must be ≥ 48×48 CSS px with ≥ 8 px spacing.
3.3 Scoring Model
Overall = round( 0.35·Speed + 0.35·Clarity + 0.30·Conversion )
Range	Grade	Label
90–100	A	Converting well
75–89	B	Solid, minor leaks
55–74	C	Leaking leads
35–54	D	Serious problems
0–34	F	Visitors are leaving

Speed (0–100) — weighted: LCP 35%, TBT 20%, CLS 15%, TTFB 10%, total transfer weight 10%, request count and third-party share 10%. Each sub-metric maps to 0–100 via log-normal curves anchored at Google's "good" (score 90) and "poor" (score 50) thresholds.

Clarity (0–100) — five AI-graded sub-scores, 0–20 each: headline specificity, value-proposition completeness (what/who/why), visual hierarchy, imagery relevance, and cognitive load. Sub-scores are averaged across 3 independent model passes; variance above 8 points marks the result low-confidence.

Conversion (0–100) — rubric-based, deterministic: CTA presence and prominence (30), CTA copy quality (10), contact-path availability (phone tel:, email, form) (20), form friction (field count, required fields, CAPTCHA) (15), tap-target and mobile ergonomics (10), trust signals near CTA (10), sticky/persistent CTA (5).

3.4 Finding Severity
Severity	Meaning	Score penalty cap per finding
critical	Directly blocks or severely suppresses lead capture	25
high	Materially reduces conversion	12
medium	Noticeable friction	6
low	Polish or hygiene	2
info	Observation, no penalty	0

Priority = severity_weight × estimated_impact × (1 / effort), where effort ∈ {1 = under 15 min, 2 = under 2 h, 3 = developer needed}. Priority orders the "Top 10 Fixes."

4. Foundational Architecture Principles
#	Principle	Implication
P1	Asynchronous by default	No audit work occurs in an HTTP request. API enqueues and returns 202 Accepted with an Audit ID.
P2	Isolation of untrusted execution	All browser activity runs in ephemeral, network-restricted sandboxes with no access to internal services.
P3	Idempotency	Every mutating endpoint accepts an Idempotency-Key. Workers tolerate at-least-once job delivery.
P4	Immutable audits	A completed Audit is never edited. Re-running creates a new Audit linked by previous_audit_id for trend comparison.
P5	Module independence	Modules share only the Capture Bundle (DOM snapshot, screenshots, HAR). One module failing yields a PARTIAL audit, not a failed one.
P6	Capture once, analyze many	A single browser session produces the Capture Bundle; analysis modules read it without touching the target again.
P7	Tenant-scoped everything	Every row, object key, cache key, and queue message carries tenant_id; access is enforced at the data layer.
P8	Structured AI I/O	LLM calls use strict JSON schemas, temperature ≤ 0.2, versioned prompts, and schema validation with bounded retries.
P9	Observable by construction	Every job emits trace spans, structured logs, and cost attribution (browser-seconds, LLM tokens) per audit.
P10	Graceful degradation	Vision model outage → Clarity reports "unavailable" while Speed and Conversion still ship.
5. Scope Boundaries

In scope (v1): public, unauthenticated pages; mobile profile; English-language clarity evaluation; single-page audit plus up to 5 extra pages on paid tiers; PDF export; white-label branding; REST API; scheduled re-audits.

Out of scope (v1): pages behind login; A/B test execution; heatmaps or session replay; automatic code changes to the customer's site; non-English clarity grading (metrics and DOM checks still work); desktop-profile scoring (desktop capture is available as an informational add-on only).

6. Technology Baseline
Concern	Choice	Rationale
Web app	Next.js (React, TypeScript)	SSR for shareable report pages, strong ecosystem
API	Node.js + Fastify (TypeScript), OpenAPI 3.1	Schema-first validation, low overhead
Job queue	BullMQ on Redis	Priorities, rate limiting, retries, delayed jobs
Primary DB	PostgreSQL 16 with Row-Level Security	Relational integrity and tenant enforcement
Cache / ephemeral	Redis 7	Rate-limit counters, SSE fan-out, dedupe locks
Object storage	S3-compatible with per-tenant prefixes, SSE-KMS	Screenshots, HAR, PDFs
Browser automation	Playwright + Chromium, Lighthouse 12	Consistent lab metrics and DOM access
Vision / language AI	Claude models via the Anthropic API	Vision input plus strict structured output
PDF rendering	Headless Chromium from HTML templates	Pixel-consistent branded output
Billing	Stripe (subscriptions + metered credits)	Standard, PCI scope stays with Stripe
Observability	OpenTelemetry → Prometheus/Grafana, Loki, Sentry	Unified tracing, metrics, logs
Infrastructure	Kubernetes, Terraform-managed	Node pools separate control plane from untrusted browser workers