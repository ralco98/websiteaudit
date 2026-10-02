ConvertAudit AI — Performance & Efficiency Engineering

Goal: the fastest audit in its class, a UI that feels instant, and a cost/CPU/storage footprint that lets the product stay profitable at the free tier. Every number here is a budget enforced in CI and monitored in production (see testing.md). Figures marked (est.) are planning estimates derived from typical Chromium/Lighthouse behavior and MUST be validated by the benchmark harness before launch.

0. Supersession Notice (Read First)

These optimizations refine earlier documents. Where they conflict, this file wins, and the referenced sections should be updated on next revision.

Earlier document	Earlier decision	Now	Why
rules.md §2.1, architecture.md §3.4	3 Lighthouse runs per audit, median	Adaptive sampling: 1 simulated run + 1 free observed sample; extra runs only near band boundaries (§3.2)	~55–65% less capture CPU with no measurable accuracy loss on stable sites
rules.md E-17, security.md §5.2	New sandbox per audit	Unchanged in guarantee, changed in mechanism: fresh microVM restored from a pristine snapshot (§3.1)	Same isolation; cold-start 2.5 s → ~0.3 s (est.)
architecture.md §3.9	PDF via headless Chromium	Typst native renderer (§9)	20–50× less CPU, no browser attack surface in the render plane
architecture.md §3.6, rules.md A-05	3 LLM passes always	Model cascade + cache; multi-pass only on low confidence (§5)	~65% lower AI cost/latency
architecture.md §5.2	findings rows with full text	Code + params, text rendered from templates; full findings inside compressed report snapshot (§6, database.md)	~30× less finding storage
architecture.md §5.2	module_runs table	Module status folded into audits columns; progress in Redis	3× fewer rows, fewer writes
rules.md O-11	$0.40 per-audit cost ceiling	$0.10 hard ceiling, $0.02 target	Tighter cost control
userflow.md §6	First result ≈ 38–42 s, done ≈ 67 s	First result ≤ 12 s (p50), done ≤ 25 s (p50), ≤ 55 s (p95)	Streaming analyzers + faster capture
schema.sql	—	Authoritative DDL; supersedes architecture.md §5.2	—
1. Performance Budgets
1.1 API & Interaction Latency (server-side, excluding network)
Operation	p50	p95	p99	Mechanism
POST /v1/audits (accept)	25 ms	60 ms	120 ms	Cached auth, Lua rate-limit, single-round-trip transaction
GET /v1/audits/{id} (terminal)	4 ms	12 ms	30 ms	Redis/CDN hit; else 1 PK lookup
GET /v1/audits/{id} (running)	3 ms	8 ms	20 ms	Redis state only, no DB
GET /v1/audits/{id}/report	6 ms	20 ms	45 ms	One bytea fetch, no joins; CDN-cacheable, immutable
GET /v1/audits (list, 25 rows)	8 ms	25 ms	60 ms	Keyset pagination on covering index
Site trend (90 points)	5 ms	15 ms	40 ms	Index-only scan
SSE first event after connect	40 ms	120 ms	250 ms	Redis Stream replay
Credit balance	1 ms	3 ms	8 ms	Single-row PK
1.2 Audit Pipeline (end-to-end, cold target, no cache hit)
Stage	p50 budget	Notes
Accept + validate	0.3 s	Syntactic only; network validation in proxy
Sandbox restore	0.3 s	Snapshot restore (est.)
Measurement navigation (Lighthouse, simulated throttling, perf-only)	8.0 s	Gatherers trimmed (§3.3)
➜ Speed result streamed	≈ 10–12 s	Speed analyzer starts the moment LH JSON exists
Presentation navigation (Playwright: 5-s screenshot, DOM-lite, observed LCP/CLS)	7.0 s	Runs concurrently with Speed analysis
Extract + compress + upload	0.8 s	zstd/WebP, streaming upload
Conversion analyzer	0.3 s	Deterministic, in-memory
Clarity (cascade, cache miss)	3–5 s	Overlaps with Conversion
Scoring + finalize transaction	0.3 s	One round trip
Total	≈ 22 s p50 / ≤ 55 s p95	Cache hit path: < 1.5 s
1.3 Resource Budgets per Audit
Resource	Naive baseline	Budget	Technique
Capture CPU	45–60 vCPU-s	≤ 14 vCPU-s avg (est.)	Adaptive sampling, simulated throttling, trimmed LH, early stop
Analyzer CPU (all modules)	1–2 vCPU-s	≤ 0.3 vCPU-s	Streaming JSON parse, typed arrays, no DOM re-hydration
PDF render CPU	3–5 vCPU-s	≤ 0.3 vCPU-s	Typst
Sandbox RAM	1.5 GiB	≤ 1.0 GiB resident	Snapshot CoW page sharing, renderer limits
Long-term storage / audit	≈ 13 MB	≤ 0.2 MB	§6
Transient storage (24 h)	≈ 13 MB	≤ 0.35 MB	zstd -19, slimmed bundle
LLM cost / audit	≈ $0.03–0.05 (3 passes, large image)	≤ $0.01 avg (est.)	Cascade, downscale, prompt cache
DB writes / audit	12–20 statements	2 statements (insert + finalize CTE)	Redis for transient state
Fully-loaded cost / audit	—	≤ $0.02 target, $0.10 hard cap	—
1.4 Frontend Budgets (Report & Landing)
Metric	Budget
LCP (mobile, 4G)	≤ 1.5 s
INP	≤ 100 ms
CLS	≤ 0.02
JS shipped, report route (gzip)	≤ 120 KB
JS shipped, landing (gzip)	≤ 60 KB
Main-thread long tasks on report load	0 tasks > 100 ms
Lighthouse (own site, audited by ConvertAudit)	≥ 95 performance, ≥ 90 overall ConvertAudit score

The product dogfoods itself: CI runs ConvertAudit against its own landing and sample report on every deploy; a score regression blocks release.

2. Design Principles for Efficiency
Do less work: skip, reuse, or coalesce before optimizing (cache > dedupe > skip > cheaper path > faster path).
Spend expensive resources only when uncertainty demands it (adaptive sampling, model cascade).
Distill early: convert megabytes of raw browser output into kilobytes of features inside the worker, before any network hop or persistence.
Store facts, not prose: persist codes and parameters; render language at the edge.
Make hot reads one lookup: precompute read models at write time (immutable audits make this safe).
Stream, never batch-wait: every module publishes as soon as it can.
Every optimization has a guard: a golden-set accuracy test proves it didn't degrade results (scoring-spec.md §7).
3. Capture Plane Efficiency
3.1 Snapshot-Restored MicroVMs
Build a pristine sandbox image with Chromium, Playwright and Lighthouse loaded and pre-warmed (fonts cached, JIT flags set, profile directory created, DevTools port open, blank page loaded).
Take a Firecracker snapshot (memory + device state) of that warm image, weekly and on every Chromium security release.
Each audit restores a new microVM from the snapshot using an mmaped memory file: restore ≈ 100–300 ms (est.); unmodified pages are shared copy-on-write across concurrent VMs, cutting resident memory per sandbox.
Security preserved (rule E-17): each audit still gets a brand-new VM instance that is destroyed afterward. Mitigations for snapshot reuse: VMGenID/entropy reseed on restore, unique MAC/IP and hostname injected at boot, no secrets inside the snapshot, and per-VM ASLR reseeding via fresh Chromium renderer processes.
Warm pool: keep ceil(0.15 × peak concurrency) restored-but-idle VMs to absorb bursts; recycle idle VMs after 60 s (never reuse after a job).
3.2 Adaptive Sampling (Accuracy-Aware)
Run A  (Lighthouse, simulated throttling, performance category only)        ← always
Run B  (Playwright presentation pass under applied CDP throttling,
        PerformanceObserver: LCP, CLS, long tasks)                          ← always, needed for screenshot/DOM anyway
                │
                ▼
   decide(extraRuns) =
        any headline metric within ±20% of a band boundary          (LCP 2.5/3.0/4.0 s, TBT 200/600 ms, CLS 0.1/0.25)
     OR |LCP_A − LCP_B| / max(LCP_A, LCP_B) > 0.30
     OR resource timings show high-variance servers (TTFB spread > 60%)
                │ yes → run 1–2 more Lighthouse passes (median-of-3)
                │ no  → report median(A,B-adjusted) with stability = "stable"
Run B is free because the presentation pass is required for screenshots and DOM anyway; its observed metrics act as an independent second sample.
Expected: ~55–65% of audits finish with two samples, ~35–45% run a third (and rarely a fourth) (est.). Average capture CPU ≈ 14 vCPU-s versus ≈ 50 for always-3-throttled-runs.
Stored per audit: samples, spread_pct, stability ∈ {stable, moderate, noisy}; noisy results are shown with a range ("LCP 3.4–4.1 s") instead of false precision.
3.3 Trimmed Measurement
Lever	Setting	Effect
Lighthouse scope	onlyCategories: ["performance"], onlyAudits = the ~22 audits we use	Skips a11y/SEO/best-practices gatherers
Screenshots in LH	Disable filmstrip/full-page screenshot/final-screenshot thumbnails	Saves encode CPU and 1–3 MB of JSON
Throttling	simulate (Lantern) for run A	No wall-clock slowdown; loads at full speed then models Slow-4G/4×CPU
Post-load wait	Stop at load + 1.5 s network quiet, hard cap 6 s (was 10 s)	Saves 3–8 s on chatty sites
Media	Abort video/* and audio/* bodies after headers; record size + poster frame only	Prevents 20–100 MB downloads; becomes finding SPEED_AUTOPLAY_VIDEO
Byte caps	Abort connection when cumulative bytes hit cap (60 MB) or single asset > 25 MB	Bounded worst case
Chromium flags	--disable-extensions --disable-background-networking --disable-sync --disable-component-update --disable-default-apps --mute-audio --disable-features=Translate,MediaRouter,OptimizationHints --renderer-process-limit=1 --js-flags=--max-old-space-size=384	Lower baseline RSS/CPU
GPU	Software raster, --disable-gpu, --disable-dev-shm-usage	Predictable, headless-safe
Fonts	Preinstall 12 common families in the image	Avoids fallback-font layout noise (accuracy) and network fetches
DNS/TLS	Proxy keeps a 60 s DNS cache + connection pool per destination for subresource bursts	Fewer handshakes
3.4 Distillation Inside the Worker

The worker emits only these artifacts (everything else is discarded in-memory):

Artifact	Format	Typical size	Purpose
speed.msgpack.zst	Metrics + top-60 requests (url-hash, type, bytes, timing, initiator) + third-party rollup	12–25 KB	Speed analyzer, waterfall UI
dom-lite.msgpack.zst	Only visible/interactive nodes (a, button, input, form, h1–h3, img, video, landmarks): tag, text≤120 chars, bbox, computed-style subset (12 props), a11y name	15–60 KB	Conversion + Clarity
hero.json	Ordered hero text blocks with size/contrast/position	1–3 KB	Clarity
viewport-5s.webp	390×844 @1×, q=72	30–55 KB	Clarity input + evidence
fullpage.webp	390×≤4000 @1×, q=65	80–150 KB	Evidence
meta.json	Redirects, headers subset, profile	1–2 KB	All

Raw Lighthouse JSON/HAR (2–8 MB) exist only in worker memory; a 2% random sample is retained 7 days (zstd) for diagnostics.

4. Coalescing & Caching Hierarchy
 request ─► L0 client/CDN ─► L1 in-process LRU ─► L2 Redis ─► L3 Postgres / S3
Cache	Key	TTL	Hit effect
Capture cache (global, public content only)	cap:{profile_v}:{sha256(final_normalized_url)}	15 min (5 min for e-commerce heuristics)	Skips capture entirely; audit finishes in < 1.5 s using shared derived artifacts. No tenant data ever enters it.
Single-flight	sf:{same key} (SET NX PX 120000)	120 s	N simultaneous requests for one URL trigger one capture; others subscribe to its completion event
Analysis cache	an:{module}:{bundle_hash}:{scoring_v}	24 h	Re-scoring after weights change without re-capture
LLM result cache	llm:{prompt_v}:{phash(viewport)}:{hash(hero.json)}	7 d	Identical hero → zero-cost Clarity (common for template sites, WordPress themes)
Report JSON	report:{audit_id}:{revision}	∞ (immutable)	CDN Cache-Control: private, max-age=31536000, immutable
Auth (API key/session)	hashed credential	30 s L1 / 5 min L2	Removes DB from auth path
Share token resolve	share:{token_hash}	60 s, purged on revoke	One Redis GET
Export cache	(audit, brand_version, options_hash) unique	until artifact expiry	Re-export returns instantly

Notes:

The capture cache is safe because pages are public and the captured facts are not user-specific; tenants never write to it, and access to any tenant-visible artifact is authorized per audit (signed URLs after policy check).
A cache hit still creates a normal tenant audit row with flags.cached_capture = 1, a fresh timestamp, and honest "captured at" metadata in the report.
Users may force fresh=true (costs a credit; bypasses L0–capture cache only).
5. AI Efficiency (Clarity Module)
Technique	Detail	Effect
Feature-first hybrid	Deterministic hero features (headline size ratio, contrast, word count, H1 presence, CTA distance, image/text ratio) computed in code and passed alongside the image	Model reasons over evidence; fewer tokens; more stable scores
Image economy	Send only the 390×844 viewport at 1× (≈ 440 vision tokens) — never DPR-3 or full page	~9× fewer image tokens vs. DPR 3
Model cascade	Pass 1: fast small model. Escalate to larger model only if min(confidence) < 0.6, deterministic/AI disagreement > 15 points, or score within ±3 of a grade boundary	~75% of audits stay on the small model (est.)
Prompt caching	System prompt + rubric + 4 few-shot examples (≈ 1.5 k tokens) marked cacheable	~85–90% cheaper on the static prefix
Single call, multi-output	One structured call returns comprehension test, five sub-scores, issues, pins, rewrites	1 network round trip
Output budget	max_tokens 700; terse field names; rewrites ≤ 18 words	Bounded latency/cost
Result cache	Perceptual-hash + hero-hash key (§4)	Zero-cost repeat/template sites
Circuit breaker	5 failures / 30 s opens breaker → Clarity AI_UNAVAILABLE immediately (no queueing) → audit PARTIAL fast	No latency amplification during provider incidents
Timeouts	12 s soft, 20 s hard per call; hedge a second request to the alternate region/provider endpoint after p95 latency	Tail-latency control
Multi-pass self-consistency	Only inside the escalation path (3 samples)	Accuracy where uncertainty is real

Model identifiers live in configuration (clarity.model.primary, clarity.model.escalation) and are versioned with the prompt in each audit record; swapping models requires a golden-set pass (rule A-09).

6. Storage Efficiency
6.1 Long-Term Footprint per Audit
Item	Naive	Optimized	How
Audit metadata row + indexes	2 KB	~0.35 KB	smallint enums, aligned columns, 3 indexes
Findings (avg 22)	33 KB (1.5 KB each)	~1.3 KB index rows + in-snapshot	Code + params; text from templates
Report snapshot	250 KB JSON	8–12 KB	Canonical JSON → zstd with trained dictionary (3–5× better than plain zstd on small docs)
Lighthouse ×3	6 MB	0 (distilled to 15–25 KB inside speed.msgpack.zst)	Distill in worker
HAR	2 MB	0 (top-60 requests kept)	Distill
DOM snapshot	3 MB	15–60 KB	dom-lite
Screenshots	2 MB (PNG ×2)	110–200 KB	WebP q65–72, 1×, height cap
Total	≈ 13 MB	≈ 0.2 MB	≈ 65× smaller

At 1 M audits/month: ≈ 200 GB/month retained (vs ≈ 13 TB naive). With 90-day hot retention for Starter, steady-state ≈ 600 GB — cheap on object storage.

6.2 Techniques
Report snapshot blob: one immutable bytea per audit revision, zstd with a shared dictionary trained monthly on 50 k recent reports (dict_id stored with the row so old reports remain decodable).
Dictionary-encoded enums: severity, module, status, finding codes as smallint; hostnames and URLs stored once in sites, referenced by bigint.
Content-addressed blobs (blobs, SHA-256): identical logos, favicons, repeated screenshots stored once with refcounts; GC job deletes at refcount 0 + 24 h grace.
Keyframe retention for monitors: keep the viewport WebP for every audit but the full-page WebP only for the first audit, every 4th audit, and any audit whose overall score changed ≥ 5 points.
Tiered lifecycle: 0–30 d hot (S3 Standard) → 31–90 d Infrequent Access → beyond plan retention: artifacts deleted, summary row kept (scores, grade, trend point ≈ 0.35 KB) so long-term trend charts survive.
Columnar archive: expired audit rows exported monthly to Parquet (zstd) for anonymized benchmarks (rule D-07) and dropped from Postgres via DROP PARTITION (instant, zero bloat).
WAL and TOAST compression: wal_compression=zstd, default_toast_compression=lz4; already-compressed columns use STORAGE EXTERNAL to avoid double compression CPU.
PDF size: fonts subsetted, images downsampled to 150 DPI, shared XObjects → typical 300–600 KB (vs 1.5–3 MB).
Log/telemetry discipline: 1% trace sampling at baseline + 100% on errors and slow audits (tail-based sampling); metrics pre-aggregated; logs sampled by severity.
7. Database Performance (Summary)

Details in database.md and schema.sql. Headline guarantees:

Every hot read is one indexed lookup or one index-only scan; no request path performs a join across more than 2 tables.
Writes per audit: 1 INSERT at accept, 1 CTE statement at finalize (audit update + report + finding index + site read-model + credits + ledger + outbox).
Range-partitioned by month with partition pruning enforced (UUIDv7 timestamp embedded in public IDs → the app derives created_at for point lookups).
RLS with InitPlan-cached tenant predicate; every index leads with tenant_id.
PgBouncer (transaction pooling), 1 primary + 2 read replicas, replica reads for lists/trends, primary/LSN-pinned reads immediately after writes.
8. Interactivity & Perceived Performance
Technique	Detail
Instant navigation	Submit returns 202 in ~25 ms; UI navigates immediately to the report shell with skeletons sized to final dimensions (CLS ≈ 0)
Server-rendered report	React Server Components render the report from the snapshot; charts, gauges, waterfall are server-generated inline SVG — zero charting-library JS
Islands of interactivity	Only tabs, finding expanders, copy buttons, and the pin/finding highlighter hydrate (~35 KB)
Streaming UI	SSE events patch individual module panels; no full-page refetch
Prefetch	Hover/touchstart on a tab or history row prefetches its JSON (immutable → cache hit next click)
Optimistic mutations	Resolve/dismiss/share/brand changes update instantly with rollback on error
Virtualization	Waterfall and audit history use windowed lists (only visible rows in DOM)
Web Workers	Client-side diff computation between audits runs off the main thread
Image handling	Screenshots served as WebP with width/height attributes, fetchpriority=high for the hero screenshot, loading=lazy below the fold; 2 sizes via srcset
Edge	Landing and marketing pages statically generated and served from CDN; report shell cached at edge, data hydrated by token
Progress honesty	ETA from rolling per-stage medians; progress is monotonic (never moves backward)
Reduced-motion + low-power	Animations disabled under prefers-reduced-motion and on Save-Data

SSE gateway: a dedicated lightweight process (Node + uWebSockets.js, or Go) handles ≥ 50 k concurrent connections per 2 vCPU, subscribing to Redis Streams per audit only while clients are attached.

9. PDF Rendering with Typst (Native, Browser-Free)
Aspect	Chromium HTML→PDF	Typst native
CPU per 7-page report	3–5 vCPU-s	0.1–0.3 vCPU-s (est.)
Memory	400–800 MB	40–120 MB
Cold start	1–2 s	~10 ms (single static binary)
Attack surface	Full browser	Memory-safe Rust, no JS, no network
Determinism	Font/layout drift across versions	Pinned compiler + embedded fonts
Preview parity	Separate code path	Same templates compile to SVG for the live brand preview

Implementation:

Templates are first-party .typ files receiving audit data and brand tokens as a JSON input (never concatenated as markup), so hostile strings cannot inject template code.
Screenshots embedded as WebP→PNG downsampled to 150 DPI; annotations (pins, CTA outlines) drawn as vector overlays from bounding boxes, so no extra raster is stored.
Render worker runs in a network-less sandbox; inputs/outputs via scoped object-store URLs; a warm worker process may be reused for up to 100 jobs within one tenant because the input class is first-party data (image decoders run inside the same sandbox with seccomp).
Output cached by (audit_id, revision, brand_version, options_hash).
10. Capacity Model & Autoscaling
10.1 Sizing Formula
vCPU_required = λ_peak × CPU_s_per_audit / target_utilization
              = 10 audits/s × 14 vCPU-s / 0.60  ≈ 233 vCPU  (≈ 58 nodes × 4 vCPU)
RAM check     = concurrent_sandboxes × 1.0 GiB;  concurrent = λ × latency = 10 × 20 s = 200 → 200 GiB (fits 58 × 16 GiB = 928 GiB with ample slack)

Compare: the original design (≈ 50 vCPU-s, 1.5 GiB) needs ≈ 830 vCPU at the same load — roughly a 3.5× infrastructure reduction.

10.2 Autoscaling
Signal	Scale action
Capture queue wait p95 > 8 s (interactive)	+25% nodes (KEDA on queue wait, not queue depth)
Warm-pool hit rate < 90%	Increase pool fraction
Node CPU > 70% sustained 3 min	Add nodes
Scale-in	Only when p95 wait < 2 s for 10 min; drain nodes gracefully (finish in-flight audits)
Spot/preemptible	Capture nodes 80% spot, 20% on-demand; interrupted jobs re-queue automatically (idempotent)
10.3 Cost Envelope (planning assumptions — validate against actual cloud and model pricing)
Component	Per audit
Capture compute (14 vCPU-s on spot)	≈ $0.0003–0.001
Analyzers + scoring	< $0.0001
LLM Clarity (cascade + caching)	≈ $0.005–0.010
Storage (0.2 MB × 90 d) + egress	≈ $0.0001
DB + Redis amortized	≈ $0.0005
Total	≈ $0.007–0.013

The LLM dominates cost; that is why the result cache, cascade, and image economy exist.

11. Backpressure, Fairness & Load Shedding
Mechanism	Rule
Priority classes	interactive-paid (weight 8) > interactive-free (3) > monitor (2) > bulk/API-batch (1); weighted fair dequeue
Per-tenant concurrency	Token bucket in Redis (Lua): concurrency = plan limit; excess jobs wait in tenant sub-queue, preventing one agency from starving others
Per-domain politeness	≤ 2 concurrent captures and ≤ 20/hour per registrable domain (Q-04)
Load shedding	If projected queue wait > 45 s: free-tier teasers get 503 Retry-After with friendly message; paid tiers continue; monitors are delayed (they tolerate minutes)
Admission control	API refuses new audits when Redis or DB are degraded (fail closed) rather than accepting work it cannot finish
Deadlines	Each job carries an absolute deadline; workers drop expired jobs without executing
Retry budget	≤ 10% of traffic may be retries; exceeding it trips a breaker to prevent retry storms
Bulkheads	Separate queues, pools, and connection pools per module and per plane
12. Performance Verification
Benchmark harness: 500-URL corpus (blogs, WordPress, Shopify, Wix, SPAs, heavy media, slow servers) replayed via a local WPT-style mirror for repeatability; measures CPU-s, RSS peak, wall time, and score deltas per change.
CI gates: capture CPU-s ≤ 16 (avg), p95 wall ≤ 55 s in staging, snapshot restore ≤ 400 ms, report JSON ≤ 15 KB, API p95 budgets in §1.1, bundle sizes in §1.4, SQL plan snapshots (database.md §13).
Regression policy: any budget breach > 10% blocks merge unless approved with a written trade-off.
Production: SLO burn-rate alerts; weekly cost-per-audit report broken down by stage; monthly dictionary retraining and cache hit-rate review.
13. Efficiency Checklist (Release Gate)
 Snapshot restore p95 ≤ 400 ms; no shared state leaks between restored VMs (canary file test)
 Adaptive sampling accuracy: score deviation vs. always-3-runs ≤ 2 points on golden set
 Capture cache hit path < 1.5 s end-to-end
 LLM cascade: escalation rate ≤ 30%, accuracy within 2 points of always-large baseline
 Storage per audit ≤ 0.25 MB (measured on golden set)
 Finalize transaction is a single round trip; p95 ≤ 15 ms
 Report route JS ≤ 120 KB gz; own-site ConvertAudit score ≥ 90
 Load test at 1.5× projected peak with no SLO breach; graceful shedding verified at 3×