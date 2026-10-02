import React from 'react';
import { ConversionRubricResult, PrimaryCTAInfo } from '@convertaudit/contracts';
import { CheckCircle2, AlertTriangle, XCircle, Phone, Mail, FileText, MousePointerClick, ShieldCheck } from 'lucide-react';

interface ConversionTabProps {
  score: number;
  rubric: ConversionRubricResult[];
  primaryCta: PrimaryCTAInfo | null;
  contactPaths: Array<{ type: 'tel' | 'mailto' | 'form' | 'booking' | 'messaging'; target: string; isProminent: boolean }>;
  overlayPenalty: number;
}

export const ConversionTab: React.FC<ConversionTabProps> = ({
  score,
  rubric,
  primaryCta,
  contactPaths,
  overlayPenalty,
}) => {
  const statusIcons = {
    pass: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    warn: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    fail: <XCircle className="w-4 h-4 text-rose-500 shrink-0" />,
  };

  const statusBadges = {
    pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    fail: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  };

  return (
    <div className="space-y-6">
      {/* Primary CTA Prominence Card */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800">
        <h4 className="text-sm font-bold text-slate-100 mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-indigo-400" />
            Detected Primary Call-to-Action (CTA)
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
            {primaryCta ? `P-Score: ${primaryCta.prominence}` : 'No CTA Detected'}
          </span>
        </h4>

        {primaryCta ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Button Copy</span>
              <span className="font-semibold text-slate-200 truncate block">"{primaryCta.text}"</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Fold Placement</span>
              <span className={`font-semibold ${primaryCta.isAboveFold ? 'text-emerald-400' : 'text-rose-400'}`}>
                {primaryCta.isAboveFold ? 'Above Fold (< 844px)' : 'Below Fold (> 844px)'}
              </span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Color Contrast</span>
              <span className={`font-semibold ${primaryCta.contrastRatio >= 4.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {primaryCta.contrastRatio.toFixed(1)}:1 {primaryCta.contrastRatio >= 4.5 ? '(Pass)' : '(Low)'}
              </span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-1">Prominence Rating</span>
              <span className="font-semibold text-indigo-400">
                {primaryCta.prominence >= 0.70 ? 'High' : primaryCta.prominence >= 0.40 ? 'Moderate' : 'Weak'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            Critical issue: No actionable conversion button found above the mobile fold. Visitors have no prominent next step.
          </div>
        )}
      </div>

      {/* Available Contact Paths */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800">
        <h4 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
          <Phone className="w-4 h-4 text-emerald-400" />
          Lead Capture & Contact Channels Detected
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <Phone className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-slate-400 block text-[11px]">Tap-to-Call (tel:)</span>
              <span className="font-semibold text-slate-200">
                {contactPaths.some(p => p.type === 'tel') ? 'Active & Clickable' : 'Missing / Unlinked'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <Mail className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-slate-400 block text-[11px]">Email / Messaging</span>
              <span className="font-semibold text-slate-200">
                {contactPaths.some(p => p.type === 'mailto') ? 'Available' : 'None detected'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <FileText className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-slate-400 block text-[11px]">Lead Capture Form</span>
              <span className="font-semibold text-slate-200">
                {contactPaths.some(p => p.type === 'form') ? 'Present' : 'None in hero'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 100-Point Deterministic Rubric Checklist */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            Conversion Friction Rubric Breakdown
          </h4>
          <span className="text-xs font-bold text-indigo-400">{score} / 100 Points</span>
        </div>

        <div className="space-y-3">
          {rubric.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
            >
              <div className="flex items-center gap-3">
                {statusIcons[item.status]}
                <div>
                  <span className="font-semibold text-slate-200 block">{item.item}</span>
                  <span className="text-[11px] text-slate-400">{item.detail}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${statusBadges[item.status]}`}>
                  +{item.pointsEarned} / {item.maxPoints} pts
                </span>
              </div>
            </div>
          ))}

          {overlayPenalty > 0 && (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <div>
                  <span className="font-semibold text-rose-300 block">Intrusive Overlay / Modal Penalty</span>
                  <span className="text-[11px] text-slate-300">Popup or banner blocks over 30% of initial mobile screen</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                -{overlayPenalty} pts
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
