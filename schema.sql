-- =============================================================================
-- ConvertAudit AI — PostgreSQL 16 schema (authoritative)
-- Supersedes architecture.md §5.2.  See database.md for rationale & query catalog.
--
-- Conventions
--   * Column order inside every table: 16-byte types, 8-byte types, 4-byte,
--     2-byte, 1-byte, then variable-length — minimizes alignment padding.
--   * Enumerations are smallint (dictionary in comments) — smaller, faster than
--     enum/text and cheap to index.
--   * Public IDs for audits are UUIDv7 (time-ordered). audits.created_at equals
--     the millisecond timestamp embedded in the id, so point lookups can supply
--     created_at and hit exactly one partition.
--   * Every tenant-owned table has tenant_id and an RLS policy.
--   * Apply as migration 0001. Run as a role that OWNS objects; the application
--     role is created WITHOUT BYPASSRLS.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ----- Tenant context helper (wrapped in SELECT inside policies so the planner
-- ----- evaluates it once per query as an InitPlan instead of per row) ---------
CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- ----- Status dictionaries ----------------------------------------------------
-- audits.status      : 0 QUEUED, 1 VALIDATING, 2 CAPTURING, 3 ANALYZING, 4 SCORING,
--                      10 COMPLETE, 11 PARTIAL, 12 FAILED, 13 CANCELED   (>=10 terminal)
-- module status      : 0 PENDING, 1 RUNNING, 2 SUCCEEDED, 3 FAILED, 4 SKIPPED
-- credit_state       : 0 RESERVED, 1 COMMITTED, 2 REFUNDED, 3 NONE
-- grade              : 0 A, 1 B, 2 C, 3 D, 4 F, 9 NOT_SCORED
-- severity           : 1 info, 2 low, 3 medium, 4 high, 5 critical
-- module             : 1 speed, 2 clarity, 3 conversion
-- plan               : 0 free, 1 starter, 2 agency, 3 agency_pro, 4 enterprise
-- role               : 0 owner, 1 admin, 2 member, 3 viewer
-- audits.flags bits  : 1 forced_fresh, 2 cached_capture, 4 teaser, 8 monitor, 16 api

-- =============================================================================
-- Identity & tenancy
-- =============================================================================
CREATE TABLE tenants (
  id            uuid        PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  stripe_customer_id text   UNIQUE,
  plan          smallint    NOT NULL DEFAULT 0,
  type          smallint    NOT NULL DEFAULT 0,      -- 0 solo, 1 agency
  region        smallint    NOT NULL DEFAULT 0,      -- 0 us, 1 eu
  retention_days smallint   NOT NULL DEFAULT 7,
  name          text        NOT NULL
);

CREATE TABLE users (
  id            uuid        PRIMARY KEY,
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  role          smallint    NOT NULL DEFAULT 2,
  mfa_enabled   boolean     NOT NULL DEFAULT false,
  email         citext      NOT NULL UNIQUE,
  name          text,
  password_hash text,                                  -- argon2id; NULL for SSO-only
  totp_secret_enc bytea                                -- AES-256-GCM envelope
);
CREATE INDEX users_tenant ON users (tenant_id);

CREATE TABLE api_keys (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  last_used_at  timestamptz,                           -- flushed from Redis every 60 s (avoids hot writes)
  scopes        integer     NOT NULL,                  -- bitmask
  key_hash      bytea       NOT NULL UNIQUE,           -- sha256(secret), 32 bytes
  prefix        text        NOT NULL,
  ip_allow      cidr[]
);
CREATE INDEX api_keys_tenant ON api_keys (tenant_id) WHERE revoked_at IS NULL;

-- =============================================================================
-- Sites (dimension + latest-result read model) and clients
-- =============================================================================
CREATE TABLE clients (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  name       text        NOT NULL
);
CREATE INDEX clients_tenant ON clients (tenant_id);

CREATE TABLE sites (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  last_audit_id  uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_audited_at timestamptz,
  client_id      bigint      REFERENCES clients(id) ON DELETE SET NULL,
  audit_count    integer     NOT NULL DEFAULT 0,
  url_hash       bytea       NOT NULL,                 -- first 16 bytes of sha256(normalized_url)
  last_overall   smallint,
  last_speed     smallint,
  last_clarity   smallint,
  last_conversion smallint,
  last_grade     smallint,
  last_status    smallint,
  normalized_url text        NOT NULL,
  host           text        NOT NULL,
  UNIQUE (tenant_id, url_hash)
) WITH (fillfactor = 85);                              -- room for HOT updates
CREATE INDEX sites_tenant_recent ON sites (tenant_id, last_audited_at DESC NULLS LAST);

-- =============================================================================
-- Audits (partitioned monthly) — one narrow row per audit
-- =============================================================================
CREATE TABLE audits (
  id               uuid        NOT NULL,               -- UUIDv7
  tenant_id        uuid        NOT NULL,
  previous_audit_id uuid,
  created_by       uuid,
  created_at       timestamptz NOT NULL,               -- == uuidv7 timestamp
  started_at       timestamptz,
  finished_at      timestamptz,
  deleted_at       timestamptz,
  site_id          bigint      NOT NULL,
  monitor_id       bigint,
  cost_micros      integer,                            -- USD * 1e-6
  duration_ms      integer,
  flags            integer     NOT NULL DEFAULT 0,
  status           smallint    NOT NULL DEFAULT 0,
  score_overall    smallint    CHECK (score_overall BETWEEN 0 AND 100),
  score_speed      smallint    CHECK (score_speed BETWEEN 0 AND 100),
  score_clarity    smallint    CHECK (score_clarity BETWEEN 0 AND 100),
  score_conversion smallint    CHECK (score_conversion BETWEEN 0 AND 100),
  grade            smallint,
  mod_speed        smallint    NOT NULL DEFAULT 0,
  mod_clarity      smallint    NOT NULL DEFAULT 0,
  mod_conversion   smallint    NOT NULL DEFAULT 0,
  profile_version  smallint    NOT NULL,
  scoring_version  smallint    NOT NULL,
  error_code       smallint,
  credit_state     smallint    NOT NULL DEFAULT 0,
  revision         smallint    NOT NULL DEFAULT 1,
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

-- Recent-first listing (keyset pagination) and tenant scoping
CREATE INDEX audits_tenant_recent ON audits (tenant_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
-- Trend chart & diff: covering => index-only scans
CREATE INDEX audits_site_trend ON audits (tenant_id, site_id, created_at DESC)
  INCLUDE (score_overall, score_speed, score_clarity, score_conversion, profile_version, status)
  WHERE deleted_at IS NULL;
-- Sweeper for stuck audits: tiny because rows leave the predicate within seconds
CREATE INDEX audits_active ON audits (created_at) WHERE status < 10;
-- Monitor history
CREATE INDEX audits_monitor ON audits (monitor_id, created_at DESC) WHERE monitor_id IS NOT NULL;

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audits
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- =============================================================================
-- Report snapshot — the single-lookup read model (immutable per revision)
-- =============================================================================
CREATE TABLE audit_reports (
  audit_id   uuid        NOT NULL,
  tenant_id  uuid        NOT NULL,
  created_at timestamptz NOT NULL,                     -- == audits.created_at
  raw_size   integer     NOT NULL,
  revision   smallint    NOT NULL DEFAULT 1,
  dict_id    smallint    NOT NULL,                     -- zstd dictionary version
  snapshot   bytea       NOT NULL,                     -- zstd(dict) of canonical report.v1 JSON
  PRIMARY KEY (created_at, audit_id, revision)
) PARTITION BY RANGE (created_at);

ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_reports
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- =============================================================================
-- Narrow finding index: cross-audit analytics & "issue history" only.
-- Full finding bodies live inside audit_reports.snapshot.
-- =============================================================================
CREATE TABLE finding_codes (
  id        smallint PRIMARY KEY,
  module    smallint NOT NULL,
  severity  smallint NOT NULL,                         -- default severity
  effort    smallint NOT NULL CHECK (effort BETWEEN 1 AND 3),
  code      text     NOT NULL UNIQUE
);

CREATE TABLE audit_finding_index (
  audit_id   uuid        NOT NULL,
  tenant_id  uuid        NOT NULL,
  created_at timestamptz NOT NULL,
  site_id    bigint      NOT NULL,
  priority   real        NOT NULL,
  code_id    smallint    NOT NULL,
  severity   smallint    NOT NULL,
  rank       smallint,                                 -- 1..10 for top fixes, NULL otherwise
  PRIMARY KEY (created_at, audit_id, code_id)
) PARTITION BY RANGE (created_at);
CREATE INDEX afi_site_code ON audit_finding_index (tenant_id, site_id, code_id, created_at DESC);

ALTER TABLE audit_finding_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_finding_index FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_finding_index
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- User actions live at SITE level so they persist across re-audits.
-- state: 1 resolved, 2 dismissed, 3 hidden (agency; excluded from PDF)
CREATE TABLE finding_states (
  site_id    bigint      NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  code_id    smallint    NOT NULL REFERENCES finding_codes(id),
  state      smallint    NOT NULL,
  reason     text,
  PRIMARY KEY (site_id, code_id)
);
ALTER TABLE finding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_states FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finding_states
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- =============================================================================
-- Content-addressed blobs (screenshots, logos, PDFs)
-- kind: 1 viewport_webp, 2 fullpage_webp, 3 logo, 4 pdf, 5 speed_summary, 6 dom_lite
-- =============================================================================
CREATE TABLE blobs (
  hash        bytea       PRIMARY KEY,                 -- sha256, 32 bytes
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ref_at timestamptz NOT NULL DEFAULT now(),
  size        integer     NOT NULL,
  refcount    integer     NOT NULL DEFAULT 1,
  kind        smallint    NOT NULL
) WITH (fillfactor = 85);
CREATE INDEX blobs_gc ON blobs (last_ref_at) WHERE refcount = 0;

CREATE TABLE audit_artifacts (
  audit_id   uuid        NOT NULL,
  tenant_id  uuid        NOT NULL,
  created_at timestamptz NOT NULL,
  blob_hash  bytea       NOT NULL REFERENCES blobs(hash),
  width      smallint,
  height     integer,
  kind       smallint    NOT NULL,
  PRIMARY KEY (created_at, audit_id, kind)
) PARTITION BY RANGE (created_at);
ALTER TABLE audit_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_artifacts
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- =============================================================================
-- Credits & ledger
-- =============================================================================
CREATE TABLE tenant_credits (
  tenant_id     uuid        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  period_start  date        NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  allowance     integer     NOT NULL,                  -- monthly credits
  used          integer     NOT NULL DEFAULT 0,
  reserved      integer     NOT NULL DEFAULT 0,
  topup         integer     NOT NULL DEFAULT 0,
  CHECK (used >= 0 AND reserved >= 0 AND topup >= 0)
) WITH (fillfactor = 70);
ALTER TABLE tenant_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_credits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_credits
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- Append-only source of truth for billing. kind: 1 reserve, 2 commit, 3 refund, 4 topup, 5 monthly_reset, 6 adjust
CREATE TABLE usage_ledger (
  audit_id   uuid,
  tenant_id  uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delta      integer     NOT NULL,
  kind       smallint    NOT NULL,
  idem_key   text
) PARTITION BY RANGE (created_at);
CREATE INDEX ledger_tenant ON usage_ledger (tenant_id, created_at DESC);
CREATE UNIQUE INDEX ledger_idem ON usage_ledger (created_at, tenant_id, idem_key) WHERE idem_key IS NOT NULL;
ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_ledger
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- =============================================================================
-- White-label, sharing, exports
-- domain_state: 0 none, 1 pending_dns, 2 verified, 3 cert_issuing, 4 active, 5 suspended
-- =============================================================================
CREATE TABLE brand_profiles (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer     NOT NULL DEFAULT 1,
  logo_hash    bytea       REFERENCES blobs(hash),
  is_default   boolean     NOT NULL DEFAULT false,
  domain_state smallint    NOT NULL DEFAULT 0,
  name         text        NOT NULL,
  tokens       jsonb       NOT NULL,                   -- colors, font, contact, footer, cta
  custom_domain text       UNIQUE
);
CREATE UNIQUE INDEX brand_default_one ON brand_profiles (tenant_id) WHERE is_default;
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON brand_profiles
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

CREATE TABLE share_links (
  token_hash    bytea       PRIMARY KEY,               -- sha256(token), 32 bytes
  audit_id      uuid        NOT NULL,
  tenant_id     uuid        NOT NULL,
  audit_created_at timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  brand_id      bigint      REFERENCES brand_profiles(id) ON DELETE SET NULL,
  brand_version integer,
  password_hash text
);
CREATE INDEX share_audit ON share_links (tenant_id, audit_id) WHERE revoked_at IS NULL;
-- Public token resolution runs under a dedicated role/function (SECURITY DEFINER),
-- so RLS is not applied to the anonymous lookup path; it only returns audit pointers.

CREATE TABLE exports (
  id            uuid        PRIMARY KEY,
  audit_id      uuid        NOT NULL,
  tenant_id     uuid        NOT NULL,
  audit_created_at timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  brand_id      bigint,
  brand_version integer,
  blob_hash     bytea       REFERENCES blobs(hash),
  options_hash  bytea       NOT NULL,                  -- sha256(page size, sections, prepared-for...)
  status        smallint    NOT NULL DEFAULT 0,        -- 0 requested,1 rendering,2 ready,3 failed
  UNIQUE (audit_id, brand_id, brand_version, options_hash)
);
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON exports
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- =============================================================================
-- Monitors & webhooks
-- =============================================================================
CREATE TABLE monitors (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id      bigint      NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  next_run_at  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  frequency    smallint    NOT NULL,                   -- 1 daily, 2 weekly, 3 monthly
  drop_threshold smallint  NOT NULL DEFAULT 10,
  paused       boolean     NOT NULL DEFAULT false
);
CREATE INDEX monitors_due ON monitors (next_run_at) WHERE NOT paused;
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON monitors
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

CREATE TABLE webhook_endpoints (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  events      integer     NOT NULL,                    -- bitmask
  failing     boolean     NOT NULL DEFAULT false,
  secret_enc  bytea       NOT NULL,                    -- AES-256-GCM envelope
  url         text        NOT NULL
);
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_endpoints
  USING (tenant_id = (SELECT app_tenant()))
  WITH CHECK (tenant_id = (SELECT app_tenant()));

-- Short-retention delivery log (14 days => two-week partitions dropped automatically)
CREATE TABLE webhook_deliveries (
  endpoint_id bigint      NOT NULL,
  tenant_id   uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz,
  http_status smallint,
  attempt     smallint    NOT NULL DEFAULT 0,
  event       smallint    NOT NULL,
  payload     bytea       NOT NULL                     -- zstd JSON (IDs + status only)
) PARTITION BY RANGE (created_at);
CREATE INDEX wd_due ON webhook_deliveries (next_attempt_at) WHERE next_attempt_at IS NOT NULL;

-- =============================================================================
-- Transactional outbox (relay with FOR UPDATE SKIP LOCKED)
-- topic: 1 audit.completed, 2 audit.failed, 3 export.ready, 4 monitor.regression, 5 audit.enqueue
-- =============================================================================
CREATE TABLE outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key          uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  topic        smallint    NOT NULL,
  payload      bytea       NOT NULL                    -- msgpack
) WITH (fillfactor = 80, autovacuum_vacuum_scale_factor = 0.01);
CREATE INDEX outbox_unpublished ON outbox (id) WHERE published_at IS NULL;

-- =============================================================================
-- Partition management (native; replace with pg_partman if preferred)
-- =============================================================================
CREATE OR REPLACE FUNCTION ca_create_month_partition(parent regclass, month_start date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  part text := format('%s_%s', parent::text, to_char(month_start, 'YYYYMM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    part, parent::text, month_start, (month_start + interval '1 month')::date);
  IF parent::text = 'audit_reports' THEN
    -- already-compressed payload: skip TOAST recompression
    EXECUTE format('ALTER TABLE %I ALTER COLUMN snapshot SET STORAGE EXTERNAL', part);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ca_create_week_partition(parent regclass, week_start date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  part text := format('%s_%s', parent::text, to_char(week_start, 'YYYYMMDD'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    part, parent::text, week_start, (week_start + 7));
END $$;

-- Bootstrap: current month + next 3 months for every monthly-partitioned table
DO $$
DECLARE
  t text;
  m int;
BEGIN
  FOREACH t IN ARRAY ARRAY['audits','audit_reports','audit_finding_index','audit_artifacts','usage_ledger']
  LOOP
    FOR m IN 0..3 LOOP
      PERFORM ca_create_month_partition(t::regclass, (date_trunc('month', now()) + make_interval(months => m))::date);
    END LOOP;
  END LOOP;
  FOR m IN 0..3 LOOP
    PERFORM ca_create_week_partition('webhook_deliveries'::regclass,
            (date_trunc('week', now()) + make_interval(weeks => m))::date);
  END LOOP;
END $$;

-- Retention: DETACH then DROP expired partitions (instant, no bloat, no vacuum):
--   ALTER TABLE audits DETACH PARTITION audits_202601 CONCURRENTLY;
--   -- export to Parquet if needed, then:  DROP TABLE audits_202601;

-- =============================================================================
-- Seed: finding dictionary (must match scoring-spec.md §6)
-- =============================================================================
INSERT INTO finding_codes (id, module, severity, effort, code) VALUES
  (101,1,4,2,'SPEED_LCP_SLOW'),
  (102,1,4,1,'SPEED_HEAVY_IMAGE'),
  (103,1,3,1,'SPEED_IMAGE_FORMAT'),
  (104,1,3,2,'SPEED_IMAGE_OVERSIZED'),
  (105,1,4,1,'SPEED_LCP_IMAGE_DEPRIORITIZED'),
  (106,1,4,2,'SPEED_RENDER_BLOCKING'),
  (107,1,4,3,'SPEED_LONG_TASKS_JS'),
  (108,1,3,2,'SPEED_THIRD_PARTY_HEAVY'),
  (109,1,4,3,'SPEED_TTFB_SLOW'),
  (110,1,3,1,'SPEED_NO_COMPRESSION'),
  (111,1,2,1,'SPEED_NO_CACHE_HEADERS'),
  (112,1,3,2,'SPEED_CLS_HIGH'),
  (113,1,3,1,'SPEED_FONT_BLOCKING'),
  (114,1,3,2,'SPEED_PAGE_WEIGHT'),
  (115,1,2,2,'SPEED_TOO_MANY_REQUESTS'),
  (116,1,3,1,'SPEED_HEAVY_VIDEO'),
  (201,2,4,1,'CLARITY_HEADLINE_VAGUE'),
  (202,2,4,1,'CLARITY_NO_VALUE_PROP'),
  (203,2,3,1,'CLARITY_NO_AUDIENCE'),
  (204,2,4,1,'CLARITY_NEXT_STEP_UNCLEAR'),
  (205,2,3,2,'CLARITY_WEAK_HIERARCHY'),
  (206,2,3,2,'CLARITY_GENERIC_IMAGERY'),
  (207,2,3,2,'CLARITY_HERO_CLUTTER'),
  (208,2,3,1,'CLARITY_LOW_CONTRAST_HEADLINE'),
  (209,2,3,2,'CLARITY_HEADLINE_IN_IMAGE'),
  (210,2,2,2,'CLARITY_AUTO_CAROUSEL_HERO'),
  (301,3,5,1,'CONV_NO_PRIMARY_CTA'),
  (302,3,4,1,'CONV_CTA_BELOW_FOLD'),
  (303,3,4,1,'CONV_CTA_LOW_CONTRAST'),
  (304,3,3,1,'CONV_CTA_GENERIC_COPY'),
  (305,3,3,2,'CONV_CTA_COMPETING'),
  (306,3,4,1,'CONV_NO_TEL_LINK'),
  (307,3,3,1,'CONV_PHONE_NOT_LINKED'),
  (308,3,4,1,'CONV_CONTACT_BURIED'),
  (309,3,3,1,'CONV_FORM_TOO_LONG'),
  (310,3,2,2,'CONV_FORM_CAPTCHA'),
  (311,3,2,1,'CONV_FORM_NO_LABELS'),
  (312,3,3,1,'CONV_TAP_TARGET_SMALL'),
  (313,3,4,1,'CONV_INTRUSIVE_OVERLAY'),
  (314,3,2,2,'CONV_NO_STICKY_CTA'),
  (315,3,2,1,'CONV_NO_TRUST_NEAR_CTA'),
  (316,3,5,1,'CONV_NO_CONTACT_METHOD'),
  (317,3,4,1,'CONV_CTA_DEAD_LINK');

-- =============================================================================
-- Application role (no BYPASSRLS, no DDL)
-- =============================================================================
-- CREATE ROLE ca_app LOGIN NOBYPASSRLS;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ca_app;
-- ALTER ROLE ca_app SET statement_timeout = '3s';
-- ALTER ROLE ca_app SET idle_in_transaction_session_timeout = '5s';
-- ALTER ROLE ca_app SET lock_timeout = '1s';
