ConvertAudit AI — User Flows, State Machines & Async Workflows

Step-by-step interaction loops for each persona, the state transitions that drive them, and the asynchronous execution timeline behind every audit.

1. Personas & Primary Loops
Persona	Goal	Primary Loop
Olivia, business owner (self-serve)	Learn why the site isn't producing leads and get a fix list	Audit → read Top Fixes → fix / hand to developer → re-audit → see improvement
Dan, freelance developer (receives hand-off)	Get precise, actionable tasks	Open shared report → copy Developer Briefs → implement → notify owner
Priya, agency owner	Win new clients with branded audits	Set up brand → audit prospect → export PDF → send outreach → monitor → upsell
Sam, agency account manager	Track client progress monthly	Monitor → regression alert → re-audit diff → client update
Integrator (API)	Embed audits in a CRM or lead form	Create audit via API → receive webhook → fetch results
2. Flow A — Anonymous Teaser Audit (Acquisition)
[Landing] ─► enter URL ─► client validation ─► [Challenge] ─► POST /v1/audits (anon)
                                                                   │
                        ┌──────────────────────────────────────────┘
                        ▼
                 [Progress screen] ─SSE─► module results stream in
                        ▼
                 [Teaser report: grade + 3 findings, rest blurred]
                        ▼
              ┌─────────┴───────────┐
              ▼                     ▼
      [Sign up to unlock]      [Leave]  → (email capture reminder if opted in)
              ▼
      Verify email ─► claim audit (anon audit reassigned to new tenant) ─► [Full report]
Step	User action	System behavior	Failure handling
1	Types URL, presses Audit my site	Prepends https:// if missing; trims; shows inline error if malformed	Message: "That doesn't look like a valid website address."
2	(Automatic)	Challenge token verified; IP/day limit checked (Q-03)	429 → "You've reached today's free limit. Sign up to continue."
3	—	POST /v1/audits → 202 with audit_id and short-lived anon access token (cookie, 24 h)	Duplicate within 10 min returns the cached audit
4	Watches progress	SSE stream shows stage checklist and live screenshot	If SSE drops, client falls back to polling GET /v1/audits/{id} every 3 s
5	Reads teaser	Shows grade, overall score, findings 1–3; findings 4+ blurred (server withholds their bodies — not just CSS blur)	—
6	Clicks Unlock full report	Signup modal with email + password or SSO	Existing account → login, then claim
7	Verifies email	Anonymous audit re-parented to the new tenant; Free credits decremented	Token expired → resend; audit remains claimable for 24 h
3. Flow B — Authenticated Audit (Core Loop)
3.1 Happy Path
Start: Dashboard → quick-audit bar → enter URL (optional: choose Client folder, add up to 5 extra pages on paid plans).
Submit: Client sends POST /v1/audits with Idempotency-Key.
Acknowledge: UI navigates immediately to /app/audits/{id} in QUEUED state showing skeletons.
Stream: SSE events update the stage list (see §6 timeline).
Read: As soon as Speed completes (~20 s), its tab is clickable — the user can read while other modules run.
Complete: Overview populates with grade, scores, Top Fixes; a toast confirms "Audit complete."
Act: User expands a finding → chooses Copy developer brief, Mark resolved, or Dismiss (with reason).
Verify: After fixing, user clicks Re-audit; new audit links via previous_audit_id; diff view highlights improvements and resolved findings.
3.2 Alternate Paths
Situation	Behavior
Out of credits	Submit is blocked pre-flight with inline banner: buy top-up / upgrade / wait for reset date. No audit row is created.
Recent duplicate (≤ 10 min)	Dialog: "You audited this site 4 minutes ago. View that result or run a fresh audit (uses 1 credit)."
Target blocked (private IP, deny-list)	Audit fails at VALIDATING; credit refunded; message "We can only audit public websites."
Target unreachable / timeout	Auto-retry ×2 with backoff (user sees "Retrying…"); then FAILED with Try again button; credit refunded
Bot protection (403 / challenge page)	FAILED: TARGET_FORBIDDEN; guidance on allow-listing ConvertAuditBot IP range; credit refunded
AI provider outage	Audit finishes PARTIAL; Clarity tab shows "Temporarily unavailable" with Retry Clarity (no extra credit)
User closes tab mid-audit	Audit continues; on return, state is restored from server; email notification if enabled
User cancels	Cancel during QUEUED/VALIDATING → full refund; during CAPTURING+ → sandbox killed, credit refunded only if capture had not completed
4. Flow C — Agency Lead-Magnet Loop
[Onboard agency] ─► [Create Brand Profile] ─► [Live PDF preview] ─► [Set default brand]
                                                                         │
     ┌───────────────────────────────────────────────────────────────────┘
     ▼
[Create Client folder: "Prospect Co."] ─► [Run audit on prospect URL]
     ▼
[Review report] ─► optional: hide findings / add Agency Notes
     ▼
[Export ▾] ──► PDF ──► render (async) ──► download / attach to email
          └──► Share link (branded, optional password/expiry)
     ▼
[Outreach: send PDF/link to prospect]
     ▼
[Prospect views link] ─► agency notified "Prospect Co. opened your report" (opt-in, view event only)
     ▼
[Prospect books call] ─► [Agency enables Monitor to demonstrate progress] ─► [Monthly diff report]
4.1 Brand Setup Detail
Step	Action	Validation
1	Upload logo	Type/size/dimension checks; SVG sanitized; preview shown
2	Choose colors and font	Contrast check auto-adjusts text colors; warns if brand color fails AA
3	Enter contact block, footer, CTA link, booking QR target	URL validated (https only), reputation-screened
4	(Optional) Custom domain	Displays DNS TXT record to add; polls verification; on success requests certificate; status PENDING → VERIFIED → ACTIVE
5	Save	Brand version increments; existing reports unaffected (snapshotting, ADR-007)
4.2 Export Flow (PDF)
Step	System / User	Detail
1	User clicks Export → PDF	Dialog: choose brand, page size (A4/Letter), include/omit sections, cover "Prepared for" name
2	Submit	POST /v1/audits/{id}/exports → 202 export_id
3	Rendering	Button becomes progress indicator (typical 6–12 s)
4	Ready	Toast + Download (signed URL, 5 min) and Copy share link
5	Failure	Retry automatically once; then error "We couldn't build the PDF — try again"; no credit is consumed for exports
5. Flow D — Monitoring & Regression
[Create Monitor: URL, frequency, alert threshold]
        ▼
 scheduler tick ─► credit reservation OK? ──no──► pause monitor + email "Out of credits"
        │yes
        ▼
 create audit (monitor_id) ─► normal pipeline ─► COMPLETE
        ▼
 diff vs previous audit (same profile_version?)
   ├─ no  → mark "Baseline reset" (profile changed), no alert
   └─ yes → Δscore ≤ −10 ? ──yes──► webhook + email: "Conversion score dropped 14 points"
                         └─no──► store trend point
        ▼
 Trend chart updates (line per module, markers for detected changes)

Alert email contents: domain, previous → current scores, the 3 newest/worsened findings, deep link to diff view. Weekly digest is available instead of per-event alerts.

6. Asynchronous Execution Timeline (Single Audit)

Typical wall-clock times for a median site. Times shown are targets; p95 ≤ 90 s total (rule O-06).

t (s)	Component	Event	UI reflection
0.0	API	POST /audits accepted; audit QUEUED; credit RESERVED	Progress screen appears
0.3	Orchestrator	audit.started → VALIDATING	"Checking your address…"
0.5–1.5	Capture worker (proxy)	DNS resolve, IP validation, redirect probe	—
1.5–4	Sandbox	Allocate warm sandbox, launch Chromium	"Loading your page on a simulated phone…"
4–35	Capture worker	3 throttled Lighthouse runs (sequential), 5-s screenshot, DOM/HAR extraction	Live screenshot appears when captured (~t=12)
35–38	Capture worker	Sanitize, upload bundle, capture.completed	Stage ✔ "Page captured"
38–40	Orchestrator	Fan-out: speed, conversion, clarity jobs	Three stages show as running
38–42	Speed analyzer	Metrics, heavy-asset detection, CrUX lookup	Speed tab unlocks with score
38–41	Conversion analyzer	DOM rules, bounding boxes	Conversion tab unlocks
38–62	Clarity analyzer	3 parallel LLM passes, validation, aggregation	Clarity tab unlocks
62–66	Scoring engine	Weighted scores, priorities, narrative	Overall grade animates in
66–67	Orchestrator	Transaction: COMPLETE, credit COMMITTED, outbox events	Toast; SSE audit.completed
67+	Dispatcher	Webhooks, email (if enabled), monitor diff	—

The Speed and Conversion analyzers do not wait for Clarity; the UI is designed for out-of-order arrival.

7. State Machines
7.1 Audit State Machine
              ┌──────────┐  validate ok  ┌────────────┐  sandbox up  ┌───────────┐
 create ────► │  QUEUED  │──────────────►│ VALIDATING │─────────────►│ CAPTURING │
              └────┬─────┘               └─────┬──────┘              └─────┬─────┘
                   │cancel                     │blocked / invalid          │ capture done
                   ▼                           ▼                           ▼
             ┌──────────┐              ┌──────────────┐             ┌────────────┐
             │ CANCELED │              │    FAILED    │◄──fatal─────│ ANALYZING  │
             └──────────┘              └──────────────┘             └─────┬──────┘
                   ▲                           ▲                          │ all modules terminal
                   │cancel (pre-capture)       │scoring error             ▼
                   │                           │                    ┌───────────┐
                   └───────────────────────────┴────────────────────│  SCORING  │
                                                                    └─────┬─────┘
                                            ≥1 module failed/skipped      │       all succeeded
                                                  ┌───────────────────────┴──────────┐
                                                  ▼                                  ▼
                                            ┌───────────┐                     ┌────────────┐
                                            │  PARTIAL  │                     │  COMPLETE  │
                                            └───────────┘                     └────────────┘
From	To	Trigger	Side effects
—	QUEUED	API accepts request	Credit RESERVED; job enqueued
QUEUED	VALIDATING	Worker dequeues	started_at set
VALIDATING	CAPTURING	Network validation passes	—
VALIDATING	FAILED	TARGET_BLOCKED / TARGET_UNREACHABLE after retries	Credit REFUNDED
CAPTURING	ANALYZING	capture.completed	Fan-out module jobs
CAPTURING	FAILED	Timeout, OOM after retries, forbidden	Credit REFUNDED
ANALYZING	SCORING	All Module Runs terminal	—
SCORING	COMPLETE	All modules SUCCEEDED	Credit COMMITTED; events emitted
SCORING	PARTIAL	≥ 1 succeeded and ≥ 1 FAILED/SKIPPED	Credit COMMITTED; failed module retryable free of charge
any non-terminal	CANCELED	User cancel	Sandbox killed; refund rules per §3.2
any non-terminal	FAILED	Watchdog > 150 s	Credit REFUNDED; DLQ record

Terminal states: COMPLETE, PARTIAL, FAILED, CANCELED. Terminal audits are immutable (P4). A PARTIAL audit can transition a failed module to SUCCEEDED via Retry module, which appends a new Module Run attempt and recomputes scores as a new scoring revision (revision history retained) — the only permitted post-terminal write.

7.2 Module Run State Machine
PENDING ──► RUNNING ──► SUCCEEDED
   │           │  └──► FAILED ──(retry, attempts<max)──► RUNNING
   │           └────► SKIPPED   (opt-out / not applicable)
   └───────────────► SKIPPED
7.3 Credit State Machine
RESERVED ──audit COMPLETE/PARTIAL──► COMMITTED
    └──audit FAILED / CANCELED(pre-capture)──► REFUNDED
7.4 Export State Machine

REQUESTED → RENDERING → READY → EXPIRED (signed link) or RENDERING → FAILED → (auto-retry once) RENDERING.

7.5 Custom Domain State Machine

PENDING_DNS → VERIFIED → CERT_ISSUING → ACTIVE; from ACTIVE, failed daily re-verification → SUSPENDED (reports fall back to the default domain, owner notified).

7.6 Client-Side UI State (Report View)
UI state	Condition	Rendered
loading-initial	Audit fetch pending	Skeleton layout
streaming	Status non-terminal	Stage list, unlocked tabs as available
complete	COMPLETE	Full report
partial	PARTIAL	Full report + banner + retry action for failed module
failed	FAILED	Error explanation + Try again + refund notice
stale	Audit older than 30 days	Banner suggesting a re-audit, with diff CTA
disconnected	SSE lost	Silent reconnect with exponential backoff (1, 2, 4, 8 s, cap 15 s); after 3 fails, switch to polling
8. Asynchronous Protocol Details
8.1 SSE Event Contract

GET /v1/audits/{id}/events (Content-Type: text/event-stream). Each event carries an incrementing id so clients resume with Last-Event-ID after a disconnect; the server replays missed events from a Redis stream (retention 10 min).

id: 14
event: module.completed
data: {"module":"speed","score":61,"top_finding_codes":["SPEED_HEAVY_IMAGE","SPEED_RENDER_BLOCKING_JS"]}

id: 15
event: audit.progress
data: {"percent":52,"stage":"analyzing","eta_seconds":35}

id: 19
event: audit.completed
data: {"status":"COMPLETE","score_overall":58,"grade":"C"}
Event	Emitted when
audit.started	Worker begins validation
capture.progress	Sub-steps: loading, measuring, screenshotting
capture.screenshot	5-second screenshot available (carries signed URL)
module.started / module.completed / module.failed / module.skipped	Module lifecycle
audit.progress	Aggregate percent and ETA (monotonic — never decreases)
audit.completed / audit.failed / audit.canceled	Terminal
heartbeat	Every 15 s to keep proxies from closing the connection

Progress percentage weights: validation 5%, capture 45%, analysis 40%, scoring 10%. ETA uses a rolling median of the last 200 audits per stage.

8.2 Polling Fallback

GET /v1/audits/{id} returns status, progress, and available module_scores. Clients should poll at 3 s and back off to 10 s after 60 s; responses include Retry-After.

8.3 Webhook Delivery Loop
audit terminal ─► outbox row ─► dispatcher ─► POST customer endpoint (signed)
                                    │ 2xx → delivered
                                    │ non-2xx / timeout (10 s)
                                    ▼
                    retry schedule: 30 s, 2 m, 10 m, 1 h, 3 h, 6 h, 12 h, 24 h
                                    │ exhausted
                                    ▼
                         endpoint flagged "failing"; email owner; deliveries viewable + replayable in UI
8.4 Idempotency Behavior
Scenario	Result
Same Idempotency-Key + same body	Original 202 response replayed, no new audit or credit
Same key + different body	422 IDEMPOTENCY_KEY_REUSED
Client retries after network timeout	Safe — returns original audit_id
8.5 Retry & Backoff Summary
Stage	Max attempts	Backoff	Retry on
Capture	3 (initial + 2)	5 s, 20 s	Timeout, connection reset, sandbox OOM, 5xx from target
Speed / Conversion analyzers	4	2 s, 5 s, 15 s	Transient storage / infra errors
Clarity (LLM)	3 + 2 schema repairs	3 s, 10 s	429/5xx from provider, invalid JSON
PDF render	2	5 s	Renderer crash
Webhook	8	See §8.3	Non-2xx, timeout
9. Flow E — API Integrator
1. Create API key (scopes: audits:write, audits:read; optional IP allow-list)
2. POST /v1/audits {"url":"https://example.com"}  + Idempotency-Key  → 202 {id}
3a. (Recommended) Register webhook → receive "audit.completed" → GET /v1/audits/{id}
3b. (Alternative) Poll GET /v1/audits/{id} until status ∈ terminal
4. GET /v1/audits/{id}/findings?severity=critical,high → render in CRM
5. POST /v1/audits/{id}/exports {"format":"pdf","brand_id":"…"} → poll GET /v1/exports/{id} → download

Error handling contract for integrators: 4xx are not retryable except 429 (honor Retry-After); 5xx retry with jittered exponential backoff; every error body includes code and trace_id for support.

10. Flow F — Team & Account Management
Flow	Steps	Rules
Invite member	Admin enters email + role → signed invite (7-day expiry) → invitee signs up/logs in → joins tenant	Seat limits per plan; invite reusable once only
Change role	Owner/Admin selects new role → confirmation → sessions of target user refreshed	Last-owner protection (P-03)
Upgrade plan	Billing → choose plan → Stripe Checkout → webhook confirms → credits/limits updated immediately	Proration handled by Stripe; downgrade effective at period end
Top-up credits	Buy pack (e.g., 50) → Stripe → ledger entry +50 (no expiry for 12 months)	Top-ups consumed after monthly allotment
Delete audit	Confirm → soft delete → Undo toast (30 s) → recoverable 30 d	Share links to the audit die immediately
Delete account	Owner confirms with password + MFA → tenant enters 30-day deletion grace period → hard delete	Email confirmation with cancellation link
11. Notification Matrix
Trigger	In-app	Email	Webhook
Audit complete	Toast	Optional (default off for interactive, on for monitors)	✔
Audit failed	Banner	✔	✔
Monitor regression	Badge	✔	✔
Report link viewed (agency opt-in)	Badge	Optional	✘
Credits ≤ 20%	Banner	✔ (once per cycle)	✘
Custom domain suspended	Banner	✔	✘
Export ready (async > 20 s)	Toast	✘	✔
12. Edge Cases & Expected Behavior
#	Case	Expected behavior
1	URL redirects to a different domain (e.g., example.com → shop.other.com)	Audit proceeds against the final URL; report displays both original and final; banner notes redirect
2	Site is a single-page app with client-side rendering	Capture waits for network idle (≤ 10 s) and DOM stabilization (no mutations for 1 s); if still empty, flags "Content did not render — search engines and slow phones may see a blank page"
3	Cookie banner covers >30% of viewport	Recorded as a friction finding; second capture with banner dismissed used for Clarity to avoid penalizing content twice
4	Non-English page	Speed and Conversion run normally; Clarity runs in best-effort mode with an "English-optimized" confidence cap and a visible note
5	Page is under maintenance / parked domain	Detected heuristically; audit completes with a single critical finding "This page isn't a live website" and skips scoring (grade —)
6	Huge page exceeding byte/request caps	Audit stops downloading, marks TARGET_TOO_LARGE, still scores from data collected, flagged as PARTIAL
7	Two users audit the same URL simultaneously (different tenants)	Independent audits; per-domain protective limit still applies (Q-04)
8	Target changes mid-audit	Capture bundle is a single snapshot; the report notes capture time; re-audit for a newer state
9	User edits Brand Profile after exporting	Existing exports/shares unchanged; Regenerate with current brand action available
10	Hidden finding (agency) reappears on re-audit	Hidden state is per-finding-code per-client and persists across audits unless the user resets it
11	Time zone display	Timestamps stored UTC; rendered in the user's profile timezone; PDF uses tenant timezone
12	Clock skew on webhook verification	Reject if timestamp differs by > 5 min; docs recommend NTP-synced receivers
13. Instrumentation (Flow Health Metrics)
Funnel / metric	Definition	Target
Teaser start → completion	Audits reaching terminal / submitted	≥ 92%
Teaser → signup	Signups within 24 h / teaser completions	≥ 12%
Time-to-first-result	Submit → first module.completed	≤ 20 s (p50)
Audit completion time	Submit → COMPLETE/PARTIAL	p95 ≤ 90 s
Report engagement	Audits with ≥ 1 finding expanded	≥ 70%
Fix loop	Audits followed by a re-audit within 14 d	≥ 25%
Agency export rate	Agency audits producing a PDF/share link	≥ 60%
Failed-audit rate (excl. blocked targets)	FAILED / total	≤ 3%