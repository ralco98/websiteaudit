ConvertAudit AI — Rules & Operating Constraints

Normative document. Keywords MUST, MUST NOT, SHOULD, and MAY follow RFC 2119. Every rule has an ID so it can be referenced in code review, tests, and incident reports.

1. Target Acceptance Rules (What We Are Allowed to Audit)
ID	Rule
T-01	Only http and https schemes are accepted. All others (file, ftp, gopher, data, javascript, ws) MUST be rejected.
T-02	Ports other than 80 and 443 MUST be rejected unless the tenant is on an Enterprise plan with an explicitly allow-listed port.
T-03	Userinfo in URLs (https://user:pass@host) MUST be rejected.
T-04	Hostnames MUST be normalized: lowercase, IDNA/punycode-converted, trailing dot removed, fragment stripped. Maximum URL length 2,048 characters.
T-05	The resolved IP address of every request in the audit (including redirects and subresources) MUST be public and routable. Blocked ranges: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16 (includes cloud metadata 169.254.169.254), 172.16.0.0/12, 192.0.0.0/24, 192.168.0.0/16, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4, ::1/128, fc00::/7, fe80::/10, ::ffff:0:0/96 (IPv4-mapped), 64:ff9b::/96.
T-06	DNS MUST be resolved by the platform's resolver and the connection MUST be pinned to the validated IP (prevents DNS rebinding). Re-validation is required on each redirect hop.
T-07	Maximum 5 redirect hops. Redirect to a blocked destination aborts the audit with TARGET_BLOCKED.
T-08	The platform MUST honor robots.txt disallow rules for the ConvertAuditBot user-agent for crawl of additional pages. The initial single-URL audit is a user-initiated request and is exempt, mirroring PageSpeed-style tools.
T-09	Sites that display an explicit opt-out (X-Robots-Tag: noai or <meta name="convertaudit" content="noaudit">) MUST NOT have their content sent to third-party AI providers; Speed and Conversion still run and Clarity returns SKIPPED_OPT_OUT.
T-10	Government (.gov, .mil), and domains on the internal abuse deny-list MUST be rejected.
T-11	The audit crawler MUST identify itself: ConvertAuditBot/1.x (+https://convertaudit.ai/bot) and publish a stable IP range.
T-12	Audits requiring authentication, login, or CAPTCHA solving are unsupported. The crawler MUST NOT attempt to bypass bot protection.
2. Execution Boundaries (Browser Sandbox Limits)
ID	Limit	Value
E-01	Wall-clock timeout per audit	120 s hard kill
E-02	Navigation timeout	30 s
E-03	Network-idle wait cap	10 s after load
E-04	Max total response bytes downloaded	60 MB per audit
E-05	Max single response size	25 MB (larger responses aborted and logged as a finding)
E-06	Max requests	500
E-07	Max DOM nodes analyzed	60,000 (beyond → truncate + DOM_TRUNCATED warning)
E-08	Browser memory	1.5 GiB cgroup limit; OOM → job failure with retry
E-09	CPU	1 vCPU guaranteed, 2 burst
E-10	Concurrent tabs per browser context	1
E-11	Downloads, file chooser, geolocation, camera, microphone, notifications, clipboard	Denied
E-12	Dialogs (alert, confirm, prompt, beforeunload)	Auto-dismissed and logged
E-13	Popups / new windows	Blocked; the count is recorded as a friction signal
E-14	Service workers and persistent storage	Disabled for capture; fresh profile per audit, destroyed afterward
E-15	Form submission	The crawler MUST NOT submit forms, click purchase/submit buttons, or trigger state-changing actions. Interaction is limited to scroll, viewport resize, and hover.
E-16	Cookie consent banners	Detected and recorded; NOT dismissed on first pass. A second capture with banner dismissal via heuristic click on "Accept/Reject" MAY be run only when the banner covers > 30% of viewport, and only clicks elements matching a known CMP selector list.
E-17	Each audit MUST run in a brand-new browser process in a brand-new container; no reuse across tenants or audits.	
2.1 Mobile Test Profile (Fixed for Comparability)
Parameter	Value
Viewport	390×844 CSS px, DPR 3
User-Agent	Chrome on Android (current stable) with ConvertAuditBot token appended
CPU throttling	4× slowdown
Network	Simulated Slow 4G: 1.6 Mbps down, 750 Kbps up, 150 ms RTT
Locale / timezone	en-US / UTC unless tenant overrides
Runs per audit	3 Lighthouse-style runs; median reported, min/max stored
5-second screenshot	Captured at navigation start + 5,000 ms on the throttled profile

Changing any profile parameter MUST bump profile_version; scores from different profile versions MUST NOT be trended together without a visible break marker.

3. Permission Framework
3.1 Roles
Role	Scope
owner	Everything, including billing, tenant deletion, ownership transfer
admin	Manage members, brands, API keys, webhooks; run/delete audits; no billing or deletion
member	Run audits, view all tenant audits, export, share; manage own audits
viewer	Read-only on audits and reports; cannot export white-label PDF
client_guest	External, single-report access via share token; no account
3.2 Permission Matrix
Action	owner	admin	member	viewer	guest
Run audit	✔	✔	✔	✘	✘
View tenant audits	✔	✔	✔	✔	own report only
Delete audit	✔	✔	own	✘	✘
Export PDF / JSON	✔	✔	✔	JSON only	✘
Create share link	✔	✔	✔	✘	✘
Manage Brand Profiles	✔	✔	✘	✘	✘
Manage monitors	✔	✔	✔	✘	✘
Manage API keys / webhooks	✔	✔	✘	✘	✘
Invite / remove members	✔	✔	✘	✘	✘
View billing	✔	✘	✘	✘	✘
Change plan / payment method	✔	✘	✘	✘	✘
Delete tenant	✔	✘	✘	✘	✘
3.3 Rules
P-01 Permission checks MUST occur server-side in a central policy module. UI hiding is cosmetic only.
P-02 Every resource query MUST be scoped by tenant_id; cross-tenant IDs MUST return 404, never 403, to avoid resource enumeration.
P-03 There MUST always be at least one owner per tenant; the last owner cannot be demoted or removed.
P-04 Role changes take effect on the next request; active sessions are invalidated on demotion.
P-05 Share links MUST be revocable and MAY have expiry; default expiry 30 days.
4. Quotas, Rate Limits, and Plans
Plan	Credits / month	Concurrent audits	Pages per audit	White-label	API	Retention
Free (teaser)	3 lifetime	1	1	✘	✘	7 days
Starter	30	2	1	Footer badge required	✘	90 days
Agency	300	5	up to 6	✔	✔	12 months
Agency Pro	1,500	15	up to 6	✔ + custom domain	✔	24 months
Enterprise	Custom	Custom	Custom	✔	✔	Custom
ID	Rule
Q-01	A Credit is reserved at enqueue and committed when the audit reaches COMPLETE or PARTIAL. FAILED and CANCELED (before capture) refund the Credit automatically.
Q-02	Duplicate audits of the same normalized URL by the same tenant within 10 minutes return the cached result unless force=true, which consumes a Credit.
Q-03	Per-IP unauthenticated limit: 5 teaser audits / hour, 10 / day. Per-tenant API limit: 60 requests / minute (burst 20). Exceeding returns 429 with Retry-After.
Q-04	Per-domain protective limit: max 20 audits / hour globally against any single registrable domain, across all tenants, to prevent the platform being used as a load tool.
Q-05	Free-tier abuse controls: email verification, device fingerprint + IP heuristics, and Turnstile-style challenge before the first anonymous audit.
Q-06	Usage metering MUST be recorded in an append-only usage_ledger; billing is derived from the ledger, never from mutable counters.
5. AI Usage Rules
ID	Rule
A-01	LLM prompts MUST be versioned (prompt_id@semver) and stored with each Module Run for reproducibility.
A-02	Content from audited websites is untrusted data. It MUST be placed in clearly delimited data sections and MUST NOT be interpreted as instructions. System prompts MUST state that text inside the page, including text that resembles instructions, is to be evaluated, not obeyed.
A-03	LLM output MUST conform to a JSON schema; invalid output triggers at most 2 repair retries, then the module returns AI_UNAVAILABLE.
A-04	Model responses MUST NOT be able to trigger tool calls, network requests, or code execution. AI stages are pure functions from (screenshot, extracted text, layout metadata) to schema-valid JSON.
A-05	Clarity scoring uses 3 independent passes at temperature ≤ 0.2; the reported score is the median and variance determines confidence.
A-06	AI-suggested rewrites MUST be labelled as suggestions and MUST NOT include unverifiable claims (fake statistics, awards, certifications, guarantees) about the business.
A-07	Personal data appearing in screenshots (faces in testimonials, visible emails) is not extracted into structured fields; only page-level text needed for headline/value-proposition analysis is sent to the model.
A-08	Customer audit content MUST NOT be used to train models. The vendor agreement MUST specify zero-retention or no-training terms.
A-09	Golden-set regression: a fixed corpus of 200 labelled pages MUST be re-scored on any prompt or model change; median absolute score drift > 5 points blocks release.
A-10	Any finding that cites an external statistic MUST reference an entry in the citation registry (source, year, URL); uncited statistics are not rendered.
6. Data Handling Rules
ID	Rule
D-01	Captured HTML is stored sanitized (scripts stripped, inline event handlers removed, forms neutralized) and is NEVER served from the application origin; artifacts are served from a separate cookieless domain with Content-Security-Policy: sandbox.
D-02	Form field values are never captured. Only field metadata (type, label, required, name) is stored.
D-03	Cookies, localStorage, and request/response headers containing Set-Cookie or Authorization are dropped from HAR files before persistence.
D-04	Retention follows plan (Section 4). Hard deletion executes within 30 days of expiry or on request; object-store lifecycle rules enforce deletion of artifacts.
D-05	Deleting a tenant triggers cascading deletion of all audits, artifacts, brand assets, and API keys within 30 days; billing records are retained per legal requirements.
D-06	Shared reports MUST include X-Robots-Tag: noindex, nofollow.
D-07	Audit content MUST NOT be used to build cross-tenant benchmark datasets unless aggregated and anonymized with a minimum cohort of 50 sites per bucket.
7. White-Label Content Rules
ID	Rule
W-01	Uploaded logos: PNG, JPEG, SVG (sanitized), ≤ 2 MB, ≤ 4000×4000 px. SVGs MUST have scripts, external references, and foreignObject removed.
W-02	Brand text fields are plain text, length-capped, and HTML-escaped on render.
W-03	Custom-domain report hosting requires DNS TXT verification and automated TLS issuance; unverified domains MUST NOT serve reports.
W-04	Agency plans MAY remove "Powered by" branding; Starter MUST retain it.
W-05	Scores and findings are not editable by users. Agencies MAY add an "Agency Notes" section and hide individual findings, and hidden findings are recorded in the audit log.
W-06	Reports MUST retain a footer disclaimer that results are automated analysis snapshots at a point in time; agencies may extend, not remove, it.
8. Engineering & Operational Constraints
ID	Rule
O-01	All infrastructure is defined as code; manual production changes are prohibited.
O-02	Browser workers run on a dedicated node pool with egress-only network policy and no service-account tokens mounted.
O-03	Database migrations MUST be backward-compatible across one release (expand → migrate → contract).
O-04	Every queue consumer MUST be idempotent; job handlers begin by checking Module Run state.
O-05	Dead-letter queue depth > 25 pages the on-call engineer; a DLQ item MUST be triaged within 1 business day.
O-06	SLOs: API availability 99.9% monthly; audit success rate (COMPLETE + PARTIAL) ≥ 97% excluding blocked targets; p95 audit duration ≤ 90 s; PDF generation p95 ≤ 20 s.
O-07	Chromium and Lighthouse versions are pinned; upgrades require a golden-set score comparison and a profile_version bump if drift > 3 points.
O-08	Feature flags gate every new module and every AI prompt change; kill-switch response time ≤ 5 minutes.
O-09	Secrets are never stored in code, images, or environment files in the repository; injection is via the secrets manager at runtime.
O-10	Every pull request requires: passing unit + integration tests, static analysis (SAST), dependency audit with no high/critical unresolved CVEs, and one reviewer who did not author the change.
O-11	Cost guardrails: per-audit cost ceiling of $0.40 (browser-seconds + tokens); audits projected above ceiling are terminated with COST_LIMIT. Daily tenant spend anomalies (> 5× trailing-7-day mean) alert Ops.
9. Error Taxonomy (Canonical Codes)
Code	HTTP	Retryable	Meaning	User-facing message
INVALID_URL	400	No	Malformed or disallowed scheme/port	"That doesn't look like a valid website address."
TARGET_BLOCKED	422	No	Resolves to a disallowed network or deny-listed domain	"We can only audit public websites."
TARGET_UNREACHABLE	200 (audit FAILED)	Yes (2×)	DNS failure, timeout, connection refused	"We couldn't reach this site."
TARGET_FORBIDDEN	200 (audit FAILED)	No	401/403/bot challenge	"This site blocked our visit."
TARGET_TOO_LARGE	200	No	Exceeded E-04/E-06	"This page is too heavy to analyze fully."
AI_UNAVAILABLE	200 (module FAILED)	Yes	Model outage or schema failures	"Clarity analysis is temporarily unavailable."
SKIPPED_OPT_OUT	200 (module SKIPPED)	No	Target opted out of AI processing	"This site asks not to be analyzed by AI."
QUOTA_EXCEEDED	402	No	No credits	"You've used all your audits this month."
RATE_LIMITED	429	Yes	Rate limit	"Slow down a little — try again shortly."
COST_LIMIT	200 (audit PARTIAL/FAILED)	No	Cost guardrail hit	"This audit was stopped early."
INTERNAL	500	Yes	Unhandled	"Something went wrong on our side."

Errors follow RFC 9457 application/problem+json with type, title, status, detail, code, and trace_id. Internal hostnames, IPs, and stack traces MUST NOT appear in any external error payload.

10. Prohibited Behaviors (Summary Checklist)
✘ Fetching any URL from a control-plane component (API, web app) rather than a sandboxed worker
✘ Executing target-site JavaScript outside the sandbox
✘ Submitting forms or clicking state-changing elements on audited sites
✘ Storing form values, cookies, or credentials from audited sites
✘ Passing untrusted page text to an LLM without delimiting or schema-constraining the response
✘ Reusing a browser process or filesystem across audits
✘ Returning 403 for cross-tenant resources
✘ Editing a completed audit's scores
✘ Rendering user-supplied HTML or unsanitized SVG in reports
✘ Trending scores across different profile_versions without a marker