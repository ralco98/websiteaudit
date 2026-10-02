import React from 'react';
import { CheckCircle2, Clock, Smartphone, Loader2, Gauge, Sparkles, MousePointerClick } from 'lucide-react';

interface AuditProgressProps {
  url: string;
  percent: number;
  stage: string;
  etaSeconds: number;
  speedScore?: number | null;
  clarityScore?: number | null;
  conversionScore?: number | null;
  liveScreenshotUrl?: string;
  onViewSpeedEarly?: () => void;
}

function ScorePill({ score, icon, label, color }: { score: number; icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border ${color} animate-scaleIn`}>
      {icon}
      <span className="text-[11px] text-slate-400">{label}:</span>
      <span className={`text-sm font-black ${color.replace('border-', 'text-').replace('/40', '')}`}>{score}</span>
    </div>
  );
}

export const AuditProgress: React.FC<AuditProgressProps> = ({
  url,
  percent,
  stage,
  etaSeconds,
  speedScore,
  clarityScore,
  conversionScore,
  liveScreenshotUrl,
  onViewSpeedEarly,
}) => {
  const steps = [
    { id: 'network', label: 'Resolving and pinning destination via SSRF proxy', done: percent >= 10 },
    { id: 'capture', label: 'Browser sandbox launched (throttled 4G Android emulation)', done: percent >= 35 },
    { id: 'speed', label: 'Measured speed & Core Web Vitals', done: percent >= 58, score: speedScore, icon: <Gauge className="w-3.5 h-3.5 text-emerald-400" /> },
    { id: 'clarity', label: 'Reading homepage like a first-time visitor (5-second rule)', done: percent >= 75, score: clarityScore, icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" /> },
    { id: 'conversion', label: 'Detecting CTA buttons, contact paths & mobile ergonomics', done: percent >= 88, score: conversionScore, icon: <MousePointerClick className="w-3.5 h-3.5 text-sky-400" /> },
    { id: 'scoring', label: 'Compiling prioritized developer action plan', done: percent >= 100 },
  ];

  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'your website';

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
      {/* Header Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Animated ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-1">Audit In Progress</span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-100 truncate">{displayUrl}</h2>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>~{etaSeconds}s</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2 relative">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-300 max-w-[75%] truncate">{stage}</span>
            <span className="text-indigo-400 font-mono font-bold">{percent}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-900 border border-slate-800/80 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-sky-500 to-indigo-400 transition-all duration-700 ease-out shadow-glow"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Live module score badges */}
        {(speedScore !== null && speedScore !== undefined || clarityScore !== null && clarityScore !== undefined || conversionScore !== null && conversionScore !== undefined) && (
          <div className="flex flex-wrap gap-2">
            {speedScore !== null && speedScore !== undefined && (
              <ScorePill score={speedScore} icon={<Gauge className="w-3.5 h-3.5 text-emerald-400" />} label="Speed" color="border-emerald-500/40" />
            )}
            {clarityScore !== null && clarityScore !== undefined && (
              <ScorePill score={clarityScore} icon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />} label="Clarity" color="border-amber-500/40" />
            )}
            {conversionScore !== null && conversionScore !== undefined && (
              <ScorePill score={conversionScore} icon={<MousePointerClick className="w-3.5 h-3.5 text-sky-400" />} label="Conversion" color="border-sky-500/40" />
            )}
          </div>
        )}

        {/* Stages Checklist */}
        <div className="space-y-2.5 pt-1">
          {steps.map((step, idx) => {
            const isActive = !step.done && idx === steps.findIndex(s => !s.done);
            return (
              <div
                key={step.id}
                className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all duration-300 ${
                  step.done
                    ? 'bg-slate-900/60 border-slate-800 text-slate-200'
                    : isActive
                    ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-300'
                    : 'bg-slate-950/30 border-slate-900 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                  )}
                  <span className="font-medium">{step.label}</span>
                </div>

                {step.done && step.score !== undefined && step.score !== null && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {step.icon}
                    <span className="font-bold text-emerald-400 font-mono">{step.score}</span>
                    {onViewSpeedEarly && step.id === 'speed' && (
                      <button
                        type="button"
                        onClick={onViewSpeedEarly}
                        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold ml-1"
                      >
                        View
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Phone Screenshot Preview */}
      {liveScreenshotUrl && (
        <div className="glass-panel rounded-3xl p-6 border border-slate-800 flex flex-col items-center animate-scaleIn">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold text-slate-400">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span>Live Mobile Viewport Captured at 5.0 Seconds</span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </div>
          {/* Phone frame mockup */}
          <div className="relative">
            <div className="w-52 h-[26rem] rounded-[2.5rem] border-4 border-slate-700 bg-slate-950 shadow-2xl overflow-hidden flex flex-col">
              {/* Phone notch */}
              <div className="h-7 bg-slate-900 flex items-center justify-center">
                <div className="w-16 h-3 rounded-full bg-slate-800" />
              </div>
              {/* Screenshot */}
              <div className="flex-1 overflow-hidden">
                <img
                  src={liveScreenshotUrl}
                  alt="Live captured page"
                  className="w-full h-full object-cover object-top opacity-90"
                />
              </div>
            </div>
            {/* Corner glow */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-8 bg-indigo-500/20 rounded-full blur-xl" />
          </div>
        </div>
      )}
    </div>
  );
};
