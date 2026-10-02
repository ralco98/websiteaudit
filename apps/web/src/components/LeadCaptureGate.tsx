import React, { useState } from 'react';
import { Lock, Unlock, Mail, ArrowRight, ShieldCheck, CheckCircle2, Sparkles, Code2 } from 'lucide-react';

interface LeadCaptureGateProps {
  host: string;
  auditId: string;
  remainingCount: number;
  onUnlocked: (email: string) => void;
}

export const LeadCaptureGate: React.FC<LeadCaptureGateProps> = ({
  host,
  auditId,
  remainingCount,
  onUnlocked,
}) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setErrorMsg('Please enter a valid work or personal email address.');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      // Send lead to backend API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${apiUrl}/v1/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          audit_id: auditId,
          host,
          source: 'report_lead_gate',
        }),
      }).catch(err => {
        console.warn('Lead API save fallback:', err);
      });

      // Save locally so the user remains unlocked across tabs/sessions
      localStorage.setItem('convertaudit_unlocked', 'true');
      localStorage.setItem('convertaudit_unlocked_email', email.trim());

      onUnlocked(email.trim());
    } catch (err: any) {
      // Even on network error, ensure user gets unlocked
      localStorage.setItem('convertaudit_unlocked', 'true');
      onUnlocked(email.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipPreview = () => {
    localStorage.setItem('convertaudit_unlocked', 'true');
    onUnlocked('preview_user@local');
  };

  return (
    <div className="relative my-8 rounded-3xl overflow-hidden border border-indigo-500/40 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 p-6 sm:p-10 shadow-2xl animate-fadeIn">
      {/* Ambient background glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto text-center space-y-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold tracking-wide">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>DEVELOPER FIXES & REMAINING EVIDENCE GATED</span>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h3 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
            Unlock all <span className="text-indigo-400">+{remainingCount} Evidenced Fixes</span> for {host}
          </h3>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Get the full prioritized developer briefs, exact DOM element selectors, mobile touch dimensions, and copy-paste CSS/HTML code fixes.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2 pb-2">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <Code2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">Copy-Paste Fixes</span>
              <span className="text-slate-400">Ready CSS & HTML code snippets.</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">DOM Telemetry</span>
              <span className="text-slate-400">Exact pixel bounds and selectors.</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">Permanent Link</span>
              <span className="text-slate-400">Saved audit link to share with your team.</span>
            </div>
          </div>
        </div>

        {/* Lead Capture Form */}
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto pt-2 space-y-3">
          <div className="relative flex flex-col sm:flex-row items-center gap-2 p-1.5 rounded-2xl bg-slate-950 border border-slate-700 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all shadow-inner">
            <div className="flex items-center gap-3 w-full px-3 py-2 sm:py-0">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email to unlock..."
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-medium"
                disabled={isSubmitting}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-glow shrink-0"
            >
              {isSubmitting ? (
                <span>Unlocking...</span>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock Full Audit</span>
                </>
              )}
            </button>
          </div>
          {errorMsg && (
            <p className="text-xs text-rose-400 text-left px-2 font-medium">{errorMsg}</p>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 pt-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              100% Free · No spam ever · Instant unlock
            </span>
            <button
              type="button"
              onClick={handleSkipPreview}
              className="text-slate-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
            >
              Preview report anyway
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
