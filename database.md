# ConvertAudit AI — Database Design & Query Performance

> Companion to `schema.sql` (the authoritative DDL). This document explains *why* the schema looks the way it does, lists every hot query with its plan and latency budget, and specifies the Postgres/Redis configuration required to hit those budgets.

---

## 1. Design Goals

| Goal | Target | Enforced by |
|---|---|---|
| Hot reads are a single indexed lookup | p95 ≤ 15 ms | Read models, covering indexes, plan gates in CI |
| Minimal write amplification | 2 statements / audit | Redis for transient state, one finalize CTE |
| Small rows, small indexes | ≤ 350 B per audit row incl. indexes | `smallint` enums, column ordering, ≤ 4 indexes |
| Cheap retention | Zero-bloat deletion | Monthly range partitions, `DETACH … DROP` |
| Hard tenant isolation with no perf penalty | 0 cross-tenant leaks; < 3% RLS overhead | RLS + `InitPlan`-cached predicate + tenant-leading indexes |
| Predictable growth | Linear, capacity-plannable | Partitioning, archive to Parquet |

---

## 2. Principles

1. **Immutable facts, mutable read models.** Audits never change after finalize (except a bounded `revision` bump). That makes precomputed read models (`sites` latest columns, `audit_reports` snapshot) always consistent.
2. **Dictionary-encode everything repetitive.** Statuses, severities, modules, finding codes → `smallint`. URLs and hostnames stored once in `sites`.
3. **Narrow tables, wide blobs.** Rows that are queried, filtered, or joined stay narrow. Rich content (findings text, evidence pointers, waterfall summary) lives in one compressed snapshot fetched by primary key.
4. **Every index earns its keep.** Maximum 4 indexes on any hot table; each maps to a named query in §5.
5. **Partition pruning is mandatory** on partitioned tables (lint rule, §3.3).
6. **No ORMs in hot paths.** Hand-written parameterized SQL through a typed query layer (prepared statements, pipelining).

---

## 3. Partitioning

### 3.1 Strategy

| Table | Partitioning | Retention action |
|---|---|---|
| `audits`, `audit_reports`, `audit_finding_index`, `audit_artifacts` | `RANGE (created_at)` monthly | Per plan: detach + drop monthly; summary rows preserved separately (§3.4) |
| `usage_ledger` | Monthly | Kept 7 years (compliance), older partitions moved to cold storage as Parquet |
| `webhook_deliveries` | Weekly | Drop after 14 days |
| `sites`, `tenants`, `users`, `brand_profiles`, `api_keys`, `monitors`, `tenant_credits` | Not partitioned (small, hot) | — |

### 3.2 The UUIDv7 Point-Lookup Trick

Public IDs are UUIDv7: the first 48 bits are a Unix-millisecond timestamp. The API sets `audits.created_at` to exactly that instant when inserting. To fetch one audit:

```ts
const createdAt = new Date(Number(BigInt('0x' + id.replace(/-/g, '').slice(0, 12))));
// SELECT … FROM audits WHERE created_at = $1 AND id = $2
```

Because `created_at` is an equality predicate on the partition key, the planner prunes to **exactly one partition** and uses the PK `(created_at, id)`: a single index probe (≈ 0.1 ms buffer-resident). Users cannot forge a tenant-crossing lookup: RLS still enforces `tenant_id`, and mismatches return zero rows → `404`.

### 3.3 Pruning Rules (CI-Enforced)

- Any query touching a partitioned table MUST include an equality or a bounded range on `created_at`. A static SQL linter rejects statements without it.
- List queries default to `created_at >= now() - interval '90 days'` and the client passes an explicit cursor for older pages.
- Each partition's `CHECK` bounds allow constraint exclusion at plan time and run time.

### 3.4 Summary Survival After Retention

When an audit's artifacts and snapshot expire, the *facts needed for trend charts* survive in `sites` (latest) and in a compact `audit_summary` rollup (one row per audit, 40 bytes: `created_at, tenant_id, site_id, overall, speed, clarity, conversion, profile_version`) written monthly into an unpartitioned, BRIN-friendly `audit_trend` table before the partition is dropped. Long-range trend charts read from `audits` for the retained window and `audit_trend` beyond it (`UNION ALL`, both covering).

```sql
CREATE TABLE audit_trend (
  tenant_id uuid NOT NULL, site_id bigint NOT NULL, created_at timestamptz NOT NULL,
  overall smallint, speed smallint, clarity smallint, conversion smallint, profile_version smallint,
  PRIMARY KEY (tenant_id, site_id, created_at)
) WITH (fillfactor = 100);
```

---

## 4. Row-Level Security Without the Tax

- Policy uses `tenant_id = (SELECT app_tenant())` — the scalar sub-select is evaluated **once** as an `InitPlan`, not per row, so the tenant predicate becomes an index-range bound.
- `app_tenant()` reads `current_setting('app.tenant_id', true)`; the API executes `SET LOCAL app.tenant_id = $1` at the start of every transaction (works with PgBouncer transaction pooling because it is transaction-scoped).
- `FORCE ROW LEVEL SECURITY` is on so even the table owner is bound; the application role has `NOBYPASSRLS`.
- Because RLS predicates are combined with the query's own predicates, **all indexes lead with `tenant_id`** so the planner uses one index range for both purposes.
- Administrative/background jobs that need cross-tenant scans (sweeper, monitor scheduler, GC) use a separate `ca_system` role with narrowly scoped `SECURITY DEFINER` functions; their code paths are audited and never reachable from request handlers.
- Anonymous share-link resolution uses a `SECURITY DEFINER` function `resolve_share(token_hash)` returning only `(audit_id, audit_created_at, tenant_id, brand_id, brand_version)`; the subsequent report fetch runs under that tenant context.

---

## 5. Query Catalog (Hot Paths)

Every query has an owner test in `testing.md §6` asserting its plan (index name and node type) and an execution-time budget on a 100 M-row synthetic dataset.

| # | Name | Frequency | Budget (DB time p95) | Plan requirement |
|---|---|---|---:|---|
| Q1 | Get audit by ID | very high | 1.5 ms | 1 partition, PK index scan |
| Q2 | Get report snapshot | very high | 2.5 ms | 1 partition, PK index scan, ≤ 25 KB row |
| Q3 | List audits (keyset) | high | 6 ms | `audits_tenant_recent` ordered scan / Merge Append with LIMIT |
| Q4 | Site trend | medium | 4 ms | `audits_site_trend` **Index Only Scan**, heap fetches ≈ 0 |
| Q5 | Dashboard sites | high | 3 ms | `sites_tenant_recent` |
| Q6 | Reserve credit | high | 1 ms | PK update, row lock |
| Q7 | Finalize audit | high | 12 ms | Single CTE statement |
| Q8 | Resolve API key | very high | 1 ms (usually Redis) | `api_keys_key_hash_key` unique |
| Q9 | Resolve share token | high | 1 ms (usually Redis) | PK |
| Q10 | Issue history for site | low | 8 ms | `afi_site_code` |
| Q11 | Due monitors | scheduler | 3 ms | `monitors_due` partial |
| Q12 | Stuck audits sweeper | every 30 s | 2 ms | `audits_active` partial |
| Q13 | Outbox relay | continuous | 2 ms | `outbox_unpublished` partial + `SKIP LOCKED` |

### Q1 — Get audit by ID
```sql
SELECT id, created_at, site_id, status, score_overall, score_speed, score_clarity, score_conversion,
       grade, mod_speed, mod_clarity, mod_conversion, finished_at, duration_ms, revision, error_code
FROM audits
WHERE created_at = $1 AND id = $2;            -- RLS adds tenant_id = InitPlan
```

### Q2 — Get latest report snapshot
```sql
SELECT revision, dict_id, snapshot
FROM audit_reports
WHERE created_at = $1 AND audit_id = $2
ORDER BY revision DESC
LIMIT 1;                                       -- PK (created_at, audit_id, revision)
```
The application decompresses with the cached zstd dictionary for `dict_id` (dictionaries preloaded in memory, ~110 KB each) — ≈ 40 µs for a 10 KB payload — then caches the decoded bytes in Redis/CDN keyed by `(audit_id, revision)`.

### Q3 — List audits (keyset pagination, no OFFSET)
```sql
SELECT id, created_at, site_id, status, score_overall, grade
FROM audits
WHERE tenant_id = (SELECT app_tenant())       -- explicit for the planner
  AND created_at >= $3                        -- window lower bound (default now()-90d)
  AND (created_at, id) < ($1, $2)             -- cursor from previous page
  AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 26;                                     -- 25 + 1 to detect next page
```
`site_id → host` is resolved by a single `SELECT id, host FROM sites WHERE id = ANY($1)` (≤ 25 ids) or an in-process LRU; there is no join in the hot query.

### Q4 — Site trend (index-only)
```sql
SELECT created_at, score_overall, score_speed, score_clarity, score_conversion, profile_version
FROM audits
WHERE tenant_id = (SELECT app_tenant()) AND site_id = $1
  AND created_at >= $2 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 90;
```
All selected columns are in the `INCLUDE` list → **Index Only Scan**. Autovacuum keeps the visibility map fresh (`vacuum_scale_factor` 0.02 on the current partitions).

### Q5 — Dashboard
```sql
SELECT id, host, last_audit_id, last_audited_at, last_overall, last_speed, last_clarity,
       last_conversion, last_grade, audit_count
FROM sites
WHERE tenant_id = (SELECT app_tenant())
ORDER BY last_audited_at DESC NULLS LAST
LIMIT 50;
```

### Q6 — Reserve credit (atomic, contention-safe)
```sql
UPDATE tenant_credits
SET reserved = reserved + 1, updated_at = now()
WHERE tenant_id = (SELECT app_tenant())
  AND (allowance - used - reserved) + topup >= 1
RETURNING (allowance - used - reserved) + topup AS available;
-- 0 rows => QUOTA_EXCEEDED
```
One row per tenant: high-frequency agencies contend on that row, but each update is < 0.2 ms; `fillfactor=70` keeps updates HOT. For enterprise tenants exceeding ~500 audits/s, reservation shards into N counter rows (documented escape hatch).

### Q7 — Finalize audit (single round trip)
```sql
WITH a AS (
  UPDATE audits
     SET status = $3, finished_at = now(), duration_ms = $4,
         score_overall = $5, score_speed = $6, score_clarity = $7, score_conversion = $8,
         grade = $9, mod_speed = $10, mod_clarity = $11, mod_conversion = $12,
         cost_micros = $13, error_code = $14, credit_state = $15
   WHERE created_at = $1 AND id = $2 AND status < 10          -- idempotent: only first finalize wins
  RETURNING id, tenant_id, site_id, created_at
), r AS (
  INSERT INTO audit_reports (audit_id, tenant_id, created_at, raw_size, dict_id, snapshot)
  SELECT id, tenant_id, created_at, $16, $17, $18 FROM a
), f AS (
  INSERT INTO audit_finding_index (audit_id, tenant_id, created_at, site_id, priority, code_id, severity, rank)
  SELECT a.id, a.tenant_id, a.created_at, a.site_id, x.priority, x.code_id, x.severity, x.rank
  FROM a, unnest($19::real[], $20::smallint[], $21::smallint[], $22::smallint[])
       AS x(priority, code_id, severity, rank)
), s AS (
  UPDATE sites SET last_audit_id = a.id, last_audited_at = now(), audit_count = audit_count + 1,
         last_overall = $5, last_speed = $6, last_clarity = $7, last_conversion = $8,
         last_grade = $9, last_status = $3
  FROM a WHERE sites.id = a.site_id
), c AS (
  UPDATE tenant_credits
     SET reserved = reserved - 1,
         used  = used  + CASE WHEN $3 IN (10,11) AND allowance - used > 0 THEN 1 ELSE 0 END,
         topup = topup - CASE WHEN $3 IN (10,11) AND allowance - used <= 0 THEN 1 ELSE 0 END,
         updated_at = now()
  FROM a WHERE tenant_credits.tenant_id = a.tenant_id
), l AS (
  INSERT INTO usage_ledger (audit_id, tenant_id, delta, kind)
  SELECT id, tenant_id, CASE WHEN $3 IN (10,11) THEN -1 ELSE 0 END, CASE WHEN $3 IN (10,11) THEN 2 ELSE 3 END FROM a
)
INSERT INTO outbox (key, topic, payload)
SELECT id, CASE WHEN $3 IN (10,11) THEN 1 ELSE 2 END, $23 FROM a;
```
Data-modifying CTEs all execute exactly once, atomically, in one round trip. `WHERE status < 10` makes the statement idempotent under at-least-once job delivery: a duplicate finalize updates zero rows and therefore inserts nothing anywhere.

### Q10 — Issue history for a site
```sql
SELECT created_at, audit_id, severity, priority
FROM audit_finding_index
WHERE tenant_id = (SELECT app_tenant()) AND site_id = $1 AND code_id = $2 AND created_at >= $3
ORDER BY created_at DESC LIMIT 30;
```

### Q13 — Outbox relay
```sql
WITH batch AS (
  SELECT id FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED
)
UPDATE outbox o SET published_at = now() FROM batch WHERE o.id = batch.id
RETURNING o.id, o.key, o.topic, o.payload;
-- publish to the queue AFTER the tx commits; mark-then-publish is safe because
-- consumers are idempotent and a crash between commit and publish is healed by
-- the sweeper re-enqueuing rows whose downstream effect is missing.
```
Published rows are deleted in batches every minute (`DELETE … WHERE published_at < now() - interval '1 hour' LIMIT 5000`), keeping the table and its indexes tiny.

---

## 6. Write-Path Design

| Concern | Design |
|---|---|
| **Accept path** | One transaction: `Q6` reserve → `INSERT audits` (status 0) → `INSERT outbox(topic=enqueue)` (or direct enqueue after commit with outbox as fallback). Two statements pipelined in one round trip. |
| **Transient progress** | Redis Stream `audit:{id}` + hash `audit:{id}:state` (stage, module statuses, timestamps). Not written to Postgres. |
| **Intermediate state durability** | Module outputs are written to object storage (content-addressed); a crash recovers by re-reading them. |
| **Status writes** | Only two DB status transitions: `QUEUED → CAPTURING` (single UPDATE when a worker claims; skipped if cached capture) and the finalize CTE. |
| **HOT updates** | Hot mutable tables (`sites`, `tenant_credits`, `blobs`, `outbox`) use `fillfactor 70–85`; their updated columns are deliberately excluded from indexes where possible. |
| **Counters** | API-key `last_used_at`, share-link view counts, and per-tenant usage stats increment in Redis and flush every 60 s in one multi-row `UPDATE … FROM (VALUES …)`. |
| **Batching** | Ledger inserts, artifact inserts, and blob refcount changes use multi-row `INSERT … SELECT unnest(…)`; background writers use `COPY` for bulk paths. |
| **Idempotency** | `Idempotency-Key` stored in Redis (24 h) with a Postgres fallback via `usage_ledger.idem_key` unique index for billing-relevant operations. |
| **Deletion** | User delete = `UPDATE audits SET deleted_at` (cheap); hard delete = partition drop at retention or a batched job for early tenant deletion using `DELETE … USING (SELECT ctid … LIMIT 5000)`. |

---

## 7. Connection Management & Topology

```
API pods ─► PgBouncer (transaction pooling, 2000 client conns → 60 server conns)
             ├─► Primary   (writes, read-your-writes, Q6/Q7)
             └─► Replicas ×2 (async, Q3/Q4/Q5/Q10, analytics)
Workers ─► Redis + Object store only (no DB credentials)
Orchestrator/relay ─► Primary via dedicated pool
```

| Setting | Value |
|---|---|
| Prepared statements | Protocol-level (PgBouncer ≥ 1.21 with `max_prepared_statements`) |
| `statement_timeout` | 3 s (API), 60 s (background) |
| `lock_timeout` | 1 s |
| `idle_in_transaction_session_timeout` | 5 s |
| Read routing | Lists/trends/dashboard → replica; anything within 5 s of a write by the same session → primary (LSN token in cookie/header: `X-Min-LSN`; replica must have replayed ≥ LSN or request falls back to primary) |
| Replica lag alert | > 2 s p95 |
| Pool sizing | Server connections ≈ `cores × 2 + disks`; overload is handled by PgBouncer queueing, not by more connections |

---

## 8. PostgreSQL Configuration (Primary: 16 vCPU / 64 GiB / NVMe)

```ini
# Memory
shared_buffers = 16GB
effective_cache_size = 48GB
work_mem = 16MB                 # small; queries are index-driven
maintenance_work_mem = 2GB
huge_pages = try

# WAL & durability
wal_level = replica
wal_compression = zstd          # PG15+
wal_buffers = 64MB
max_wal_size = 32GB
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
synchronous_commit = on         # financial data; off only for teaser-audit inserts via per-txn SET LOCAL

# Storage/compression
default_toast_compression = lz4
random_page_cost = 1.1          # NVMe
effective_io_concurrency = 200

# Planner / partitions
enable_partition_pruning = on
plan_cache_mode = auto
jit = off                       # short OLTP queries: JIT hurts p99
default_statistics_target = 200

# Autovacuum (partition-friendly)
autovacuum_max_workers = 6
autovacuum_naptime = 15s
autovacuum_vacuum_scale_factor = 0.02
autovacuum_analyze_scale_factor = 0.01
autovacuum_vacuum_insert_scale_factor = 0.05   # keeps visibility maps fresh for index-only scans

# Observability
shared_preload_libraries = 'pg_stat_statements,auto_explain'
auto_explain.log_min_duration = 50ms
track_io_timing = on
```

---

## 9. Storage Efficiency at the Row Level

| Table | Avg row bytes (heap) | Index bytes / row | Notes |
|---|---:|---:|---|
| `audits` | ~118 | ~110 (4 indexes, partial) | Column-ordered to avoid padding; enums are `smallint` |
| `audit_reports` | ~10,000 | PK ~40 | Payload `EXTERNAL` (already zstd) |
| `audit_finding_index` (avg 22 rows/audit) | ~52 | ~45 | ≈ 2.1 KB / audit total |
| `audit_artifacts` (2 rows/audit) | ~70 | ~40 | Hash pointers only |
| `usage_ledger` (2 rows/audit) | ~48 | ~50 | Append-only |
| **Per audit total (DB)** | | **≈ 13 KB** | Dominated by the report snapshot |

Compare to the original design (`findings` rows with text and JSONB evidence): ≈ 45–60 KB per audit in the database alone.

Other techniques:
- **Hashes as `bytea`** (32 B) rather than hex `text` (64 B + header).
- **`bigint` surrogate keys** for sites/brands/clients (8 B) instead of UUIDs (16 B) wherever the ID is never exposed publicly.
- **Partial indexes** for everything with a skewed predicate (`deleted_at IS NULL`, `status < 10`, `revoked_at IS NULL`).
- **No JSONB on hot rows**: only `brand_profiles.tokens` (tiny, cold) uses JSONB.
- **Index maintenance cost** tracked as "index bytes per audit"; CI fails if a migration adds > 20 B/audit without approval.

---

## 10. Redis Design

| Key pattern | Type | TTL | Purpose | Memory / item |
|---|---|---|---|---:|
| `audit:{id}:state` | Hash | 1 h after terminal | Stage + module status for polling and SSE bootstrap | ~300 B |
| `audit:{id}:events` | Stream (MAXLEN ~ 200) | 10 min after terminal | SSE replay | ~2 KB |
| `rl:{dim}:{id}` | String / Lua sliding window | window | Rate limits | ~80 B |
| `sess:{sid}` | Hash | 7 d sliding | Session | ~400 B |
| `key:{hash}` | Hash | 5 min | Resolved API key + scopes + tenant | ~250 B |
| `share:{hash}` | Hash | 60 s | Token → audit pointer | ~200 B |
| `cap:{pv}:{urlhash}` | Hash | 15 min | Capture-cache pointer + bundle hash | ~250 B |
| `sf:{pv}:{urlhash}` | String (NX lock) | 120 s | Single-flight lock | ~60 B |
| `llm:{pv}:{ph}:{hh}` | String (msgpack) | 7 d | LLM result cache | ~1.5 KB |
| `report:{id}:{rev}` | String (decoded JSON) | 24 h | Hot report bytes (CDN is primary cache) | ~12 KB |
| `idem:{tenant}:{key}` | String | 24 h | Idempotent replay | ~300 B |
| `dom:{domain}:cnt` | Counter | 1 h | Per-domain protective limit | ~60 B |

- Redis is **cache and coordination only**; loss of Redis never loses billing or audit facts (Postgres holds them). On Redis failover, active audits are re-derived from queue state + object store; clients reconnect SSE and receive the reconstructed state.
- Memory budget at 5 k concurrent audits and 200 k hot reports: ≈ 3.5 GiB; use `maxmemory-policy volatile-lru`, cluster mode beyond 25 GiB.
- Lua scripts (rate limit, token bucket, single-flight) run atomically and keep round trips to 1.

---

## 11. Maintenance & Operations

| Job | Schedule | Action |
|---|---|---|
| Partition creator | Daily 02:00 UTC | Ensure 3 future monthly partitions per table (idempotent) |
| Retention | Daily | Per-tenant early expiry batches; monthly whole-partition drop after Parquet export + `audit_trend` rollup |
| Dictionary trainer | Monthly | Train zstd dictionary on 50 k recent reports; insert new `dict_id`; old ids remain decodable |
| Blob GC | Hourly | Delete objects where `refcount = 0 AND last_ref_at < now() - 24h` (batch 1000) |
| Sweeper (Q12) | Every 30 s | Finalize audits stuck > 150 s as `FAILED`, refund credit, DLQ record |
| Outbox trimmer | Every minute | Delete published rows older than 1 h |
| Ledger reconciliation | Hourly | Verify `tenant_credits` equals ledger-derived balance; alert on drift |
| Bloat & index health | Weekly | `pgstattuple` on hot tables; `REINDEX CONCURRENTLY` when bloat > 30% |
| Backup | Continuous WAL + daily base | PITR 35 days; restore drill quarterly |
| Stats | After each new partition's first 10 k rows | `ANALYZE` to prime the planner |

---

## 12. Scale-Out Path

| Stage | Trigger | Action |
|---|---|---|
| 1 | Primary CPU > 60% or replicas lag | Add read replicas; move dashboards/trends fully to replicas |
| 2 | > 50 k audits/day writes on one primary near limits | Vertical scale (up to 64 vCPU); move `usage_ledger` and `webhook_deliveries` to a separate cluster |
| 3 | > 1 B rows in `audit_finding_index` | Archive to ClickHouse/Parquet; keep last 90 days in Postgres |
| 4 | Multi-region data residency | One cluster per region (tenant.region pins placement); global control-plane holds only routing metadata |
| 5 | Extreme single-cluster limits | Citus/tenant-hash sharding on `tenant_id` (all tables already lead with it and carry it) |

Analytics (product metrics, anonymized cohort benchmarks, cost dashboards) run on **ClickHouse** fed via CDC from the outbox/Parquet, never on the OLTP primary.

---

## 13. Performance Verification for the Database

1. **Synthetic dataset**: generator produces 100 M audits across 20 k tenants with Zipfian tenant skew (a few agencies own 30% of rows).
2. **Plan snapshots**: CI runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for Q1–Q13 and asserts:
   - expected index names and node types (e.g., `Index Only Scan using audits_site_trend`),
   - `Heap Fetches` ≤ 2% for Q4,
   - `Buffers: shared hit+read` under per-query ceilings (Q1 ≤ 8, Q2 ≤ 12, Q3 ≤ 40),
   - no `Seq Scan` and no partition-wide `Append` over more than the expected partitions.
3. **Load test**: k6 + pgbench mix at 3× projected peak (§`testing.md`); p95/p99 budgets from §5 must hold; connection-pool wait p99 ≤ 10 ms.
4. **Migrations**: `pg_repack`-free by design; every migration runs against a production-sized clone with `lock_timeout=1s` and must finish without blocking; new indexes use `CREATE INDEX CONCURRENTLY` per partition.
5. **Regression alarms**: `pg_stat_statements` dashboards alert if any catalog query's mean time grows > 30% week over week or `shared_blks_read` per call doubles.
