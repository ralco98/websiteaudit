# ConvertAudit AI — Senior Developer Comprehensive System Analysis & Deep Dive

> **Document Status**: Authoritative Senior Architectural Review & Unified System Blueprint  
> **Scope**: Synthesis and critical evaluation of all 12 system specifications (`knowledge.md`, `rules.md`, `architecture.md`, `backend.md`, `database.md`, `schema.sql`, `scoring-spec.md`, `design.md`, `userflow.md`, `security.md`, `performance.md`, `openapi.yaml`).

---

## Executive Architectural Assessment

ConvertAudit AI is engineered around a core asymmetric challenge: **executing untrusted third-party web content at high velocity and sub-dollar unit economics while presenting plain-English, actionable conversion insights to non-technical users and agencies.**

As a senior developer analyzing every line of the specifications, the system demonstrates exceptional engineering maturity. Notably, **`performance.md §0` and `schema.sql` define a critical refinement wave (Supersession Wave)** that addresses the high CPU and storage overhead of initial naive designs, reducing compute from ~50 vCPU-s to ≤14 vCPU-s, storage from ~13 MB to ~0.2 MB per audit, and wall-clock completion from ~67 s to ~22 s p50.

---

## 1. System Topology & Zero-Trust Network Architecture

The architecture enforces a strict physical and logical boundary between the **Control Plane** (multi-tenant orchestration, API, database) and the **Worker Plane** (untrusted browser execution). Workers possess **zero route** back to internal services and can only communicate through S3 object storage (via short-lived presigned URLs) and Redis queue events.

```mermaid
flowchart TB
    subgraph Clients["Clients & Edge"]
        User["User / Agency Browser"]
        APIClient["API Integrator / CRM"]
        Edge["Edge CDN + WAF + Cloudflare Turnstile"]
        ArtifactCDN["Cookieless Artifact CDN\n(convertaudit-cdn.com)\nCSP: sandbox; default-src 'none'"]
    end

    subgraph ControlPlane["Control Plane (Private Subnets)"]
        API["Fastify API Gateway\n(Auth, Policy, RateLimit, Idempotency)"]
        SSEGate["SSE Streaming Gateway\n(uWebSockets.js / Node)"]
        Orchestrator["Audit Orchestrator\n(DAG Engine & Sweeper)"]
        Relay["Outbox Relay\n(FOR UPDATE SKIP LOCKED)"]
        
        DB[(PostgreSQL 16 Primary\nRLS + Monthly Partitions)]
        DBRep[(PostgreSQL Replicas\nRead-your-writes LSN)]
        Redis[(Redis 7 Cluster\nRate Limit, SSE Streams,\nSingle-Flight, Cache)]
        S3[(Object Storage S3/GCS\nSSE-KMS per Tenant)]
    end

    subgraph WorkerPlane["Worker Execution Plane (Isolated Egress-Only Subnets)"]
        CapturePool["Capture Workers\n(Firecracker MicroVMs / gVisor)\nWarm Snapshot Restore ~300ms"]
        AnalyzePool["Analysis Workers\n(Speed, Conversion Scorer)"]
        ClarityPool["Clarity Worker\n(Claude Cascade + Prompt Cache)"]
        RenderPool["Render Workers\n(Typst Native Rust Engine\nNo Network)"]
        
        SSRFProxy["SSRF-Guard Forward Proxy (Go)\nDNS Pinning + Range Filter\nEgress Enforcement"]
    end

    subgraph External["External Networks & Targets"]
        PublicWeb["Public Target Websites\n(Audited Sites via Slow 4G Profile)"]
        AnthropicAPI["Anthropic Claude API\n(Vision & JSON Schema)"]
        StripeAPI["Stripe API\n(Billing & Webhooks)"]
    end

    %% Network Connections
    User --> Edge
    APIClient --> Edge
    Edge --> API
    Edge --> SSEGate
    User -.->|Signed WebP/PDF Links| ArtifactCDN
    ArtifactCDN -.-> S3

    API --> DB
    API --> Redis
    API --> S3
    SSEGate --> Redis
    Orchestrator --> DB
    Orchestrator --> Redis
    Relay --> DB
    Relay --> Redis

    Redis -.->|BullMQ Queues| CapturePool
    Redis -.->|BullMQ Queues| AnalyzePool
    Redis -.->|BullMQ Queues| ClarityPool
    Redis -.->|BullMQ Queues| RenderPool

    CapturePool -->|HTTP/HTTPS via Proxy| SSRFProxy
    SSRFProxy -->|Pinned Public IP| PublicWeb
    CapturePool -->|Presigned S3 PUT| S3
    ClarityPool -->|HTTPS Outbound| AnthropicAPI
    RenderPool -->|Presigned S3 GET/PUT| S3
    API --> StripeAPI
```

---

## 2. End-to-End Audit State Machine & Asynchronous DAG

Every audit is fully asynchronous: `POST /v1/audits` returns an immediate `202 Accepted` with an embedded timestamp UUIDv7. The audit lifecycle guarantees single-round-trip acceptance, parallelized module execution, and atomic idempotent finalization.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Browser
    participant API as API Gateway (Fastify)
    participant Redis as Redis (State & Single-Flight)
    participant DB as Postgres (RLS & Outbox)
    participant Queue as BullMQ
    participant Capture as Capture Worker (MicroVM)
    participant SSRF as SSRF Proxy
    participant S3 as S3 Object Store
    participant Analyzers as Analyzers (Speed / Conv / Clarity)
    participant Scorer as Scoring Engine

    Client->>API: POST /v1/audits { url, force, fresh }
    API->>Redis: Check Idempotency & Rate Limit Lua
    API->>Redis: Check Dedupe (10 min) & Single-Flight Probe
    API->>DB: Transaction: Reserve Credit + Upsert Site + Insert Audit + Insert Outbox
    API-->>Client: 202 Accepted { id, status: "QUEUED", links }
    
    Client->>API: GET /v1/audits/{id}/events (SSE)
    
    DB->>Queue: Outbox Relay enqueues `capture`
    Queue->>Capture: Claim Capture Job
    Capture->>Capture: Restore MicroVM from Snapshot (~300ms)
    Capture->>SSRF: DNS Resolve & Pin IP (Reject private ranges)
    SSRF->>Capture: Pinned TLS Connection established
    
    Note over Capture: Measurement Run (Lighthouse Simulated)
    Capture->>S3: Upload `speed.msgpack.zst`
    Capture->>Queue: Emit `capture.speedReady` (~10-12s)
    
    par Stream Speed to User
        Queue->>Analyzers: Run Speed Analyzer
        Analyzers->>Redis: Update state & publish SSE `module.completed(speed)`
        Redis-->>Client: SSE: Speed score (61) & CWV ready to inspect!
    and Presentation Run (Playwright)
        Note over Capture: Playwright 5s Shot, DOM-lite, Observed CWV
        Capture->>Capture: Adaptive Sampling Check (Divergence > 30%?)
        Capture->>S3: Upload `dom-lite`, `viewport-5s.webp`, `fullpage.webp`, `hero.json`
        Capture->>Queue: Emit `capture.completed`
    end

    par Fan-Out Modules
        Queue->>Analyzers: Analyze Conversion (DOM-lite Prominence & Rubric)
    and
        Queue->>Analyzers: Analyze Clarity (Prompt Cache + Cascade LLM)
    end

    Analyzers->>Redis: HINCRBY audit:{id}:state done 1 (Atomic counter)
    Note over Analyzers,Scorer: When all modules terminal (done == 3)
    Analyzers->>Queue: Enqueue `score` job
    Queue->>Scorer: Execute Scoring Engine (Pure function)
    Scorer->>S3: Write `scores.json` & Compressed Report Snapshot
    Scorer->>DB: Execute Q7 Finalize CTE (Single Atomic Statement)
    Scorer->>Redis: Publish `audit.completed`
    Redis-->>Client: SSE: Audit Complete (Grade C, Score 58, Top 10 Fixes)
```

---

## 3. Deep Analysis of the Analysis & Scoring Engine

The scoring system calculates an overall score:
$$\text{Overall} = \text{round}(0.35 \cdot \text{Speed} + 0.35 \cdot \text{Clarity} + 0.30 \cdot \text{Conversion})$$

```mermaid
graph TD
    subgraph SpeedPipeline["Speed Analysis Module (Deterministic)"]
        LH["Lighthouse Run A (Simulated 4G)"]
        PW["Playwright Run B (Observed CWV)"]
        Adaptive{"Adaptive Sampling\nMetric ±20% boundary OR\n|LCP_A - LCP_B| > 30%?"}
        ExtraRuns["Run 1-2 extra passes\n(Median of 3)"]
        LogNormal["Log-Normal CDF Mapping:\nσ = ln(median/p10)/1.2816\nscore = 1 - Φ(ln(x/median)/σ)"]
        
        LH --> Adaptive
        PW --> Adaptive
        Adaptive -- Yes --> ExtraRuns --> LogNormal
        Adaptive -- No --> LogNormal
        
        SubSpeed["Subscores (0-100):\n• LCP (35%)\n• TBT (20%)\n• CLS (15%)\n• TTFB (10%)\n• Transfer Weight (10%)\n• Request Pressure (10%)"]
        LogNormal --> SubSpeed
    end

    subgraph ClarityPipeline["Clarity Module (AI-Judgment + Guardrails)"]
        Shot["viewport-5s.webp (390x844 1x)"]
        Hero["hero.json (Ordered text blocks)"]
        DetFeat["Deterministic Hero Features:\nh1_present, headline_ratio,\ncontrast, generic_phrase, clutter"]
        
        BlindTest["Blind Comprehension Test:\n1. what_offered?\n2. who_for?\n3. next_step?"]
        Judge["Judge vs Site <title>/JSON-LD\n(Semantic Match)"]
        
        Cascade{"Confidence < 0.6 OR\nDisagreement > 6 OR\nNear Grade Boundary ±3?"}
        PrimaryModel["Fast Small Model (1 pass)\n+ Prompt Caching"]
        EscalationModel["Escalation Model (3 passes)\nMedian & Variance"]
        
        Shot & Hero & DetFeat --> PrimaryModel --> BlindTest --> Judge
        Judge --> Cascade
        Cascade -- No --> Clamp["Clamp AI by Deterministic Guards"]
        Cascade -- Yes --> EscalationModel --> Clamp
        
        SubClarity["5 Subscores (0-20 each):\n1. Headline Specificity\n2. Value Proposition\n3. Visual Hierarchy\n4. Imagery Relevance\n5. Cognitive Load"]
        Clamp --> SubClarity
    end

    subgraph ConversionPipeline["Conversion Module (100% Deterministic)"]
        DOM["dom-lite.msgpack.zst"]
        
        CTACandidates["Identify CTA Candidates\n(button, a, input, [role=button])"]
        Prominence["Prominence Formula:\nP = 0.28·Area + 0.24·Contrast +\n0.18·Position + 0.15·Copy +\n0.10·Isolation + 0.05·Shape"]
        Rubric["Deterministic Rubric (100 pts):\n• Primary CTA Prominence (30)\n• CTA Copy Quality (10)\n• Contact Availability tel/mail (20)\n• Form Friction field count/label (15)\n• Mobile Ergonomics 48x48 tap (10)\n• Trust signals near CTA (10)\n• Sticky/persistent CTA (5)\n• Overlay penalty (-0 to -15)"]
        
        DOM --> CTACandidates --> Prominence --> Rubric
    end

    subgraph FinalScoring["Scoring Aggregator & Ranker"]
        SubSpeed & SubClarity & Rubric --> WeightedScore["Overall Score (0-100)\n& Letter Grade (A-F)"]
        Findings["Finding Catalog (IDs 101-317)"]
        PriorityFormula["Priority = (Sev_Weight × Impact × Conf) / Effort_Cost\nCritical=8, High=5, Med=3, Low=1\nEffort: 1=1.0, 2=1.6, 3=2.6"]
        
        Findings --> PriorityFormula
        PriorityFormula --> TopFixes["Ordered Top 10 Fixes\nwith Developer Briefs"]
    end
```

---

## 4. Database Architecture & Storage Efficiency

The database design in `database.md` and `schema.sql` solves PostgreSQL multi-tenant bloat and scale bottlenecks through 5 key architectural decisions:

1. **UUIDv7 Point-Lookup Optimization**: UUIDv7 embeds a 48-bit millisecond timestamp. The API extracts `created_at` from the UUIDv7 `id` and queries `WHERE created_at = $1 AND id = $2`. PostgreSQL partition pruning immediately eliminates 99% of partitions without scanning.
2. **RLS Without Query Penalties**: Row-Level Security calls `USING (tenant_id = (SELECT app_tenant()))`. Wrapping `app_tenant()` in a scalar sub-select forces PostgreSQL to evaluate it **once as an InitPlan** rather than per-row. Every index leads with `tenant_id`.
3. **Single CTE Finalize Statement (Q7)**: Updates `audits`, inserts `audit_reports`, inserts `audit_finding_index`, updates `sites` read model, deducts `tenant_credits`, inserts `usage_ledger`, and writes to `outbox` in **one single database round trip**. Idempotent via `WHERE status < 10`.
4. **Column Alignment & Smallint Enums**: Columns are sorted by byte size (16B UUIDs $\to$ 8B Bigints $\to$ 4B Integers $\to$ 2B Smallints $\to$ 1B $\to$ Text) to eliminate CPU alignment padding. Enums are `smallint`. Audit row heap size is reduced to ~118 bytes.
5. **Report Snapshot with zstd-dict Compression**: Finding text and evidence are not stored as relational rows. Instead, they are rendered to canonical JSON and compressed via zstd with a monthly pre-trained dictionary (~110 KB), producing a tiny 8–12 KB snapshot per audit.

```mermaid
erDiagram
    tenants ||--o{ users : "has"
    tenants ||--o{ brand_profiles : "configures"
    tenants ||--o{ api_keys : "authenticates"
    tenants ||--o{ clients : "organizes"
    tenants ||--o{ sites : "tracks"
    tenants ||--o{ tenant_credits : "meters"
    tenants ||--o{ usage_ledger : "audits"
    tenants ||--o{ monitors : "schedules"
    tenants ||--o{ webhook_endpoints : "delivers"

    sites ||--o{ audits : "generates"
    sites ||--o{ finding_states : "maintains site-level resolution"
    clients ||--o{ sites : "groups"

    audits ||--|| audit_reports : "stores compressed snapshot"
    audits ||--o{ audit_finding_index : "indexes for cross-audit search"
    audits ||--o{ audit_artifacts : "links content-addressed blobs"
    audits ||--o{ share_links : "shares"
    audits ||--o{ exports : "exports PDF/JSON"

    blobs ||--o{ audit_artifacts : "content-addressed"
    blobs ||--o{ brand_profiles : "logo hash"
    blobs ||--o{ exports : "pdf hash"

    outbox ||--|| audits : "transactional events relay"
```

---

## 5. Security & Multi-Layer SSRF Defense Onion

Because ConvertAudit AI navigates to arbitrary URLs supplied by anonymous users, SSRF and sandbox breakout are the highest-risk vectors. The system employs an 8-layer defense model:

```mermaid
graph TD
    subgraph Layer1["1. Syntactic API Validation"]
        L1["T-01: Schemes http/https only\nT-02: Ports 80/443 only\nT-03: Reject userinfo (@)\nT-04: Normalize, punycode, max 2048 chars"]
    end

    subgraph Layer2["2. SSRF-Guard Proxy DNS Validation"]
        L2["T-05: Resolve DNS independently\nBlock RFC1918, 127.0.0.0/8, 169.254.0.0/16 (Cloud Metadata),\nCGNAT, IPv6 mapped IPv4, link-local"]
    end

    subgraph Layer3["3. Connection Pinning & Anti-Rebinding"]
        L3["T-06: Pin outbound socket to validated IP\nRe-validate on every redirect hop (Max 5 hops)"]
    end

    subgraph Layer4["4. Sandbox MicroVM Boundary"]
        L4["E-01: 120s hard timeout, 1.5GB cgroup RAM\nFirecracker microVM / gVisor runsc\nRead-only rootfs, tmpfs 512MB scratch\nDrop all Linux capabilities, seccomp filters"]
    end

    subgraph Layer5["5. Browser Process Hardening"]
        L5["No --no-sandbox flag\nPermissions default-deny (camera, mic, geo, downloads)\nAuto-dismiss alerts/dialogs\nNo form submission or purchase click (E-15)"]
    end

    subgraph Layer6["6. Worker Network Segmentation"]
        L6["Dedicated isolated node pool\nEgress ONLY via SSRF proxy\nZero route to VPC or cloud metadata service (IMDSv2 hop-limit 1)"]
    end

    subgraph Layer7["7. Cookieless Artifact Domain"]
        L7["Screenshots & PDFs served from convertaudit-cdn.com\nCSP: sandbox; default-src 'none'\nZero session cookies on artifact origin"]
    end

    subgraph Layer8["8. AI Injection & Delimited Token Boundary"]
        L8["A-02: Untrusted page text wrapped in random boundary tokens\nA-04: Model has no tools, no network, no memory\nA-06: AI rewrites filtered against verified page facts"]
    end

    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7 --> L8
```

---

## 6. Comprehensive Cross-Specification Matrix

| Architecture Dimension | Specification Reference | Senior Developer Implementation Requirements |
|---|---|---|
| **API Protocol** | `openapi.yaml`, `backend.md` | OpenAPI 3.1.0, RFC 9457 `application/problem+json`, `Idempotency-Key` (24h Redis replay), keyset pagination (`(created_at, id) < ($1, $2)`). |
| **Tenancy Isolation** | `rules.md §3`, `security.md §3`, `database.md §4` | PostgreSQL RLS enabled & forced; `SET LOCAL app.tenant_id`; cross-tenant requests **MUST return 404, never 403** (prevents ID enumeration). |
| **Worker Sandboxing** | `rules.md §2`, `security.md §5`, `performance.md §3` | Ephemeral Firecracker microVMs restored from pre-warmed snapshot (~300ms); CoW memory; 390×844 Android DPR 3 (captured @ 1x for WebP); 4× CPU slowdown; Slow 4G. |
| **Core Web Vitals** | `knowledge.md §3.2`, `scoring-spec.md §2` | LCP (p10 2.5s, median 4.0s), TBT (p10 200ms, median 600ms), CLS (p10 0.10, median 0.25), TTFB (p10 800ms, median 1.8s). CrUX field data shown alongside, never blended. |
| **Clarity Evaluation** | `scoring-spec.md §3`, `backend.md §8.3` | Blind comprehension test (what/who/next step) + 5 subscores (0–20). Reconciled with deterministic DOM signals. Primary model with escalation cascade on low confidence. |
| **Conversion Rubric** | `scoring-spec.md §4` | Prominence formula $P = 0.28A + 0.24C + 0.18Pos + 0.15Copy + 0.10Iso + 0.05Shape$. 100-pt rubric checking primary CTA, contact paths, form fields, tap targets. |
| **PDF Generation** | `performance.md §9`, `design.md §7` | **Typst native Rust compiler** (supersedes headless Chromium); consumes first-party `.typ` templates + JSON data; 0.1–0.3 vCPU-s; vector annotations; zero browser attack surface. |
| **Outbox & Events** | `architecture.md §4`, `backend.md §6`, `schema.sql` | `outbox` table with `FOR UPDATE SKIP LOCKED` relay. BullMQ job deduplication using `jobId = audit_id`. Redis Streams for SSE reconnection (`Last-Event-ID`). |

---

## 7. Senior Developer Recommendations & Guardrails

1. **Enforce Supersession Rigor**: Ensure engineering teams do not implement deprecated patterns (e.g. running 3 full throttled Lighthouse passes on every run or rendering PDFs with headless Chromium). `performance.md` and `schema.sql` are the authoritative implementation standards.
2. **Maintain Strict Pure Functions**: Keep `packages/domain` completely free of I/O. Scoring, rubric evaluation, prominence calculation, and priority formulas must run as 100% unit-tested pure functions.
3. **CI Plan-Gating**: Keep the CI SQL explain-plan linter active to prevent developers from querying partitioned tables without bounded `created_at` predicates.
4. **Golden Set Guard**: Run the 600-site golden regression set on every model, prompt, Chromium, or scoring code change. Block any release causing >3 points drift on deterministic modules or >5 points on Clarity.

---
*Authored by Senior Engineering Architect | ConvertAudit AI Platform*
