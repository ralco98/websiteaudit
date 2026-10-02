import React, { useState, useEffect } from 'react';
import { ClaritySubscores, ClarityComprehension } from '@convertaudit/contracts';
import { Check, Copy, HelpCircle, Sparkles, Smartphone, ShieldAlert, Globe, ExternalLink, Lock } from 'lucide-react';

interface ClarityTabProps {
  score: number;
  subscores: ClaritySubscores;
  comprehension: ClarityComprehension;
  pins: Array<{ id: number; x: number; y: number; label: string }>;
  needsHumanReview: boolean;
  suggestedRewrites?: Array<{ original: string; rewrite: string; rationale: string }>;
  screenshotUrl?: string;
  targetUrl?: string;
  host?: string;
}

export const ClarityTab: React.FC<ClarityTabProps> = ({
  score,
  subscores,
  comprehension,
  pins,
  needsHumanReview,
  suggestedRewrites,
  screenshotUrl,
  targetUrl,
  host,
}) => {
  const [activePin, setActivePin] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'screenshot' | 'interactive'>('screenshot');

  const effectiveUrl = targetUrl || (host ? (host.startsWith('http') ? host : `https://${host}`) : '');
  const displayHost = host || (effectiveUrl ? new URL(effectiveUrl).hostname : 'audited-site.com');

  // Compute live screenshot URL for the actual website
  const getPrimaryScreenshot = () => {
    if (screenshotUrl && !screenshotUrl.includes('images.unsplash.com')) {
      return screenshotUrl;
    }
    if (effectiveUrl) {
      return `https://s0.wp.com/mshots/v1/${encodeURIComponent(effectiveUrl)}?w=390&h=844`;
    }
    return '';
  };

  const [currentImgUrl, setCurrentImgUrl] = useState<string>(getPrimaryScreenshot());

  useEffect(() => {
    setCurrentImgUrl(getPrimaryScreenshot());
  }, [screenshotUrl, effectiveUrl]);

  const handleImageError = () => {
    if (effectiveUrl && !currentImgUrl.includes('microlink.io')) {
      // Fallback to Microlink live renderer
      setCurrentImgUrl(`https://api.microlink.io/?url=${encodeURIComponent(effectiveUrl)}&screenshot=true&meta=false&embed=screenshot.url`);
    }
  };

  const subscoreItems = [
    { key: 'headline_specificity', label: 'Headline Specificity', val: subscores.headline_specificity, desc: 'Names offering and location clearly' },
    { key: 'value_proposition', label: 'Value Proposition', val: subscores.value_proposition, desc: 'Clear benefit and customer differentiator' },
    { key: 'visual_hierarchy', label: 'Visual Hierarchy', val: subscores.visual_hierarchy, desc: 'Natural eye path from headline to action' },
    { key: 'imagery_relevance', label: 'Imagery Relevance', val: subscores.imagery_relevance, desc: 'Shows authentic work/service vs generic stock' },
    { key: 'cognitive_load', label: 'Cognitive Load', val: subscores.cognitive_load, desc: 'Uncluttered, focused above-the-fold layout' },
  ];

  const handleCopyRewrite = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Human Review Banner if uncertain */}
      {needsHumanReview && (
        <div className="glass-panel border-amber-500/40 bg-amber-500/10 rounded-2xl p-4 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-xs text-slate-300">
            <strong>Needs human review: </strong> High variance detected between AI passes. Results reflect median judgment with conservative confidence bounds.
          </p>
        </div>
      )}

      {/* Main 5-Second View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Mobile Phone Frame with Real Audited Website */}
        <div className="lg:col-span-5 flex flex-col items-center">
          {/* View Mode Controls */}
          <div className="flex items-center gap-2 mb-3 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('screenshot')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'screenshot'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>5s Snapshot & Pins</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('interactive')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'interactive'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live Website View</span>
            </button>
          </div>

          {/* Mobile Phone Mockup (390×844 Aspect Ratio) */}
          <div className="relative w-[320px] h-[640px] bg-slate-950 rounded-[44px] p-3 border-4 border-slate-700/80 shadow-2xl overflow-hidden flex flex-col">
            {/* Phone Speaker & Dynamic Island */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-full z-30 flex items-center justify-center border border-slate-800">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mr-2" />
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />
            </div>

            {/* Screen Inner Container */}
            <div className="relative w-full h-full rounded-[34px] overflow-hidden bg-slate-900 flex flex-col pt-7">
              {/* Mobile Browser Address Bar */}
              <div className="bg-slate-950/95 border-b border-slate-800/80 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-300 z-20 shrink-0">
                <div className="flex items-center gap-1.5 truncate max-w-[210px]">
                  <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="font-mono truncate">{displayHost}</span>
                </div>
                {effectiveUrl && (
                  <a
                    href={effectiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open website in new window"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Viewport Content */}
              <div className="relative flex-1 w-full overflow-hidden bg-slate-950">
                {viewMode === 'interactive' && effectiveUrl ? (
                  <div className="w-full h-full relative">
                    <iframe
                      src={effectiveUrl}
                      title={`Live mobile preview of ${displayHost}`}
                      className="w-full h-full border-0 bg-white"
                      sandbox="allow-scripts allow-same-origin allow-forms"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full relative overflow-hidden bg-slate-900">
                    {currentImgUrl ? (
                      <img
                        src={currentImgUrl}
                        alt={`Mobile 5-second capture of ${displayHost}`}
                        onError={handleImageError}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                        <Smartphone className="w-8 h-8 mb-2 text-indigo-400/60" />
                        <span className="text-xs font-semibold text-slate-400">{displayHost}</span>
                        <span className="text-[11px] text-slate-500 mt-1">Live capture rendered for mobile viewport</span>
                      </div>
                    )}

                    {/* Interactive Clarity Pins Overlay */}
                    {pins.map(pin => (
                      <button
                        key={pin.id}
                        type="button"
                        onClick={() => setActivePin(pin.id === activePin ? null : pin.id)}
                        style={{ top: `${Math.min(90, Math.max(10, (pin.y / 844) * 100))}%`, left: `${Math.min(90, Math.max(10, (pin.x / 390) * 100))}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-xl transition-all transform ${
                          activePin === pin.id
                            ? 'scale-125 bg-amber-400 text-slate-950 ring-4 ring-amber-400/40 z-30'
                            : 'bg-indigo-600 text-white ring-2 ring-white/80 hover:scale-110 z-10'
                        }`}
                      >
                        {pin.id}
                      </button>
                    ))}

                    {/* Active Pin Tooltip popup inside viewport */}
                    {activePin !== null && (
                      <div className="absolute bottom-4 left-3 right-3 p-3 rounded-xl bg-slate-950/95 border border-indigo-500/40 text-xs shadow-2xl backdrop-blur-md z-30 animate-fadeIn">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-amber-400 text-[11px]">Pin #{activePin} Hotspot</span>
                          <button
                            type="button"
                            onClick={() => setActivePin(null)}
                            className="text-slate-400 hover:text-white text-[10px]"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="text-slate-200 text-xs">
                          {pins.find(p => p.id === activePin)?.label || 'Clarity observation point'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <span className="text-[11px] text-slate-400 mt-2.5 text-center flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Showing actual audited site: <strong className="text-slate-200">{displayHost}</strong>
          </span>
        </div>

        {/* Right: Subscores & Blind Comprehension */}
        <div className="lg:col-span-7 space-y-5">
          {/* Subscores breakdown */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <h4 className="text-sm font-bold text-slate-100 mb-4 flex items-center justify-between">
              <span>5-Second Rule Sub-Scores (0–20 each)</span>
              <span className="text-indigo-400 font-extrabold">{score} / 100</span>
            </h4>

            <div className="space-y-3.5">
              {subscoreItems.map(item => (
                <div key={item.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-200">{item.label}</span>
                    <span className="font-mono font-bold text-slate-300">{item.val} / 20</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        item.val >= 15 ? 'bg-emerald-400' : item.val >= 10 ? 'bg-amber-400' : 'bg-rose-500'
                      }`}
                      style={{ width: `${(item.val / 20) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Blind Comprehension Test */}
          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <h4 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              First-Time Visitor Blind Comprehension Test
            </h4>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-0.5">What is offered?</span>
                <span className="text-slate-100 font-medium">
                  {comprehension.what_offered.answer || 'Unclear — cannot determine specific product or service from hero'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-0.5">Who is it for?</span>
                <span className="text-slate-100 font-medium">
                  {comprehension.who_for.answer || 'Unclear target audience'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-0.5">What do I do next?</span>
                <span className="text-rose-400 font-medium">
                  {comprehension.next_step.answer || 'No clear next step visible above the fold'}
                </span>
              </div>
            </div>
          </div>

          {/* Suggested Rewrites */}
          {suggestedRewrites && suggestedRewrites.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 border border-indigo-500/30 bg-indigo-500/5">
              <h4 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                AI-Suggested Headline Rewrites for {displayHost}
              </h4>
              <div className="space-y-3">
                {suggestedRewrites.map((rw, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-slate-950/80 border border-indigo-500/20 text-xs">
                    <div className="text-slate-400 mb-1">
                      Current: <span className="line-through text-slate-500">"{rw.original}"</span>
                    </div>
                    <div className="text-emerald-300 font-semibold text-sm mb-2">
                      Suggested: "{rw.rewrite}"
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400">{rw.rationale}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyRewrite(rw.rewrite, i)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors"
                      >
                        {copiedIdx === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedIdx === i ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
