import React, { useState } from 'react';
import { Finding } from '@convertaudit/contracts';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Zap,
  Code2,
  Eye,
  ShieldCheck,
  BookOpen,
  Activity,
  Layers,
} from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
  onResolve?: (code: string) => void;
  onDismiss?: (code: string) => void;
}

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  onResolve,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resolved, setResolved] = useState(finding.state === 'resolved');

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(finding.developerBrief || finding.developer_brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const severityConfigs = {
    critical: { icon: AlertCircle, bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', label: 'Critical' },
    high: { icon: AlertTriangle, bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30', label: 'High' },
    medium: { icon: AlertTriangle, bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Medium' },
    low: { icon: Info, bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Low' },
    info: { icon: Info, bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30', label: 'Info' },
  };

  const sev = severityConfigs[finding.severity] || severityConfigs.medium;
  const SevIcon = sev.icon;

  const effortLabels = {
    1: { label: 'Easy (< 15 min)', pips: 1 },
    2: { label: 'Medium (< 2 h)', pips: 2 },
    3: { label: 'Dev Needed', pips: 3 },
  };
  const effort = effortLabels[finding.effort] || effortLabels[1];

  const confidencePct = Math.round((finding.confidence !== undefined ? finding.confidence : 1.0) * 100);
  const evidenceTypeLabel =
    finding.evidenceType === 'dom'
      ? 'DOM Measurement'
      : finding.evidenceType === 'performance'
      ? 'Performance Observer'
      : finding.evidenceType === 'visual'
      ? 'Visual Layout'
      : finding.evidenceType === 'network'
      ? 'Network Telemetry'
      : finding.source === 'BROWSER'
      ? 'Browser Ground Truth'
      : 'Deterministic Rule';

  const renderObservedContent = () => {
    if (!finding.observed) return null;

    if (typeof finding.observed === 'string') {
      return (
        <p className="text-xs text-slate-300 font-mono leading-relaxed">
          {finding.observed}
        </p>
      );
    }

    if (typeof finding.observed === 'object') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {Object.entries(finding.observed).map(([key, value]) => {
            if (value === undefined || value === null) return null;
            const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
            return (
              <div key={key} className="flex items-baseline justify-between bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[11px] capitalize">
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                </span>
                <span className="text-slate-200 font-mono font-medium truncate ml-2 max-w-[200px]" title={displayVal}>
                  {displayVal}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`glass-panel rounded-2xl p-5 transition-all duration-200 border ${
        resolved
          ? 'opacity-60 border-emerald-500/20 bg-slate-900/40'
          : 'border-slate-800 hover:border-slate-700/80 shadow-card hover:shadow-glow'
      }`}
    >
      {/* Top Metadata Header with Confidence & Evidence Type */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {finding.rank && (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold">
              #{finding.rank}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sev.bg}`}>
            <SevIcon className="w-3.5 h-3.5" />
            {sev.label}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700/50 uppercase tracking-wider">
            {finding.category || finding.module}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <ShieldCheck className="w-3 h-3" />
            Confidence: {confidencePct}%
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            <Layers className="w-3 h-3" />
            Evidence: {evidenceTypeLabel}
          </span>
        </div>

        {/* Priority & Effort Indicator */}
        <div className="flex items-center gap-3">
          {finding.priorityScore !== undefined && finding.priorityScore > 0 && (
            <div className="flex items-center gap-1 text-xs text-indigo-300 font-semibold bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/40">
              <Activity className="w-3 h-3 text-indigo-400" />
              <span>Priority: {finding.priorityScore}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-800">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Effort:</span>
            <div className="flex gap-1 ml-0.5">
              {[1, 2, 3].map(pip => (
                <span
                  key={pip}
                  className={`w-1.5 h-3.5 rounded-sm ${
                    pip <= effort.pips ? 'bg-amber-400' : 'bg-slate-700/60'
                  }`}
                />
              ))}
            </div>
            <span className="ml-1 text-[11px] text-slate-400">{effort.label}</span>
          </div>
        </div>
      </div>

      {/* Title / Headline */}
      <h3 className={`text-lg font-bold tracking-tight mb-2.5 ${resolved ? 'line-through text-slate-400' : 'text-slate-100'}`}>
        {finding.title || finding.headline}
      </h3>

      {/* Observed Facts Block (Observable & Reproducible Evidence) */}
      {(finding.observed || (finding.evidence && finding.evidence.length > 0)) && (
        <div className="bg-slate-950/70 rounded-xl p-3.5 border border-slate-800/80 mb-3.5">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span>What We Observed (Fact)</span>
          </div>
          {renderObservedContent()}

          {/* Legacy fallback selector line if observed object is absent */}
          {!finding.observed && finding.evidence && finding.evidence.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
              <span>{finding.evidence[0]?.selector || finding.evidence[0]?.hash || 'Visual element flagged in hero section'}</span>
              {finding.params?.bytes && (
                <span className="font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  {(finding.params.bytes / (1024 * 1024)).toFixed(2)} MB
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Why it Matters (Impact) */}
      <p className="text-sm text-slate-400 leading-relaxed mb-3">
        <strong className="text-slate-300 font-semibold">Why it matters: </strong>
        {finding.whyItMatters || finding.impact}
      </p>

      {/* Clearly Separated Conversion Heuristic */}
      {finding.heuristic && (
        <div className="bg-amber-500/5 rounded-xl px-3 py-2 border border-amber-500/15 mb-3 text-xs text-amber-300/90 leading-relaxed flex items-start gap-2">
          <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-200 font-semibold">Conversion Principle (Heuristic): </strong>
            {finding.heuristic}
          </div>
        </div>
      )}

      {/* Clearly Separated External Benchmark (with real source attribution) */}
      {finding.benchmark && (
        <div className="bg-blue-500/5 rounded-xl px-3 py-2 border border-blue-500/15 mb-3 text-xs text-blue-300/90 leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-blue-200 font-semibold">External Research Benchmark: </strong>
            &ldquo;{finding.benchmark.claim}&rdquo; —{' '}
            <span className="text-slate-400">
              Source: {finding.benchmark.source} {finding.benchmark.date ? `(${finding.benchmark.date})` : ''}
              {finding.benchmark.context ? ` [${finding.benchmark.context}]` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Expand/Collapse Trigger */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full pt-3 border-t border-slate-800/80 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {expanded ? 'Hide remediation & developer brief' : 'View how to fix & developer brief'}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Expanded Accordion Body */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-4 animate-fadeIn">
          {/* Plain English Fix */}
          <div className="bg-indigo-500/5 rounded-xl p-3.5 border border-indigo-500/20">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              How to Fix (Plain English)
            </h4>
            <p className="text-sm text-slate-200 leading-relaxed">
              {finding.remediation || finding.fix}
            </p>
          </div>

          {/* Developer Brief with Copy Button */}
          <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 relative">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-indigo-400" />
                Developer Brief (Copy-Paste to Freelancer)
              </h4>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Brief'}
              </button>
            </div>
            <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 overflow-x-auto">
              {finding.developerBrief || finding.developer_brief}
            </pre>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setResolved(!resolved);
                onResolve?.(finding.code);
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                resolved
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30'
              }`}
            >
              {resolved ? 'Mark Unresolved' : 'Mark Resolved'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
