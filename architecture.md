ConvertAudit AI — System Architecture

Component breakdown, system layers, data flow, storage model, and deployment topology.

1. Architecture at a Glance

The system is a modular monolith control plane (API + web) paired with a horizontally scaled, isolated worker plane that executes untrusted browser sessions. The two planes communicate only through a durable queue and object storage; workers have no inbound access and no path to the control-plane network.

1.1 ASCII System Diagram
                                   ┌──────────────────────────┐
                                   │   Users / Agencies       │
                                   │  Browser · Mobile · API  │
                                   └────────────┬─────────────┘
                                                │ HTTPS
                              ┌─────────────────▼──────────────────┐
                              │  Edge: CDN + WAF + DDoS + Bot mgmt │
                              └───────┬──────────────────┬─────────┘
                                      │                  │
                        ┌─────────────▼───────┐   ┌──────▼───────────────────┐
                        │  Web App (Next.js)  │   │ Artifact CDN (cookieless)│
                        │  SSR · Report pages │   │ screenshots · PDFs       │
                        └─────────────┬───────┘   └──────▲───────────────────┘
                                      │ REST / SSE       │ signed URLs
   ═══════════════════════════════════▼══════════════════│═══════ CONTROL PLANE ═
   ┌──────────────────────────────────────────────────────┴───────────────────┐
   │                        API Gateway (Fastify)                             │
   │  AuthN · AuthZ(policy) · Rate limit · Idempotency · Validation · SSE hub │
   ├───────────┬────────────┬─────────────┬─────────────┬─────────────────────┤
   │ Audit Svc │ Report Svc │ Brand Svc   │ Billing Svc │ Identity/Tenant Svc │
   │ (orchestr)│ (PDF/JSON) │ (white-label│ (credits,   │ (users, roles, keys)│
   │           │            │  + domains) │  Stripe)    │                     │
   └─────┬─────┴──────┬─────┴──────┬──────┴──────┬──────┴──────────┬──────────┘
         │            │            │             │                 │
   ┌─────▼────┐  ┌────▼──────┐ ┌───▼────────┐ ┌──▼────────┐  ┌─────▼─────┐
   │PostgreSQL│  │  Redis    │ │Object Store│ │  Stripe   │  │  Secrets  │
   │ (RLS)    │  │ cache/pub │ │ S3 + KMS   │ │           │  │  + KMS    │
   └─────▲────┘  └────┬──────┘ └───▲────────┘ └───────────┘  └───────────┘
         │            │            │
         │      ┌─────▼────────────┴───────┐
         │      │  Job Queues (BullMQ)     │  capture · analyze · score
         │      │  + DLQ + Scheduler       │  render · monitor
         │      └─────┬────────────────────┘
   ══════│════════════│═══════════════════════════════════ WORKER PLANE ═════
         │            │  (private subnets, egress-only, no control-plane access)
         │   ┌────────▼──────────────────────────────────────────────────┐
         │   │  Capture Workers (ephemeral sandbox per audit)            │
         │   │  ┌─────────────────────────────────────────────────────┐  │
         │   │  │ gVisor/Firecracker microVM                          │  │
         │   │  │  Chromium + Playwright + Lighthouse                 │  │
         │   │  │  ── egress via SSRF-guard proxy ──────────────┐     │  │
         │   │  └───────────────────────────────────────────────┼─────┘  │
         │   └──────────────────────────────────────────────────┼────────┘
         │                                                      │
         │   ┌──────────────────────────────┐        ┌──────────▼─────────┐
         └───┤ Analysis Workers (no browser)│        │ SSRF-Guard Egress  │
             │  speed · conversion · scorer │        │ Proxy (DNS pin,    │
             │  clarity (LLM client)        │        │ IP allow/deny, TLS)│
             └───────┬──────────────────────┘        └──────────┬─────────┘
                     │ HTTPS (allow-listed)                     │
             ┌───────▼─────────┐                       ┌────────▼─────────┐
             │ Anthropic API   │                       │  PUBLIC INTERNET │
             │ (vision + JSON) │                       │  (audited sites) │
             └─────────────────┘                       └──────────────────┘
             ┌────────────────────┐   ┌───────────────────────────────────┐
             │ Render Workers     │   │ Observability: OTel → Prometheus, │
             │ (HTML→PDF, Chromium│   │ Loki, Tempo, Sentry, cost meter   │
             │  isolated, no net) │   └───────────────────────────────────┘
             └────────────────────┘
2. System Layers
Layer	Responsibility	Technologies	May call
L1 — Presentation	UI, SSR reports, SSE subscription	Next.js, React, Tailwind, Recharts	L2 only
L2 — API / Application	Auth, validation, orchestration, policy	Fastify, Zod/TypeBox, OpenAPI	L3, queues
L3 — Domain Services	Audit lifecycle, scoring rules, billing, brand	TypeScript modules with explicit ports	L4
L4 — Persistence & Messaging	Data, cache, queue, object storage	PostgreSQL, Redis, BullMQ, S3	—
L5 — Execution (Worker Plane)	Untrusted browsing, analysis, AI, rendering	Playwright, Lighthouse, Python/TS analyzers	L4 (queues/storage only), SSRF proxy, AI API

Dependency rule: calls only flow downward. L5 never calls L2/L3 directly; it reports results through queue events and object-store writes, which the Audit Service consumes.

3. Component Breakdown
3.1 Web App (Next.js)
Server-rendered public report pages (/r/{token}) with per-tenant theming from Brand Profile tokens.
Client SSE subscription per active audit (GET /v1/audits/{id}/events).
No direct access to the database or queue; all data via the API.
3.2 API Gateway
Concern	Implementation
AuthN	Session cookies (web, HttpOnly; Secure; SameSite=Lax) and API keys/JWT (programmatic)
AuthZ	Central policy.can(actor, action, resource) module, deny-by-default
Validation	JSON-schema per route; unknown properties rejected
Idempotency	Idempotency-Key header, keyed in Redis for 24 h, response replay
Rate limiting	Sliding window in Redis, dimensions: IP, tenant, API key, target domain
SSE hub	Subscribes to Redis pub/sub channel audit:{id}; fan-out to connected clients
3.3 Audit Service (Orchestrator)

Owns the audit state machine and job DAG.

Validates and normalizes the target (syntactic checks only; network validation happens in the worker plane).
Reserves credits, creates audits and module_runs rows in one transaction.
Enqueues the capture job; on capture.completed fans out analyze.speed, analyze.conversion, analyze.clarity in parallel; on all module terminal states enqueues score.
Applies timeout watchdogs (E-01) and publishes progress events.
3.4 Capture Worker

Runs one audit's browser session inside an ephemeral sandbox and produces the Capture Bundle:

Artifact	Content	Consumer
lighthouse.json (×3 runs)	Metrics, audits, network requests, diagnostics	Speed
har.json (sanitized)	Full request waterfall, sizes, timings, initiators	Speed
dom.json	Serialized post-load DOM with computed style subset, bounding boxes, accessibility tree	Conversion, Clarity
viewport-5s.png	Screenshot at t=5 s (mobile profile)	Clarity
fullpage.jpg	Full-page screenshot (capped 8,000 px height)	Evidence, Report
text-hero.json	Visible text in hero region ordered by visual prominence	Clarity
meta.json	Final URL, redirect chain, TLS info, response headers (filtered), profile_version	All

Steps: (1) allocate sandbox → (2) launch Chromium via proxy → (3) throttle → (4) navigate with pinned DNS → (5) timeline capture → (6) hover/scroll pass for lazy elements → (7) extract DOM/screenshots → (8) sanitize → (9) upload to s3://…/{tenant}/{audit}/capture/ → (10) emit capture.completed → (11) destroy sandbox.

3.5 Speed Analyzer

Deterministic. Inputs: lighthouse.json, har.json, optional CrUX API response.

Computes median-of-3 metrics; classifies per Google bands and the 3-second product flag.
Heavy asset detection: images > 200 KB or > 2× rendered size, uncompressed text resources, render-blocking scripts/styles, JS with > 50 ms long tasks, third-party scripts ranked by main-thread blocking time.
Server response: TTFB > 800 ms; no compression (gzip/br); missing cache headers; no CDN signature.
Layout stability: attributes CLS to specific DOM nodes lacking dimensions.
Emits Finding[] with evidence pointers into the HAR/waterfall.
3.6 Clarity Analyzer (AI)
viewport-5s.png ─┐
text-hero.json  ─┼─► Prompt Builder ─► LLM (3 passes, JSON schema) ─► Validator ─► Aggregator ─► Findings
layout-metrics  ─┘   (versioned,          temp ≤ 0.2                  (repair ≤2)    (median, variance)
                      delimited data)
Inputs are pre-digested: the model receives the screenshot and a compact JSON of hero text blocks (text, font size, position, contrast) rather than raw HTML, reducing injection surface and token cost.
Output schema (excerpt):
json
{
  "what_offered":   { "answer": "string|null", "confidence": 0.0 },
  "who_for":        { "answer": "string|null", "confidence": 0.0 },
  "next_step":      { "answer": "string|null", "confidence": 0.0 },
  "subscores": {
    "headline_specificity": 0, "value_proposition": 0,
    "visual_hierarchy": 0, "imagery_relevance": 0, "cognitive_load": 0
  },
  "issues": [{ "code": "string", "pin": {"x":0,"y":0,"w":0,"h":0}, "explanation": "string", "suggested_rewrite": "string|null" }]
}
A blind-comprehension test is used: pass 1 asks the model to infer what the business does without the site's meta description; the answer is compared to the ground truth extracted from <title>/meta/JSON-LD. Mismatch drives the headline-clarity penalty.
Graceful degradation per P10.
3.7 Conversion Analyzer

Deterministic DOM rules over dom.json:

Detector	Method
Primary CTA	Candidates: <button>, <a> styled as buttons, input[type=submit]. Rank by area, contrast vs. background, above-fold position, verb-led copy match against a lexicon (e.g., "Get a quote", "Book", "Call"). Top candidate must be in the hero and have prominence score ≥ threshold.
Phone link	a[href^="tel:"] present, visible, tap target ≥ 48 px; flag phone number text not wrapped in tel:.
Email / messaging	mailto:, WhatsApp, Messenger links
Forms	Count fields, required fields, presence of CAPTCHA, multi-step, label association, autocomplete attributes
Buried contact	Contact info located only in footer / > 2 viewport heights below fold
Confusing layout	> 3 competing high-prominence CTAs in hero; CTA copy generic ("Submit", "Click here"); popups/overlays covering > 30% of viewport
Sticky CTA	position: fixed/sticky elements containing CTA/phone
Trust near CTA	Reviews, badges, guarantees within 300 px of the primary CTA

Emits findings with DOM selectors and bounding boxes for overlay rendering.

3.8 Scoring Engine

Pure function: (findings[], metrics, weights@version) → Scores. Versioned weights (scoring_version) stored with each audit for reproducibility. Produces the ordered Top Fixes by priority formula in knowledge.md §3.4, plus the narrative summary (a constrained LLM call that only rephrases already-computed facts, and is skipped if AI is unavailable in favor of a template).

3.9 Report Service
Output	Mechanism
Web report	Data-driven React views reading the audit JSON
JSON	Versioned schema report.v1, published in the OpenAPI spec
PDF	Render Worker loads an internal HTML template with Brand Profile tokens and audit data, prints via Chromium to PDF; no network access, all assets inlined from object storage
Share link	Opaque 128-bit token → audit + brand snapshot; revocable
3.10 Brand Service

Stores Brand Profiles, validates uploads, runs contrast checks, manages custom domains (DNS TXT verification, ACME certificate issuance, edge routing map). Brand data is snapshotted into the report at generation time, so later brand edits don't silently alter shared historical reports unless regenerated.

3.11 Monitor Scheduler

Cron-like service creating scheduled audits per monitor (daily, weekly, monthly); enforces credit reservation; computes diffs versus the previous audit with matching profile_version; triggers webhook/email on score drops ≥ 10 points.

3.12 Notification & Webhook Dispatcher

Events: audit.completed, audit.failed, monitor.regression. Webhooks are signed (HMAC-SHA256, timestamped), retried with exponential backoff (up to 8 attempts over 24 h), and delivered from a dedicated egress that applies the same SSRF-guard rules to customer webhook URLs.

4. Data Flow Patterns
4.1 Primary Audit Flow (Sequence)
User        API        AuditSvc     Queue      CaptureWkr   ObjStore   Analyzers    Redis(pub)   Web(SSE)
 │ POST /audits │          │           │            │           │           │            │           │
 ├─────────────►│ validate │           │            │           │           │            │           │
 │              ├─────────►│ tx: audit+module_runs+credit reserve            │            │           │
 │              │          ├──enqueue capture──────►│           │           │            │           │
 │◄─202 {id}────┤          │           │            │           │           │            │           │
 │ GET /events (SSE)──────────────────────────────────────────────────────────────────────────────────►│
 │              │          │           │──deliver──►│ sandbox up│           │            │           │
 │              │          │           │            │ browse via SSRF proxy │            │           │
 │              │          │           │            ├─upload bundle────────►│            │           │
 │              │          │◄──capture.completed────┤           │           │            │           │
 │              │          ├──enqueue speed/conv/clarity───────────────────►│            │           │
 │              │          │           │            │           │◄──read────┤            │           │
 │              │          │◄──module.completed(speed)─────────────────────┤            │           │
 │              │          ├──publish progress────────────────────────────────────────►│──────────►│
 │              │          │◄──module.completed(conv), (clarity)───────────┤            │           │
 │              │          ├──enqueue score────────►│──► scorer │           │            │           │
 │              │          │◄──scored───────────────┤           │           │            │           │
 │              │          ├ tx: audit=COMPLETE, commit credit  │           │            │           │
 │              │          ├──publish audit.completed─────────────────────────────────►│──────────►│
4.2 White-Label PDF Flow
POST /v1/audits/{id}/exports {format:"pdf", brand_id} → 202 + export ID.
Report Service snapshots brand + audit JSON → enqueues render.
Render Worker (no network) pulls assets from object storage, prints PDF, uploads to exports/{tenant}/{export}.pdf, and emits export.completed.
Client polls or receives SSE/webhook; downloads via short-lived signed URL (5 min).
4.3 Event Envelope (Internal Bus)
json
{
  "event_id": "01J…",           
  "type": "capture.completed",
  "tenant_id": "ten_…",
  "audit_id": "aud_…",
  "occurred_at": "2026-09-28T10:15:30.123Z",
  "attempt": 1,
  "payload": { "bundle_prefix": "s3://…/capture/", "profile_version": "m1.4" },
  "trace_id": "4bf92f35…"
}

Consumers deduplicate on event_id.

4.4 Consistency & Failure Semantics
Concern	Approach
Exactly-once effects	At-least-once delivery + idempotent handlers keyed on (audit_id, module, attempt-independent step)
Transactional outbox	State changes and outbound events are written in one DB transaction to an outbox table; a relay publishes to the queue
Partial failure	Module failure marks that Module Run FAILED; audit becomes PARTIAL if ≥ 1 module succeeded
Retries	Capture: 2 retries (exponential 5 s, 20 s) on retryable errors only; Analyzers: 3 retries; LLM: 2 repair retries + 1 provider retry
Poison messages	After max attempts → DLQ with full context; audit finalized as FAILED and credit refunded
Watchdog	Audit stuck in a non-terminal state > 150 s is force-finalized by a sweeper
5. Data Model
5.1 Entity-Relationship Overview
tenants 1───* users
tenants 1───* brand_profiles
tenants 1───* api_keys
tenants 1───* clients (agency prospect folders)
tenants 1───* audits *───1 clients (optional)
audits  1───* module_runs
audits  1───* findings
audits  1───* artifacts
audits  1───* exports *───1 brand_profiles
audits  1───* share_links
tenants 1───* monitors 1───* audits
tenants 1───* usage_ledger
tenants 1───* webhook_endpoints 1───* webhook_deliveries
audits  *───1 audits (previous_audit_id)
5.2 Core Tables (Abridged DDL)
sql
CREATE TABLE audits (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  created_by        uuid REFERENCES users(id),
  client_id         uuid REFERENCES clients(id),
  monitor_id        uuid REFERENCES monitors(id),
  previous_audit_id uuid REFERENCES audits(id),
  input_url         text NOT NULL,
  normalized_url    text NOT NULL,
  final_url         text,
  status            audit_status NOT NULL DEFAULT 'QUEUED',
  profile_version   text NOT NULL,
  scoring_version   text NOT NULL,
  score_overall     smallint CHECK (score_overall BETWEEN 0 AND 100),
  score_speed       smallint, score_clarity smallint, score_conversion smallint,
  grade             char(1),
  error_code        text,
  credit_state      credit_state NOT NULL DEFAULT 'RESERVED',
  queued_at         timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz, finished_at timestamptz,
  deleted_at        timestamptz
);
CREATE INDEX audits_tenant_created ON audits (tenant_id, created_at DESC);
CREATE INDEX audits_tenant_url     ON audits (tenant_id, normalized_url, created_at DESC);

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audits
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE module_runs (
  id uuid PRIMARY KEY, audit_id uuid NOT NULL REFERENCES audits(id),
  tenant_id uuid NOT NULL,
  module module_name NOT NULL,           -- speed | clarity | conversion
  status run_status NOT NULL,            -- PENDING|RUNNING|SUCCEEDED|FAILED|SKIPPED
  attempts smallint NOT NULL DEFAULT 0,
  prompt_version text, model_id text,
  metrics jsonb, cost_cents numeric(8,4),
  started_at timestamptz, finished_at timestamptz,
  UNIQUE (audit_id, module)
);

CREATE TABLE findings (
  id uuid PRIMARY KEY, audit_id uuid NOT NULL REFERENCES audits(id),
  tenant_id uuid NOT NULL,
  module module_name NOT NULL,
  code text NOT NULL,                    -- e.g. SPEED_HEAVY_IMAGE
  severity severity NOT NULL,
  effort smallint NOT NULL CHECK (effort BETWEEN 1 AND 3),
  priority numeric(6,2) NOT NULL,
  headline text NOT NULL, impact text NOT NULL,
  fix_plain text NOT NULL, dev_brief text NOT NULL,
  evidence jsonb NOT NULL,               -- pointers: selector, bbox, har_entry, artifact_id
  confidence real, rank smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);
5.3 Object Storage Layout
s3://ca-artifacts-{env}/
  {tenant_id}/
    {audit_id}/
      capture/   lighthouse-{1..3}.json  har.json  dom.json  viewport-5s.png  fullpage.jpg  meta.json
      analysis/  speed.json  clarity.json  conversion.json  scores.json
    exports/     {export_id}.pdf
    brand/       {brand_id}/logo.{ext}
SSE-KMS with per-tenant data keys (envelope encryption); lifecycle rules delete per plan retention.
No public ACLs; access only via short-lived signed URLs from the artifact CDN domain.
5.4 Caching
Cache	Key	TTL	Purpose
Dedupe	dedupe:{tenant}:{normalized_url}	10 min	Rule Q-02
Rate-limit counters	rl:{dimension}:{id}:{window}	window	Q-03/Q-04
CrUX responses	crux:{origin}	24 h	Reduce API calls
Session store	sess:{id}	7 d sliding	Web sessions
Idempotency	idem:{tenant}:{key}	24 h	Response replay
6. API Surface (v1)
Method & Path	Purpose	Sync/Async
POST /v1/audits	Create audit {url, client_id?, pages?, force?}	202
GET /v1/audits/{id}	Status + scores + top fixes	Sync
GET /v1/audits/{id}/findings	Paginated findings, filter by module/severity	Sync
GET /v1/audits/{id}/events	SSE progress stream	Stream
DELETE /v1/audits/{id}	Soft delete	Sync
POST /v1/audits/{id}/exports	Request PDF/JSON	202
GET /v1/exports/{id}	Export status + signed URL	Sync
POST /v1/audits/{id}/share	Create/revoke share link	Sync
POST/GET/PATCH /v1/brands	Brand Profiles CRUD	Sync
POST/GET/PATCH /v1/monitors	Scheduled audits	Sync
POST/GET/DELETE /v1/webhooks	Endpoint management	Sync
GET /v1/usage	Credit balance and ledger	Sync

Example create response:

json
{ "id": "aud_01J8Z…", "status": "QUEUED", "estimated_seconds": 75,
  "links": { "self": "/v1/audits/aud_01J8Z…", "events": "/v1/audits/aud_01J8Z…/events" } }
7. Deployment Topology
Region A (primary)                                    Region B (DR, warm standby)
┌───────────────────────────────────────────┐         ┌──────────────────────────┐
│ VPC                                       │         │ Replica DB, replicated   │
│  ├ public subnets:  LB / WAF endpoints    │         │ object store, IaC ready  │
│  ├ private-app:     API, Web, Services    │◄─repl──►│ (RPO ≤ 5 min, RTO ≤ 1 h) │
│  ├ private-data:    Postgres HA, Redis    │         └──────────────────────────┘
│  └ isolated-work:   Capture/Render pools  │
│       · no route to private-app/data      │
│       · egress only via SSRF-guard proxy  │
└───────────────────────────────────────────┘
Node Pool	Workload	Autoscaling signal
app	API, web, orchestrator	CPU / RPS
analysis	Speed, Conversion, Clarity clients, scorer	Queue depth
browser-isolated	Capture workers in gVisor/Firecracker sandboxes	Queue depth + predictive scale for weekday peaks
render-isolated	PDF rendering	Queue depth

Capacity planning: one capture sandbox ≈ 75 s of 1–2 vCPU per audit; at 10 audits/s peak a pool of ≈ 800 vCPU with headroom is required; warm pool of pre-booted sandboxes (size = 15% of peak) hides cold-start latency.

8. Observability
Signal	Detail
Traces	One trace per audit spanning API → queue → workers; audit_id and tenant_id as span attributes
Metrics	audit_duration_seconds{module}, audit_status_total, queue_wait_seconds, llm_tokens_total, sandbox_oom_total, ssrf_block_total, cost_cents_per_audit
Logs	Structured JSON; PII-scrubbed; retained 30 days
Alerts	Success-rate < 95% (5 min), p95 duration > 120 s, DLQ > 25, LLM error rate > 10%, SSRF block spike, cost anomaly
Dashboards	Golden signals per service; audit funnel; cost per plan tier
9. Key Architectural Decisions (ADR Summary)
ADR	Decision	Alternatives rejected	Rationale
001	Modular monolith for control plane	Microservices from day one	Team size; simpler transactions; modules already have hexagonal ports for later extraction
002	Isolated worker plane with egress proxy	Run browsers in app pods	SSRF and browser-escape blast radius containment
003	Capture once, analyze many	Each module fetches independently	Consistency across modules, lower target load, lower cost
004	Deterministic analyzers for Speed and Conversion; LLM only for Clarity	LLM for all modules	Reproducibility, cost, auditability
005	BullMQ on Redis	Kafka / SQS	Adequate throughput (≤ 50 audits/s), priorities and delayed jobs built in; revisit past 50/s
006	Postgres RLS for tenancy	Application-only filtering	Defense in depth against query bugs
007	Brand snapshot in report	Live brand join	Historical report immutability
008	Lab metrics median-of-3	Single run	Reduces variance; variance stored and shown as confidence