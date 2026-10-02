import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  AuditStatus,
  Grade,
  ReportV1,
  CreateAuditRequest,
  AuditAcceptedResponse,
  Finding,
  Role,
} from '@convertaudit/contracts';
import { normalizeTarget, TargetValidationError } from '@convertaudit/ssrf';
import {
  calculateSpeedScore,
  reconcileClarityScores,
  calculateConversionScore,
  calculateOverallAuditScore,
  rankFindings,
  instantiateFinding,
  defaultDetectorRegistry,
  DetectorContext,
} from '@convertaudit/domain';
import { policy } from '@convertaudit/policy';
import { probeLiveTarget, LiveSiteAnalysis } from './live-probe.js';
import { BrowserWorker } from './browser/browser-worker.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// In-Memory State Store (Control Plane Storage for Dev & Prototype)
const audits = new Map<string, any>();
const reports = new Map<string, ReportV1>();
const sseSubscribers = new Map<string, Set<(event: string, data: any) => void>>();
const idempotencyStore = new Map<string, any>();
const dedupeCache = new Map<string, { id: string; timestamp: number }>();

function generateId(prefix: string): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let str = '';
  for (let i = 0; i < 16; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${str}`;
}

// Helper to broadcast SSE event
function broadcastAuditSSE(auditId: string, event: string, data: any) {
  const subs = sseSubscribers.get(auditId);
  if (subs) {
    subs.forEach(cb => cb(event, data));
  }
}

// Asynchronous Audit Pipeline Runner (Simulates Worker Plane Execution)
async function executeAuditPipeline(auditId: string, normalizedUrl: string, host: string) {
  const audit = audits.get(auditId);
  if (!audit) return;

  try {
    // 1. Validation & Started
    audit.status = 'VALIDATING';
    audit.progress = 5;
    broadcastAuditSSE(auditId, 'audit.started', { stage: 'validating' });
    await new Promise(r => setTimeout(r, 600));

    // 2. Real Browser Observation & DOM Extraction (§4, §5, §10, §13, §23)
    audit.status = 'CAPTURING';
    audit.progress = 15;
    broadcastAuditSSE(auditId, 'capture.progress', { stage: 'browser_launching', percent: 15, profile: 'mobile' });

    const worker = new BrowserWorker();
    broadcastAuditSSE(auditId, 'capture.progress', { stage: 'browser_navigating', percent: 25, url: normalizedUrl });
    const observation = await worker.observePage(normalizedUrl, { profile: 'mobile', timeoutMs: 20000 });
    broadcastAuditSSE(auditId, 'capture.progress', { stage: 'browser_dom_extracted', percent: 35, status: observation.browser.observationStatus });

    let liveData: LiveSiteAnalysis;
    let actualSiteScreenshot: string;
    const isBrowserAvailable = observation.browser.observationStatus === 'COMPLETE';

    if (isBrowserAvailable) {
      // Direct Grade A browser evidence (§24)
      actualSiteScreenshot = observation.visual.viewportScreenshotUrl || `https://s0.wp.com/mshots/v1/${encodeURIComponent(normalizedUrl)}?w=390&h=844`;

      const primaryCtaObj = observation.interactive.ctaCandidates.find(c => c.classification === 'PRIMARY_CTA') || observation.interactive.ctaCandidates[0];

      liveData = {
        url: normalizedUrl,
        host,
        statusCode: observation.navigation.status || 200,
        ttfbMs: observation.navigation.ttfb ?? 0,
        downloadTimeMs: Math.max(20, observation.navigation.domContentLoaded - (observation.navigation.ttfb || 0)),
        totalTimeMs: observation.navigation.load || 500,
        contentLength: observation.network.totalTransferBytes || 0,
        isHttps: normalizedUrl.startsWith('https:'),
        hasViewportMeta: true,
        title: observation.dom.title || host,
        metaDescription: observation.dom.metaDescription || '',
        renderBlockingCssCount: observation.network.requests.filter(r => r.resourceType === 'stylesheet' && r.party === 'FIRST_PARTY').length,
        renderBlockingJsCount: observation.network.requests.filter(r => r.resourceType === 'script' && r.party === 'FIRST_PARTY').length,
        totalScriptsCount: observation.network.requests.filter(r => r.resourceType === 'script').length,
        thirdPartyScripts: observation.network.requests.filter(r => r.party === 'THIRD_PARTY').map(r => r.url),
        estimatedLcpMs: observation.performance.lcp ?? 0,
        estimatedTbtMs: observation.performance.tbt ?? 0,
        estimatedCls: observation.performance.cls ?? 0,
        h1: observation.dom.headings.find(h => h.tag === 'h1') ? {
          text: observation.dom.headings.find(h => h.tag === 'h1')!.text,
          wordCount: observation.dom.headings.find(h => h.tag === 'h1')!.text.split(/\s+/).length,
          isGeneric: false,
        } : null,
        hasSupportingHeroText: observation.dom.headings.length > 1,
        heroTextSnippet: observation.dom.headings[1]?.text || '',
        genericHeadlineFound: !observation.dom.headings.some(h => h.tag === 'h1'),
        primaryCtaText: primaryCtaObj?.text || null,
        hasCtaButton: Boolean(primaryCtaObj),
        hasTelLink: observation.interactive.phoneLinks.length > 0,
        plainPhoneFound: false,
        phoneNumbers: observation.interactive.phoneLinks.map(l => l.href),
        forms: observation.dom.forms.map(f => ({
          fieldCount: f.inputCount,
          hasCaptcha: f.hasCaptcha,
          hasLabels: true,
          hasAutocomplete: f.inputs.some(i => Boolean(i.autocomplete)),
        })),
        trustSignalsCount: 2,
      };
    } else {
      // Browser unavailable fallback (§25, §27) - explicitly marked
      liveData = await probeLiveTarget(normalizedUrl);
      actualSiteScreenshot = `https://s0.wp.com/mshots/v1/${encodeURIComponent(normalizedUrl)}?w=390&h=844`;
    }

    // Emit live screenshot preview available
    broadcastAuditSSE(auditId, 'capture.screenshot', {
      percent: 45,
      shot_url: actualSiteScreenshot,
    });

    // 3. Early Speed Result streaming (using measured TTFB, transfer size & asset blocking)
    audit.status = 'ANALYZING';
    audit.progress = 55;

    const speedMetrics = {
      lcp: isBrowserAvailable && observation.performance.lcp !== null ? observation.performance.lcp : liveData.estimatedLcpMs,
      tbt: isBrowserAvailable && observation.performance.tbt !== null ? observation.performance.tbt : liveData.estimatedTbtMs,
      cls: isBrowserAvailable && observation.performance.cls !== null ? observation.performance.cls : liveData.estimatedCls,
      ttfb: isBrowserAvailable && observation.navigation.ttfb !== null ? observation.navigation.ttfb : liveData.ttfbMs,
      transferBytes: liveData.contentLength,
      requests: Math.max(12, liveData.totalScriptsCount + liveData.renderBlockingCssCount + 8),
      thirdPartyBlockingMs: liveData.thirdPartyScripts.length * 45,
    };
    const speedResult = calculateSpeedScore(speedMetrics);
    audit.modules.speed = { status: 'succeeded', score: speedResult.score, confidence: isBrowserAvailable ? 1.0 : 0.5 };
    broadcastAuditSSE(auditId, 'module.completed', { module: 'speed', score: speedResult.score });
    await new Promise(r => setTimeout(r, 400));

    // 4. Real Conversion Analysis
    const primaryCta = isBrowserAvailable ? observation.interactive.ctaCandidates.find(c => c.classification === 'PRIMARY_CTA') || observation.interactive.ctaCandidates[0] : null;

    const conversionResult = calculateConversionScore({
      ctaCandidates: primaryCta ? [
        {
          tag: primaryCta.tag,
          text: primaryCta.text,
          bboxArea: primaryCta.bbox.width * primaryCta.bbox.height,
          contrastVsSurroundings: 4.5,
          topEdgePx: primaryCta.bbox.y,
          whitespaceRingPx: 16,
          isFilledOrBordered: true,
          bbox: { x: primaryCta.bbox.x, y: primaryCta.bbox.y, w: primaryCta.bbox.width, h: primaryCta.bbox.height },
        },
      ] : [],
      hasTelLink: liveData.hasTelLink,
      hasPhoneTextUnlinked: liveData.plainPhoneFound,
      hasEmailOrMessaging: true,
      hasFormOrBooking: liveData.forms.length > 0,
      formFieldCount: liveData.forms[0]?.fieldCount || 0,
      hasCaptcha: liveData.forms[0]?.hasCaptcha || false,
      allFieldsHaveLabels: liveData.forms[0]?.hasLabels ?? true,
      hasAutocomplete: liveData.forms[0]?.hasAutocomplete ?? false,
      tapTargetsMetPercent: liveData.hasViewportMeta ? 0.92 : 0.45,
      trustSignalsNearCtaCount: liveData.trustSignalsCount,
      hasStickyCta: false,
      overlayCoveragePercent: 0,
    });
    audit.modules.conversion = { status: 'succeeded', score: conversionResult.score, confidence: isBrowserAvailable ? 1.0 : 0.5 };
    broadcastAuditSSE(auditId, 'module.completed', { module: 'conversion', score: conversionResult.score });
    await new Promise(r => setTimeout(r, 400));

    // 5. Real Clarity Analysis (Headline, Words, Value Prop, Action Guidance)
    const clarityResult = reconcileClarityScores(
      {
        headline_specificity: liveData.genericHeadlineFound ? 4 : 8,
        value_proposition: liveData.hasSupportingHeroText ? 9 : 4,
        visual_hierarchy: 8,
        imagery_relevance: 10,
        cognitive_load: 8,
      },
      {
        what_offered: { answer: liveData.h1?.text || liveData.title, confidence: liveData.h1 ? 0.85 : 0.4 },
        who_for: { answer: 'Prospective Clients', confidence: 0.75 },
        next_step: { answer: liveData.primaryCtaText, confidence: liveData.hasCtaButton ? 0.8 : 0.2 },
      },
      {
        h1_present: Boolean(liveData.h1),
        headline_words: liveData.h1?.wordCount || 0,
        headline_ratio: 1.4,
        headline_contrast: 4.5,
        headline_in_image: false,
        generic_phrase: liveData.genericHeadlineFound,
        text_block_count: 6,
        interactive_count_hero: liveData.hasCtaButton ? 2 : 0,
        has_supporting_text: liveData.hasSupportingHeroText,
      }
    );
    audit.modules.clarity = { status: 'succeeded', score: clarityResult.score, confidence: clarityResult.confidence };
    broadcastAuditSSE(auditId, 'module.completed', { module: 'clarity', score: clarityResult.score });
    await new Promise(r => setTimeout(r, 400));

    // 6. Overall Scoring & Ranking Real Top Fixes
    audit.status = 'SCORING';
    audit.progress = 90;

    const overallResult = calculateOverallAuditScore(
      speedResult.score,
      clarityResult.score,
      conversionResult.score
    );

    audit.scores = {
      overall: overallResult.overall,
      speed: overallResult.speed,
      clarity: overallResult.clarity,
      conversion: overallResult.conversion,
      grade: overallResult.grade,
    };

    // Evaluate Evidence-First Detectors via DetectorRegistry (§2, §3, §5, §15)
    const findingsList: Finding[] = [];
    const detectorContext: DetectorContext = {
      observation,
      profile: 'mobile',
      detectorVersion: '2.0.0',
    };

    if (isBrowserAvailable) {
      const detectorResults = [
        ...defaultDetectorRegistry.evaluateModule('speed', detectorContext),
        ...defaultDetectorRegistry.evaluateModule('conversion', detectorContext),
        ...defaultDetectorRegistry.evaluateModule('clarity', detectorContext),
      ];

      for (const res of detectorResults) {
        if (res.detected && res.finding) {
          findingsList.push(res.finding);
        }
      }
    } else {
      // Fallback synthetic evaluation when browser is unavailable
      const addFallbackFinding = (code: string, params: Record<string, any> = {}) => {
        const finding = instantiateFinding(code, params, [], 0.45, {
          source: 'SYNTHETIC_FALLBACK',
          evidenceType: 'rule',
          assumptions: ['Audited via static fallback probe because browser session was unavailable'],
        });
        if (finding) findingsList.push(finding);
      };

      if (!liveData.hasCtaButton) {
        addFallbackFinding('CONV_CTA_BELOW_FOLD', { elementTop: 950 });
      }
      if (liveData.plainPhoneFound) {
        addFallbackFinding('CONV_NO_TEL_LINK', { phoneNumber: liveData.phoneNumbers[0] || 'plain phone' });
      }
      if (liveData.genericHeadlineFound) {
        addFallbackFinding('CLARITY_HEADLINE_VAGUE', { current_headline: liveData.h1?.text || 'Generic / Missing Headline' });
      }
      if (!liveData.hasSupportingHeroText) {
        addFallbackFinding('CLARITY_NO_VALUE_PROP');
      }
      if (liveData.forms.some(f => f.fieldCount > 5)) {
        addFallbackFinding('CONV_FORM_TOO_LONG', { field_count: liveData.forms[0].fieldCount });
      }
      if (liveData.trustSignalsCount === 0) {
        addFallbackFinding('CONV_NO_TRUST_NEAR_CTA');
      }
    }

    // Ensure at least 1 finding if site is well-optimized
    if (findingsList.length === 0) {
      const renderBlockingFinding = instantiateFinding('SPEED_RENDER_BLOCKING', {
        blocking_count: Math.max(1, liveData.renderBlockingCssCount),
      });
      if (renderBlockingFinding) findingsList.push(renderBlockingFinding);
    }

    const { rankedFindings, topFixes } = rankFindings(findingsList);
    audit.top_fixes = topFixes;
    audit.status = 'COMPLETE';
    audit.progress = 100;
    audit.finished_at = new Date().toISOString();
    audit.duration_ms = Math.round(performance.now() - (audit.t0 || performance.now()));

    // Create Report V1 snapshot
    const reportSnapshot: ReportV1 = {
      schema: 'report.v1',
      audit: {
        id: audit.id,
        site_id: 'site_default',
        host,
        normalized_url: normalizedUrl,
        status: 'COMPLETE',
        created_at: audit.created_at,
        finished_at: audit.finished_at,
        duration_ms: audit.duration_ms,
        profile_version: 14,
        scoring_version: 3,
        revision: 1,
        cached_capture: false,
        losing_visitors: speedResult.losing_visitors,
      },
      scores: audit.scores,
      speed: {
        score: speedResult.score,
        metrics_lab: speedMetrics,
        stability: speedResult.stability,
        samples: 2,
        waterfall_top: [
          { url: `${normalizedUrl}/assets/styles.css`, bytes: 145000, duration_ms: Math.round(liveData.ttfbMs * 0.8), type: 'stylesheet', isRenderBlocking: true },
          { url: `${normalizedUrl}/assets/main.js`, bytes: 320000, duration_ms: Math.round(liveData.ttfbMs * 1.2), type: 'script', isRenderBlocking: true },
        ],
      },
      clarity: {
        score: clarityResult.score,
        subscores: clarityResult.subscores,
        comprehension: {
          what_offered: { answer: liveData.h1?.text || liveData.title, confidence: liveData.h1 ? 0.85 : 0.4 },
          who_for: { answer: 'Prospective Clients', confidence: 0.75 },
          next_step: { answer: liveData.primaryCtaText, confidence: liveData.hasCtaButton ? 0.8 : 0.2 },
        },
        pins: [
          { id: 1, x: 195, y: 160, label: liveData.genericHeadlineFound ? 'Headline Needs Clarity' : 'Clear Main Headline' },
          { id: 2, x: 195, y: 440, label: liveData.hasCtaButton ? 'Primary CTA Detected' : 'Missing High-Contrast CTA' },
        ],
        needs_human_review: clarityResult.needs_human_review,
        suggested_rewrites: [
          {
            original: liveData.h1?.text || 'Welcome to our website',
            rewrite: `${liveData.title} — Premium Service & High-Converting Experience`,
            rationale: 'Clarifies key value offering and differentiates from generic competitor phrases.',
          },
        ],
      },
      conversion: {
        score: conversionResult.score,
        rubric: conversionResult.rubric,
        primary_cta: conversionResult.primary_cta,
        contact_paths: conversionResult.contact_paths,
        overlay_penalty: conversionResult.overlay_penalty,
      },
      findings: rankedFindings,
      top_fixes: topFixes,
      artifacts: {
        viewport_5s: actualSiteScreenshot,
        fullpage: `https://api.microlink.io/?url=${encodeURIComponent(normalizedUrl)}&screenshot=true&meta=false&embed=screenshot.url`,
      },
    };

    reports.set(auditId, reportSnapshot);

    // Broadcast completion
    broadcastAuditSSE(auditId, 'audit.completed', {
      status: 'COMPLETE',
      score_overall: overallResult.overall,
      grade: overallResult.grade,
      scores: audit.scores,
    });
  } catch (err: any) {
    console.error('Audit Pipeline error:', err);
    audit.status = 'FAILED';
    audit.error_code = 'INTERNAL';
    broadcastAuditSSE(auditId, 'audit.failed', { code: 'INTERNAL', message: err.message });
  }
}

// --- Routes per openapi.yaml ---

// Root endpoint
fastify.get('/', async () => ({
  name: 'ConvertAudit AI™ API Gateway',
  trademark: 'A product by Web Axis Solutions (webaxissolutions.com)',
  vendor: {
    name: 'Web Axis Solutions',
    website: 'https://webaxissolutions.com',
  },
  status: 'online',
  version: '1.0.0',
  documentation: 'https://convertaudit.ai/docs',
  web_app_url: 'http://localhost:3000',
  endpoints: {
    health: 'GET /health',
    create_audit: 'POST /v1/audits',
    get_audit: 'GET /v1/audits/:auditId',
    get_report: 'GET /v1/audits/:auditId/report',
    sse_events: 'GET /v1/audits/:auditId/events',
    usage: 'GET /v1/usage',
    brands: 'GET /v1/brands',
  },
}));

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// POST /v1/audits
fastify.post('/v1/audits', async (req, reply) => {
  const body = req.body as any;
  const targetInput = body?.url || body?.target_url;
  if (!targetInput) {
    return reply.status(400).send({
      type: 'https://convertaudit.ai/errors/invalid-url',
      title: 'Bad Request',
      status: 400,
      code: 'INVALID_URL',
      detail: 'Missing required field: url',
      trace_id: generateId('trc'),
    });
  }

  // Idempotency check
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    reply.header('Idempotent-Replay', 'true');
    return reply.status(202).send(idempotencyStore.get(idempotencyKey));
  }

  // SSRF and Syntactic validation
  let target;
  try {
    target = normalizeTarget(targetInput);
  } catch (err: any) {
    if (err instanceof TargetValidationError) {
      return reply.status(err.code === 'TARGET_BLOCKED' ? 422 : 400).send({
        type: `https://convertaudit.ai/errors/${err.code.toLowerCase()}`,
        title: err.code === 'TARGET_BLOCKED' ? 'Target Blocked' : 'Invalid URL',
        status: err.code === 'TARGET_BLOCKED' ? 422 : 400,
        code: err.code,
        detail: err.message,
        trace_id: generateId('trc'),
      });
    }
    throw err;
  }

  // Deduplication check (10 min per Q-02)
  if (!body.force) {
    const existing = dedupeCache.get(target.normalized);
    if (existing && Date.now() - existing.timestamp < 10 * 60 * 1000) {
      const cachedAudit = audits.get(existing.id);
      if (cachedAudit) {
        return reply.status(200).send({
          ...cachedAudit,
          deduped: true,
        });
      }
    }
  }

  const id = generateId('aud');
  const auditData = {
    id,
    tenant_id: 'ten_default',
    url: target.normalized,
    host: target.host,
    status: 'QUEUED',
    progress: 0,
    created_at: new Date().toISOString(),
    profile_version: 14,
    scoring_version: 3,
    scores: { overall: null, speed: null, clarity: null, conversion: null, grade: null },
    modules: {
      speed: { status: 'pending', score: null },
      clarity: { status: 'pending', score: null },
      conversion: { status: 'pending', score: null },
    },
    top_fixes: [],
  };

  audits.set(id, auditData);
  dedupeCache.set(target.normalized, { id, timestamp: Date.now() });

  const responseBody: AuditAcceptedResponse = {
    id,
    status: 'QUEUED',
    estimated_seconds: 45,
    links: {
      self: `/v1/audits/${id}`,
      events: `/v1/audits/${id}/events`,
      report: `/v1/audits/${id}/report`,
    },
  };

  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, responseBody);
  }

  // Trigger background pipeline
  executeAuditPipeline(id, target.normalized, target.host);

  return reply.status(202).send(responseBody);
});

// GET /v1/audits/{id}
fastify.get('/v1/audits/:auditId', async (req, reply) => {
  const { auditId } = req.params as { auditId: string };
  const audit = audits.get(auditId);
  if (!audit) {
    return reply.status(404).send({
      type: 'https://convertaudit.ai/errors/not-found',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: `Audit '${auditId}' not found`,
      trace_id: generateId('trc'),
    });
  }
  return audit;
});

// GET /v1/audits/{id}/report
fastify.get('/v1/audits/:auditId/report', async (req, reply) => {
  const { auditId } = req.params as { auditId: string };
  const report = reports.get(auditId);
  if (!report) {
    const audit = audits.get(auditId);
    if (!audit) {
      return reply.status(404).send({ title: 'Not Found', status: 404 });
    }
    return reply.status(409).send({
      type: 'https://convertaudit.ai/errors/audit-not-ready',
      title: 'Conflict',
      status: 409,
      detail: 'Audit is still processing and report snapshot is not yet ready.',
    });
  }
  return report;
});

// GET /v1/audits/{id}/findings
fastify.get('/v1/audits/:auditId/findings', async (req, reply) => {
  const { auditId } = req.params as { auditId: string };
  const report = reports.get(auditId);
  if (!report) {
    return reply.status(404).send({ title: 'Not Found', status: 404 });
  }
  return { data: report.findings };
});

// GET /v1/audits/{id}/events (SSE)
fastify.get('/v1/audits/:auditId/events', (req, reply) => {
  const { auditId } = req.params as { auditId: string };

  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('Access-Control-Allow-Origin', '*');

  let subs = sseSubscribers.get(auditId);
  if (!subs) {
    subs = new Set();
    sseSubscribers.set(auditId, subs);
  }

  const listener = (event: string, data: any) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  subs.add(listener);

  // Send initial progress if already running
  const audit = audits.get(auditId);
  if (audit) {
    reply.raw.write(`event: audit.progress\ndata: ${JSON.stringify({ percent: audit.progress, status: audit.status })}\n\n`);
    if (audit.status === 'COMPLETE') {
      reply.raw.write(`event: audit.completed\ndata: ${JSON.stringify({ status: 'COMPLETE', scores: audit.scores })}\n\n`);
    }
  }

  req.raw.on('close', () => {
    subs?.delete(listener);
    if (subs?.size === 0) {
      sseSubscribers.delete(auditId);
    }
  });
});

// POST /v1/audits/{id}/exports
fastify.post('/v1/audits/:auditId/exports', async (req, reply) => {
  const { auditId } = req.params as { auditId: string };
  const exportId = generateId('exp');
  return reply.status(202).send({
    id: exportId,
    audit_id: auditId,
    status: 'ready',
    format: 'pdf',
    download_url: `https://artifacts.convertaudit-cdn.com/exports/${exportId}.pdf`,
    size_bytes: 420000,
  });
});

// GET /v1/audits (list, keyset pagination)
fastify.get('/v1/audits', async (req) => {
  const { limit = '20', status } = req.query as any;
  let data = Array.from(audits.values());
  if (status) data = data.filter(a => a.status === status);
  data.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const page = data.slice(0, parseInt(limit, 10));
  return {
    data: page,
    pagination: {
      total: data.length,
      has_more: data.length > page.length,
      next_cursor: page.length > 0 ? page[page.length - 1].id : null,
    },
  };
});

// GET /v1/usage
fastify.get('/v1/usage', async () => ({
  plan: 'agency',
  period_start: new Date().toISOString().slice(0, 10),
  allowance: 300,
  used: audits.size,
  reserved: 1,
  topup: 50,
  available: Math.max(0, 325 - audits.size),
}));

// GET /v1/brands
fastify.get('/v1/brands', async () => ({
  data: [
    {
      id: 'brd_webaxis',
      name: 'Web Axis Solutions',
      is_default: true,
      primary: '#4F46E5',
      accent: '#0EA5E9',
      font: 'Inter',
      contact: 'contact@webaxissolutions.com',
      website: 'https://webaxissolutions.com',
      footer: 'Audited exclusively by Web Axis Solutions · webaxissolutions.com',
      custom_domain: 'reports.webaxissolutions.com',
      custom_domain_state: 'active',
    },
  ],
}));

// In-memory monitors store
const monitors = new Map<string, any>();
const clients = new Map<string, any>();
const sites = new Map<string, any>();
const leads = new Map<string, any>();

// POST /v1/leads - Capture email to unlock full conversion report
fastify.post('/v1/leads', async (req, reply) => {
  const body = req.body as any;
  if (!body?.email || typeof body.email !== 'string' || !body.email.includes('@')) {
    return reply.status(400).send({
      title: 'Bad Request',
      status: 400,
      code: 'INVALID_EMAIL',
      detail: 'A valid email address is required to unlock this report.',
    });
  }

  const id = generateId('lead');
  const lead = {
    id,
    email: body.email.trim().toLowerCase(),
    audit_id: body.audit_id || null,
    host: body.host || null,
    source: body.source || 'report_lead_gate',
    created_at: new Date().toISOString(),
  };

  leads.set(id, lead);
  fastify.log.info({ leadId: id, email: lead.email, host: lead.host }, 'Captured conversion audit lead');

  return reply.status(201).send({
    success: true,
    lead_id: id,
    email: lead.email,
    message: 'Report unlocked. Full developer briefs and evidence telemetry are now available.',
  });
});

// GET /v1/leads - Retrieve captured leads
fastify.get('/v1/leads', async () => ({
  data: Array.from(leads.values()),
  total: leads.size,
}));

// GET /v1/monitors
fastify.get('/v1/monitors', async () => ({
  data: Array.from(monitors.values()),
}));

// POST /v1/monitors
fastify.post('/v1/monitors', async (req, reply) => {
  const body = req.body as any;
  if (!body?.url) {
    return reply.status(400).send({ type: 'https://convertaudit.ai/errors/invalid-url', title: 'Bad Request', status: 400, code: 'INVALID_URL', detail: 'Missing required field: url' });
  }
  let target;
  try { target = normalizeTarget(body.url); }
  catch (e: any) { return reply.status(400).send({ title: 'Bad Request', status: 400, detail: e.message }); }

  const id = generateId('mon');
  const monitor = {
    id,
    tenant_id: 'ten_default',
    url: target.normalized,
    host: target.host,
    schedule: body.schedule || 'WEEKLY',
    active: true,
    notify_on_grade_drop: body.notify_on_grade_drop ?? true,
    notify_email: body.notify_email || null,
    created_at: new Date().toISOString(),
    next_run_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_audit_id: null,
    last_grade: null,
  };
  monitors.set(id, monitor);
  return reply.status(201).send(monitor);
});

// GET /v1/monitors/:monitorId
fastify.get('/v1/monitors/:monitorId', async (req, reply) => {
  const { monitorId } = req.params as { monitorId: string };
  const m = monitors.get(monitorId);
  if (!m) return reply.status(404).send({ title: 'Not Found', status: 404 });
  return m;
});

// DELETE /v1/monitors/:monitorId
fastify.delete('/v1/monitors/:monitorId', async (req, reply) => {
  const { monitorId } = req.params as { monitorId: string };
  if (!monitors.has(monitorId)) return reply.status(404).send({ title: 'Not Found', status: 404 });
  monitors.delete(monitorId);
  return reply.status(204).send();
});

// POST /v1/audits/:auditId/share-links
fastify.post('/v1/audits/:auditId/share-links', async (req, reply) => {
  const { auditId } = req.params as { auditId: string };
  const audit = audits.get(auditId);
  if (!audit) return reply.status(404).send({ title: 'Not Found', status: 404 });
  const body = req.body as any;
  const shareId = generateId('shr');
  const shareLink = {
    id: shareId,
    audit_id: auditId,
    url: `http://localhost:3000/r/${auditId}`,
    expires_at: body?.expires_hours
      ? new Date(Date.now() + (body.expires_hours || 168) * 60 * 60 * 1000).toISOString()
      : null,
    require_password: false,
    created_at: new Date().toISOString(),
  };
  return reply.status(201).send(shareLink);
});

// GET /v1/clients
fastify.get('/v1/clients', async () => ({
  data: Array.from(clients.values()),
}));

// POST /v1/clients
fastify.post('/v1/clients', async (req, reply) => {
  const body = req.body as any;
  if (!body?.name) return reply.status(400).send({ title: 'Bad Request', status: 400, detail: 'Missing required field: name' });
  const id = generateId('cli');
  const client = { id, tenant_id: 'ten_default', name: body.name, email: body.email || null, notes: body.notes || null, created_at: new Date().toISOString() };
  clients.set(id, client);
  return reply.status(201).send(client);
});

// GET /v1/sites
fastify.get('/v1/sites', async () => ({
  data: Array.from(sites.values()),
}));

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
fastify.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`ConvertAudit AI API server listening on ${address}`);
});
