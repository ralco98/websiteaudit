# ConvertAudit AI — Backend Flow & Implementation Blueprint

> How the backend actually executes: repository layout, request lifecycle, worker pipelines, and reference implementations for the performance-critical pieces (credit reservation, rate limiting, single-flight, outbox, capture/analysis workers, SSE, LLM cascade). Code is TypeScript unless noted and is written to be lifted into the codebase, not to be pseudo-illustrative.

---

## 1. Repository Layout (pnpm monorepo)

```
convertaudit/
├─ apps/
│  ├─ web/                    Next.js (RSC), report UI, marketing
│  ├─ api/                    Fastify HTTP API (control plane)
│  ├─ sse-gateway/            Streaming gateway (uWebSockets.js)
│  ├─ orchestrator/           Audit state machine, outbox relay, sweeper, scheduler
│  ├─ worker-capture/         Runs inside microVM: Chromium/Lighthouse/Playwright
│  ├─ worker-analyze/         Speed, Conversion, Clarity, Scoring (no browser)
│  ├─ worker-render/          Typst PDF/preview renderer (no network)
│  └─ egress-proxy/           SSRF-guard forward proxy (Go)
├─ packages/
│  ├─ domain/                 Pure logic: scoring, finding catalog, priority (no I/O, 100% unit-tested)
│  ├─ contracts/              TypeBox schemas → OpenAPI, event envelopes, report.v1
│  ├─ db/                     SQL files + typed query layer (no ORM on hot paths)
│  ├─ policy/                 Central authorization (deny-by-default)
│  ├─ ssrf/                   URL normalization + IP range logic (shared by API & proxy tests)
│  ├─ codec/                  zstd (dictionary), msgpack, uuidv7, content hashing
│  ├─ llm/                    Prompt registry, cascade client, cache, circuit breaker
│  ├─ telemetry/              OTel setup, cost meter, structured logging
│  └─ config/                 Typed config, feature flags
├─ infra/                     Terraform, Helm, Firecracker image build, KEDA scalers
├─ db/migrations/             schema.sql + numbered migrations
└─ tools/                     benchmark harness, golden-set runner, load tests
```

Boundary rules (enforced by dependency-cruiser in CI): `domain` and `ssrf` import nothing else; `worker-capture` may import only `contracts`, `codec`, `telemetry`; `api` never imports worker packages; no package imports `apps/*`.

---

## 2. Request Lifecycle: `POST /v1/audits`

Budget: **p50 25 ms, p95 60 ms**.

```
 1  Edge: TLS, WAF, bot rules                                       (~0 ms server time)
 2  Auth: session/API key → L1 LRU → Redis → DB                      ≤ 1 ms (cached)
 3  Rate limit: Redis Lua (IP, tenant, key, domain)                  ~0.4 ms, 1 RTT
 4  Idempotency: GET idem:{tenant}:{key} → replay if present         ~0.3 ms
 5  Validate & normalize URL (pure CPU)                              ~0.05 ms
 6  Dedupe (Q-02): GET dedupe:{tenant}:{urlhash} → return cached    ~0.3 ms
 7  Capture-cache probe: GET cap:{pv}:{urlhash}                      ~0.3 ms  (flag only; does not block)
 8  Postgres tx (pipelined, 1 RTT): SET LOCAL tenant; reserve credit; INSERT audit; INSERT sites upsert; INSERT outbox   ~4–8 ms
 9  Enqueue job (BullMQ add, or outbox relay picks it up)            ~0.5 ms
10  Cache idempotency + dedupe keys; return 202                      ~0.4 ms
```

### 2.1 Handler

```ts
app.post('/v1/audits', { schema: CreateAuditSchema, preHandler: [authenticate, rateLimit('audit:create')] },
async (req, reply) => {
  const { tenantId, actor } = req.ctx;
  policy.assert(actor, 'audit:create');

  const idem = req.headers['idempotency-key'];
  if (idem) {
    const hit = await redis.get(`idem:${tenantId}:${idem}`);
    if (hit) return reply.code(202).header('Idempotent-Replay', 'true').send(JSON.parse(hit));
  }

  const target = normalizeTarget(req.body.url);            // throws INVALID_URL; syntactic T-01..T-04 only
  const urlHash = sha256(target.normalized).subarray(0, 16);

  if (!req.body.force) {
    const recent = await redis.get(`dedupe:${tenantId}:${hex(urlHash)}`);   // Q-02: 10-minute reuse
    if (recent) return reply.code(200).send(JSON.parse(recent));
  }

  const id = uuidv7();                                     // embeds ms timestamp
  const createdAt = uuidv7Timestamp(id);
  const flags = deriveFlags(req);

  const result = await db.tx(tenantId, async (tx) => {    // SET LOCAL app.tenant_id inside
    const credit = await tx.one(SQL.reserveCredit);        // 0 rows => QUOTA_EXCEEDED
    if (!credit) throw new AppError('QUOTA_EXCEEDED');
    const site = await tx.one(SQL.upsertSite, [target.normalized, urlHash, target.host, req.body.clientId]);
    await tx.none(SQL.insertAudit, [id, tenantId, createdAt, site.id, PROFILE_VERSION, SCORING_VERSION, flags, actor.userId]);
    await tx.none(SQL.insertOutbox, [id, Topic.AuditEnqueue, encode({ id, createdAt, tenantId, url: target.normalized, priority: priorityFor(tenantId, flags) })]);
    return { siteId: site.id };
  });

  const body = { id: toPublicId(id), status: 'QUEUED', estimated_seconds: etaFor(target), links: linksFor(id) };
  await Promise.all([
    idem && redis.set(`idem:${tenantId}:${idem}`, JSON.stringify(body), 'EX', 86400),
    redis.set(`dedupe:${tenantId}:${hex(urlHash)}`, JSON.stringify({ ...body, deduped: true }), 'EX', 600),
    redis.hset(`audit:${id}:state`, { status: 0, t0: Date.now() }),
  ]);
  return reply.code(202).send(body);
});
```

`upsertSite` is `INSERT … ON CONFLICT (tenant_id, url_hash) DO UPDATE SET client_id = COALESCE(EXCLUDED.client_id, sites.client_id) RETURNING id` — a no-op update keeps the row HOT when nothing changes.

Enqueue path: the `outbox` row is the durable record. The relay (§6) publishes it to the queue within ~5 ms; a direct `queue.add()` after commit is an optimization with the outbox as the safety net (duplicate enqueues are deduplicated by job id = audit id).

---

## 3. Rate Limiting (Atomic Sliding Window, One Round Trip)

```lua
-- KEYS[1] = rl:{dim}:{id};  ARGV = now_ms, window_ms, limit, cost
local now, win, limit, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - win)
local used = redis.call('ZCARD', KEYS[1])
if used + cost > limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = (oldest[2] and (tonumber(oldest[2]) + win - now)) or win
  return {0, used, retry}
end
for i = 1, cost do redis.call('ZADD', KEYS[1], now, now .. ':' .. i .. ':' .. math.random(1e9)) end
redis.call('PEXPIRE', KEYS[1], win)
return {1, used + cost, 0}
```

Multiple dimensions (IP, tenant, key, target domain) are checked with a single `EVALSHA` using multiple `KEYS` in cluster-safe hash-tag form (`{tenantId}:…`) where dimensions co-locate; cross-slot dimensions (domain) use a second pipelined call. Response headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on `429`.

---

## 4. Single-Flight & Capture Cache

Guarantees at most one browser capture per `(profile_version, final-URL)` in any 15-minute window, regardless of how many tenants ask.

```ts
export async function acquireCapture(key: string, auditId: string): Promise<
  | { kind: 'hit'; bundle: BundlePointer }          // reuse
  | { kind: 'leader' }                              // you run the capture
  | { kind: 'follower'; wait: Promise<BundlePointer> }
> {
  const cached = await redis.hgetall(`cap:${key}`);
  if (cached?.bundle) return { kind: 'hit', bundle: decodePointer(cached) };

  const won = await redis.set(`sf:${key}`, auditId, 'PX', 120_000, 'NX');
  if (won) return { kind: 'leader' };

  // follower: subscribe to completion (pub/sub) with a poll fallback, bounded by the audit deadline
  return { kind: 'follower', wait: awaitCapture(key, 110_000) };
}

export async function publishCapture(key: string, ptr: BundlePointer) {
  const p = redis.pipeline();
  p.hset(`cap:${key}`, encodePointer(ptr)).pexpire(`cap:${key}`, CAPTURE_TTL_MS);
  p.publish(`cap-done:${key}`, ptr.bundleHash);
  p.del(`sf:${key}`);
  await p.exec();
}
```

Failure handling: if the leader dies, the `sf:` lock expires (120 s) and the leader's audit is re-queued; followers whose wait times out re-attempt `acquireCapture` once, then fail with `TARGET_UNREACHABLE`. The cache stores only a **pointer to derived, public-content artifacts** (content-addressed), never tenant identifiers.

---

## 5. Orchestration: Job Graph & Transitions

```
audit.enqueue ──► [capture] ──► capture.speedReady ──► [analyze:speed] ─┐
                      │                                                  │
                      ├──────► capture.completed ──► [analyze:conversion]├──► [score] ──► finalize (Q7) ──► outbox → webhooks/monitor diff
                      │                          └─► [analyze:clarity] ──┘
                      └─ failure → retry policy → finalize as FAILED (refund)
```

- **Two capture events**: `capture.speedReady` fires when the Lighthouse JSON is distilled (enabling the ~10–12 s Speed result); `capture.completed` fires after DOM/screenshots are uploaded.
- **Scoring is triggered by a counter, not polling**: each module completion executes `HINCRBY audit:{id}:state done 1` inside a Lua script that returns `true` exactly once when `done == expected` (expected = enabled modules), guaranteeing a single `score` job.
- **Module results** are written to object storage (`analysis/{module}.msgpack.zst`) before the completion event; the scorer reads them by hash. Nothing large travels through Redis.

### 5.1 Worker Skeleton (shared by all queues)

```ts
export function defineWorker<T>(queue: string, handler: (job: T, ctx: JobCtx) => Promise<void>, opts: WorkerOpts) {
  return new Worker(queue, async (job) => {
    const ctx = await JobCtx.from(job);                 // verifies HMAC on envelope, loads tenant, deadline
    if (Date.now() > ctx.deadline) return dropExpired(job);        // never run stale jobs
    const span = tracer.startSpan(`job.${queue}`, { attributes: { audit_id: ctx.auditId, tenant_id: ctx.tenantId } });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new TimeoutError()), ctx.deadline - Date.now());
    try {
      if (!(await beginStep(ctx, queue))) return;       // idempotency: SETNX audit:{id}:step:{queue}:{attempt-independent}
      await handler(job.data as T, { ...ctx, signal: ac.signal });
      await commitStep(ctx, queue);
    } catch (e) {
      throw classify(e);                                // Retryable | Fatal(code) -> BullMQ UnrecoverableError
    } finally { clearTimeout(timer); span.end(); await costMeter.flush(ctx); }
  }, { concurrency: opts.concurrency, limiter: opts.limiter, connection });
}
```

Retry classes: `Retryable` (network, 5xx, OOM, provider 429) → exponential backoff with jitter; `Fatal(code)` (blocked target, schema-invalid after repairs) → immediate finalize path. A **retry budget** (§`performance.md` 11) is charged on each retry.

---

## 6. Transactional Outbox Relay

```ts
async function relayLoop() {
  for (;;) {
    const rows = await db.system.many(SQL.claimOutbox, [200]);       // Q13, FOR UPDATE SKIP LOCKED
    if (!rows.length) { await sleep(rows.idleBackoff()); continue; } // 5 ms → 50 ms adaptive
    await Promise.all(rows.map(r => dispatch(r)));                   // topic → queue.add / webhook enqueue / email
  }
}

async function dispatch(r: OutboxRow) {
  switch (r.topic) {
    case Topic.AuditEnqueue:    return queues.capture.add('capture', decode(r.payload), { jobId: r.key, priority: decode(r.payload).priority, removeOnComplete: true, removeOnFail: 1000 });
    case Topic.AuditCompleted:  return fanoutCompleted(decode(r.payload));   // webhooks, monitor diff, email
    case Topic.AuditFailed:     return fanoutFailed(decode(r.payload));
    case Topic.ExportReady:     return fanoutExport(decode(r.payload));
  }
}
```

Correctness relies on `jobId = audit id` (BullMQ ignores duplicate ids) and idempotent consumers. Multiple relay replicas are safe (`SKIP LOCKED`).

---

## 7. Capture Worker (inside the microVM)

```ts
export async function runCapture(job: CaptureJob, ctx: JobCtx) {
  const t = timers();
  const chrome = await attachToPrewarmedChromium();             // DevTools port from snapshot
  try {
    // 1) Measurement navigation: Lighthouse (performance only, simulated throttling)
    const lh = await runLighthouse(chrome, job.url, {
      onlyCategories: ['performance'], onlyAudits: SPEED_AUDIT_IDS,
      throttlingMethod: 'simulate', formFactor: 'mobile', screenEmulation: MOBILE_390x844,
      skipAudits: ['screenshot-thumbnails', 'final-screenshot', 'full-page-screenshot'],
      signal: ctx.signal,
    });
    const speed = distillSpeed(lh);                              // metrics + top-60 requests + 3rd-party rollup
    const speedPtr = await putBlob(zstd(msgpack(speed)), Kind.SpeedSummary);
    await emit('capture.speedReady', { speedPtr });              // ← Speed analyzer starts now

    // 2) Presentation navigation: Playwright on the SAME Chromium, fresh context, applied throttling
    const page = await freshContext(chrome, { viewport: MOBILE_390x844, dpr: 1, cpuSlowdown: 4, network: SLOW_4G });
    const obs = await navigateAndObserve(page, job.url, { quietMs: 1500, maxWaitMs: 6000 }); // LCP/CLS/long tasks + 5s mark
    const shot5s = await page.screenshotAt(5000, { type: 'webp', quality: 72 });
    const dom = await extractDomLite(page);                      // visible/interactive nodes only
    const hero = extractHero(dom);

    // 3) Adaptive sampling decision (performance.md §3.2)
    const extra = needExtraRuns(speed.metrics, obs);
    const finalMetrics = extra ? await sampleMore(chrome, job.url, extra, speed, obs) : mergeSamples(speed, obs);

    // 4) Upload distilled artifacts in parallel (content-addressed)
    const [domPtr, shotPtr, fullPtr, heroPtr] = await Promise.all([
      putBlob(zstd(msgpack(dom)), Kind.DomLite),
      putBlob(shot5s, Kind.ViewportWebp),
      putBlob(await page.fullPageWebp({ maxHeight: 4000, quality: 65 }), Kind.FullpageWebp),
      putBlob(json(hero), Kind.Hero),
    ]);
    await emit('capture.completed', { speedPtr, domPtr, shotPtr, fullPtr, heroPtr, metrics: finalMetrics, meta: obs.meta, timings: t.done() });
  } finally {
    await chrome.dispose();                                       // VM is destroyed by the supervisor after the job
  }
}
```

The supervisor (outside the VM) enforces the wall-clock deadline, the byte caps through the egress proxy, and tears the VM down regardless of what the guest does.

---

## 8. Analyzers

### 8.1 Speed Analyzer (deterministic)

```ts
export function analyzeSpeed(input: SpeedSummary, crux?: CruxRecord): ModuleResult {
  const m = input.metrics;                                        // lcp, tbt, cls, ttfb, bytes, requests, thirdPartyBlockingMs
  const subscores = {
    lcp:  scoreLogNormal(m.lcp,  { p10: 2500, median: 4000 }),
    tbt:  scoreLogNormal(m.tbt,  { p10: 200,  median: 600 }),
    cls:  scoreLogNormal(m.cls,  { p10: 0.1,  median: 0.25 }),
    ttfb: scoreLogNormal(m.ttfb, { p10: 800,  median: 1800 }),
    weight: scoreLogNormal(m.transferBytes, { p10: 1_000_000, median: 3_000_000 }),
    reqs: scoreLogNormal(m.thirdPartyBlockingMs + m.requests * 2, { p10: 150, median: 600 }),
  };
  const score = Math.round(100 * (0.35*subscores.lcp + 0.20*subscores.tbt + 0.15*subscores.cls + 0.10*subscores.ttfb + 0.10*subscores.weight + 0.10*subscores.reqs));
  return { module: 'speed', score, subscores, findings: detectSpeedFindings(input, m), confidence: stabilityToConfidence(input.stability) };
}
```

`detectSpeedFindings` implements the catalog in `scoring-spec.md §6.1` as pure functions over the distilled summary (no I/O), each returning `{code, severity, params, evidence}`.

### 8.2 Conversion Analyzer (deterministic)

Runs over `dom-lite` in a single pass with typed arrays: build spatial index of nodes by bbox, compute prominence for CTA candidates, run rubric checks (`scoring-spec.md §4`). Target < 30 ms for 5 k nodes.

### 8.3 Clarity Analyzer — Cascade, Cache, Breaker

```ts
export async function analyzeClarity(input: ClarityInput, ctx: JobCtx): Promise<ModuleResult> {
  if (input.optOut) return skipped('SKIPPED_OPT_OUT');
  const key = `llm:${PROMPT_V}:${phash(input.shot)}:${hash(input.hero)}`;
  const cached = await redis.getBuffer(key);
  if (cached) return decodeResult(cached);                        // zero-cost path

  const feats = heroFeatures(input.dom);                          // deterministic evidence
  const first = await breaker.run(() => llm.call(PRIMARY_MODEL, buildPrompt(input, feats), { schema: ClaritySchema, maxTokens: 700, signal: ctx.signal }));
  let result = reconcile(first, feats);                           // clamp AI scores by deterministic guards

  if (needsEscalation(result, feats)) {                           // min conf < 0.6 | AI-vs-feature gap > 15 | near grade boundary
    const passes = await Promise.all([1,2,3].map(() => llm.call(ESCALATION_MODEL, buildPrompt(input, feats), { schema: ClaritySchema, maxTokens: 700, temperature: 0.2, signal: ctx.signal })));
    result = aggregate(passes.map(p => reconcile(p, feats)));     // median + variance -> confidence
  }
  await redis.set(key, encodeResult(result), 'EX', 7 * 86400);
  return result;
}
```

The LLM client validates against the JSON schema, retries invalid output at most twice with a repair instruction, and records `tokens_in/out`, cache-read tokens, model id, and prompt version into the audit's cost meter. The circuit breaker (`5 failures / 30 s`) fast-fails to `AI_UNAVAILABLE`, letting the audit finish `PARTIAL` without waiting.

---

## 9. Scoring & Finalize

```ts
export async function scoreAndFinalize(auditId: string, ctx: JobCtx) {
  const mods = await loadModuleResults(auditId);                  // from object store by pointer
  const scored = scoreAudit(mods, WEIGHTS[ctx.scoringVersion]);   // pure: overall, grade, ordered top fixes, findings
  const snapshot = buildReportV1(scored, mods, ctx.meta);          // canonical JSON (stable key order)
  const packed = zstdDict(canonicalJson(snapshot), dict(ctx.dictId));

  await db.tx(ctx.tenantId, tx => tx.none(SQL.finalizeAudit, finalizeParams(auditId, scored, packed)));  // Q7: single statement
  await publishAuditEvent(auditId, 'audit.completed', summaryOf(scored));                                  // SSE + Redis state
  await redis.pipeline().hset(`audit:${auditId}:state`, { status: scored.status }).pexpire(`audit:${auditId}:state`, 3_600_000).exec();
}
```

`scoreAudit` is a pure function of `(module results, weights@version)`; the same inputs always produce byte-identical snapshots (deterministic ordering, integer arithmetic where possible), which makes caching and regression testing trivial.

---

## 10. SSE Gateway

```ts
uWS.App().get('/v1/audits/:id/events', async (res, req) => {
  const id = req.getParameter(0);
  const auth = await authenticateFast(req);                       // signed short-lived stream token (≤ 60 s) from the API
  if (!auth || !authorize(auth, id)) { res.writeStatus('404').end(); return; }

  res.writeHeader('Content-Type', 'text/event-stream').writeHeader('Cache-Control', 'no-cache').writeHeader('X-Accel-Buffering', 'no');
  const lastId = req.getHeader('last-event-id') || '0-0';
  const sub = streams.subscribe(`audit:${id}:events`, lastId, (evt) => res.cork(() => res.write(formatSse(evt))));
  const hb = setInterval(() => res.cork(() => res.write(': hb\n\n')), 15_000);
  res.onAborted(() => { clearInterval(hb); sub.close(); });
});
```

One shared `XREAD BLOCK` connection per gateway process fans out to all subscribers (no connection per client). The API issues the stream token (HMAC, audit-scoped, 60 s TTL) so the gateway needs no database access.

---

## 11. Sweeper, Scheduler & Housekeeping

| Loop | Interval | Logic |
|---|---|---|
| Sweeper | 30 s | Q12; any audit non-terminal and older than 150 s → finalize `FAILED` (`INTERNAL`) via Q7 semantics, refund, DLQ record |
| Monitor scheduler | 15 s | Q11 `FOR UPDATE SKIP LOCKED` due monitors → create audits through the same domain service as the API (credit reserve included); `next_run_at` advanced with jitter ±5% to prevent thundering herds |
| Redis→DB flusher | 60 s | Flush API-key `last_used_at`, view counters in one batched statement |
| Blob GC | 1 h | Delete zero-ref objects after grace |
| Dictionary trainer | monthly | See `database.md §11` |

---

## 12. Backpressure, Timeouts & Failure Matrix

| Failure | Detection | Behavior |
|---|---|---|
| Target slow / hung | Navigation timeout (30 s) | Retry ×2 (5 s, 20 s), then `TARGET_UNREACHABLE`; credit refunded |
| Target blocks crawler | 403/401/challenge page heuristic | `TARGET_FORBIDDEN`, no retry |
| Sandbox OOM | cgroup event | Retry once with `lowMemory` profile (skip fullpage screenshot); then `FAILED` |
| Egress proxy rejects | Proxy 4xx with `x-deny-reason` | `TARGET_BLOCKED`; security log |
| LLM timeout / 5xx | Client error | Hedged retry; breaker; `PARTIAL` |
| Redis down | Client errors, health check | API fails closed for `POST /audits` (503), reads served from Postgres; workers pause consuming |
| Postgres primary down | Failover | Writers retry with backoff ≤ 10 s; API returns 503 for writes; reads from replicas continue |
| Queue backlog | Wait-time metric | Shed free-tier per `performance.md §11`; scale capture pool |
| Poison job | Attempts exhausted | DLQ, finalize `FAILED`, refund, page if DLQ depth > 25 |
| Duplicate delivery | Step key exists | Handler returns immediately |
| Worker crash mid-job | Lock timeout (BullMQ) | Job re-delivered; idempotent step key + deterministic outputs |

Graceful shutdown: on SIGTERM, workers stop taking jobs, finish in-flight steps (max 60 s), and re-queue anything unfinished; Kubernetes `terminationGracePeriodSeconds: 90` and `preStop` drain hook.

---

## 13. Configuration & Feature Flags

```ts
export const config = defineConfig({
  profile: { version: 14, viewport: [390, 844], cpuSlowdown: 4, network: 'slow4g' },
  scoring: { version: 3, weights: { speed: 0.35, clarity: 0.35, conversion: 0.30 } },
  capture: { cacheTtlSec: 900, quietMs: 1500, maxWaitMs: 6000, maxBytes: 60 * 2**20, adaptiveSampling: true },
  clarity: { primaryModel: env('CLARITY_PRIMARY'), escalationModel: env('CLARITY_ESCALATION'), promptVersion: '2.4.0', escalationConf: 0.6 },
  limits:  { auditCostCeilingMicros: 100_000, targetCostMicros: 20_000 },
  flags:   { snapshotRestore: true, typstRender: true, llmResultCache: true },
});
```

All flags are evaluated per audit and recorded on the audit (`profile_version`, `scoring_version`, prompt version) so any result is reproducible. Kill switches (capture, clarity, export, signup) propagate within 5 s via Redis pub/sub.

---

## 14. Observability Contract (per audit)

Every audit emits one trace with spans: `api.accept`, `queue.wait`, `sandbox.restore`, `capture.lighthouse`, `capture.present`, `upload`, `analyze.speed|conversion|clarity`, `score`, `finalize`. A **cost meter** attributes: browser vCPU-seconds, peak RSS, bytes egressed, LLM tokens (in/out/cache-read), storage bytes, and computes `cost_micros` (stored in `audits.cost_micros`). Dashboards: stage latency heatmaps, cache hit ratios (capture/LLM/report), adaptive-sampling extra-run rate, escalation rate, cost per audit by plan, top 20 slowest domains.
