import React, { useState } from 'react';
import { ReportV1 } from '@convertaudit/contracts';
import { GradeBadge } from './GradeBadge';
import { ScoreRing } from './ScoreRing';
import { FindingCard } from './FindingCard';
import { SpeedTab } from './SpeedTab';
import { ClarityTab } from './ClarityTab';
import { ConversionTab } from './ConversionTab';
import { ExportModal } from './ExportModal';
import { MonitorPanel } from './MonitorPanel';
import { LeadCaptureGate } from './LeadCaptureGate';
import {
  Download,
  Share2,
  RotateCw,
  Gauge,
  Sparkles,
  MousePointerClick,
  FileCheck2,
  ExternalLink,
  Layers,
  Bell,
  Lock,
  CheckCircle2,
} from 'lucide-react';

interface ReportViewProps {
  report: ReportV1;
  onReAudit?: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ report, onReAudit }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'speed' | 'clarity' | 'conversion' | 'evidence'>('overview');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('convertaudit_unlocked') === 'true';
    }
    return false;
  });
  const [unlockedEmail, setUnlockedEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('convertaudit_unlocked_email') || '';
    }
    return '';
  });

  const filteredFindings = report.findings.filter(f => {
    if (selectedSeverity === 'all') return true;
    return f.severity === selectedSeverity;
  });

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto">
      {/* Top Header Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Ambient Gradient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                Audit Report · Mobile Profile
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400 font-mono">
                {new Date(report.audit.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-slate-100 flex items-center gap-3">
              <span className="truncate">{report.audit.host}</span>
              <a
                href={report.audit.normalized_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            </h1>
            <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
              "Fix the highlighted high-priority items below to recover most of the prospective leads leaving your site on phones."
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
            <button
              type="button"
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              Share
            </button>
            {onReAudit && (
              <button
                type="button"
                onClick={onReAudit}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
              >
                <RotateCw className="w-4 h-4 text-sky-400" />
                Re-Audit
              </button>
            )}
            <button
              type="button"
              onClick={() => setMonitorOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700"
            >
              <Bell className="w-4 h-4 text-amber-400" />
              Monitor
            </button>
          </div>
        </div>

        {/* Hero Scores Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-slate-800/80 items-center">
          <div className="flex justify-center border-r border-slate-800/60 pr-4">
            <GradeBadge grade={report.scores.grade} size="md" />
          </div>
          <div className="flex justify-center border-r border-slate-800/60 pr-4">
            <ScoreRing score={report.scores.speed} label="Mobile Speed" />
          </div>
          <div className="flex justify-center border-r border-slate-800/60 pr-4">
            <ScoreRing score={report.scores.clarity} label="5-Sec Clarity" />
          </div>
          <div className="flex justify-center">
            <ScoreRing score={report.scores.conversion} label="Conversion Friction" />
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'overview'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Top 10 Action Plan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('speed')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'speed'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Gauge className="w-4 h-4 text-emerald-400" />
          Speed & Core Web Vitals ({report.scores.speed})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('clarity')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'clarity'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          5-Second Clarity ({report.scores.clarity})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('conversion')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'conversion'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MousePointerClick className="w-4 h-4 text-sky-400" />
          Conversion Rubric ({report.scores.conversion})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('evidence')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'evidence'
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          All Findings ({report.findings.length})
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-100">Top Prioritized Fixes</h2>
              <p className="text-xs text-slate-400">
                Sorted by our revenue-weighted priority formula: (severity × impact × confidence) / effort.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isUnlocked ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Full Report Unlocked {unlockedEmail && !unlockedEmail.includes('preview_') ? `(${unlockedEmail})` : ''}
                </span>
              ) : (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Free Preview (Top 1 Unlocked)
                </span>
              )}
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
                {report.top_fixes.length} issues
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {isUnlocked ? (
              report.top_fixes.map(finding => (
                <FindingCard key={finding.code} finding={finding} />
              ))
            ) : (
              <>
                {/* 1. Show the #1 highest-priority fix completely visible */}
                {report.top_fixes.slice(0, 1).map(finding => (
                  <FindingCard key={finding.code} finding={finding} />
                ))}

                {/* 2. Lead Capture Gate for remaining fixes */}
                {report.top_fixes.length > 1 && (
                  <LeadCaptureGate
                    host={report.audit.host}
                    auditId={report.audit.id}
                    remainingCount={report.top_fixes.length - 1}
                    onUnlocked={(email) => {
                      setIsUnlocked(true);
                      setUnlockedEmail(email);
                    }}
                  />
                )}

                {/* 3. Blurred teasers of remaining fixes */}
                {report.top_fixes.slice(1).map((finding) => (
                  <div key={finding.code} className="relative group opacity-40 blur-[2px] select-none pointer-events-none">
                    <FindingCard finding={finding} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'speed' && (
        <SpeedTab
          score={report.speed.score}
          metrics={report.speed.metrics_lab}
          stability={report.speed.stability}
          waterfall={report.speed.waterfall_top}
        />
      )}

      {activeTab === 'clarity' && (
        <ClarityTab
          score={report.clarity.score}
          subscores={report.clarity.subscores}
          comprehension={report.clarity.comprehension}
          pins={report.clarity.pins}
          needsHumanReview={report.clarity.needs_human_review}
          suggestedRewrites={report.clarity.suggested_rewrites}
          screenshotUrl={report.artifacts.viewport_5s}
          targetUrl={report.audit.normalized_url}
          host={report.audit.host}
        />
      )}

      {activeTab === 'conversion' && (
        <ConversionTab
          score={report.conversion.score}
          rubric={report.conversion.rubric}
          primaryCta={report.conversion.primary_cta}
          contactPaths={report.conversion.contact_paths}
          overlayPenalty={report.conversion.overlay_penalty}
        />
      )}

      {activeTab === 'evidence' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-100">All Evidenced Findings Catalog</h3>
            <div className="flex gap-2">
              {['all', 'critical', 'high', 'medium'].map(sev => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSelectedSeverity(sev)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    selectedSeverity === sev
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {isUnlocked ? (
              filteredFindings.map(finding => (
                <FindingCard key={finding.code} finding={finding} />
              ))
            ) : (
              <>
                {filteredFindings.slice(0, 1).map(finding => (
                  <FindingCard key={finding.code} finding={finding} />
                ))}
                {filteredFindings.length > 1 && (
                  <LeadCaptureGate
                    host={report.audit.host}
                    auditId={report.audit.id}
                    remainingCount={filteredFindings.length - 1}
                    onUnlocked={(email) => {
                      setIsUnlocked(true);
                      setUnlockedEmail(email);
                    }}
                  />
                )}
                {filteredFindings.slice(1).map((finding) => (
                  <div key={finding.code} className="relative group opacity-40 blur-[2px] select-none pointer-events-none">
                    <FindingCard finding={finding} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Report Footer & Attribution */}
      <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>Audit ID: <span className="font-mono text-slate-400">{report.audit.id}</span></span>
          <span>·</span>
          <span>Profile v{report.audit.profile_version}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>ConvertAudit AI™ is a product by</span>
          <a
            href="https://webaxissolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-semibold underline decoration-indigo-500/40 underline-offset-2"
          >
            Web Axis Solutions (webaxissolutions.com)
          </a>
        </div>
      </div>

      {/* Export & Share Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        auditId={report.audit.id}
        host={report.audit.host}
        scoreOverall={report.scores.overall || 0}
        grade={report.scores.grade || 'C'}
      />
      {/* Monitor Panel */}
      <MonitorPanel isOpen={monitorOpen} onClose={() => setMonitorOpen(false)} />
    </div>
  );
};
