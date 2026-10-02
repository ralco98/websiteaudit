import React, { useState } from 'react';
import { SpeedMetrics } from '@convertaudit/contracts';
import { AlertTriangle, Clock, Zap, Layers, Server, Activity } from 'lucide-react';

interface SpeedTabProps {
  score: number;
  metrics: SpeedMetrics;
  stability: 'stable' | 'moderate' | 'noisy';
  waterfall: Array<{
    url: string;
    bytes: number;
    duration_ms: number;
    type: string;
    isRenderBlocking?: boolean;
  }>;
}

export const SpeedTab: React.FC<SpeedTabProps> = ({
  score,
  metrics,
  stability,
  waterfall,
}) => {
  const [viewMode, setViewMode] = useState<'lab' | 'field'>('lab');

  // Classification Bands per Google CWV
  const getLcpBand = (val: number) => (val <= 2500 ? 'good' : val <= 4000 ? 'moderate' : 'poor');
  const getTbtBand = (val: number) => (val <= 200 ? 'good' : val <= 600 ? 'moderate' : 'poor');
  const getClsBand = (val: number) => (val <= 0.10 ? 'good' : val <= 0.25 ? 'moderate' : 'poor');
  const getTtfbBand = (val: number) => (val <= 800 ? 'good' : val <= 1800 ? 'moderate' : 'poor');

  const bandStyles = {
    good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    moderate: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    poor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  };

  const losingVisitors = metrics.lcp > 3000;

  return (
    <div className="space-y-6">
      {/* 3-Second Rule Banner */}
      {losingVisitors && (
        <div className="glass-panel border-amber-500/40 bg-amber-500/10 rounded-2xl p-4.5 flex items-start gap-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-300">
              3-Second Rule Alert: Mobile Visitors Are Leaving
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Your page takes <strong>{(metrics.lcp / 1000).toFixed(1)} seconds</strong> to display its main content on a standard mobile connection. Over 53% of phone visitors bounce when loading exceeds 3.0 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Lab vs Field Data Toggle Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100">Core Web Vitals & Load Performance</h3>
          <p className="text-xs text-slate-400">Emulated mid-tier Android phone over throttled 4G</p>
        </div>
        <div className="flex bg-slate-900/90 rounded-lg p-1 border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('lab')}
            className={`px-3 py-1 rounded-md transition-colors ${
              viewMode === 'lab' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lab Test (Synthetic)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('field')}
            className={`px-3 py-1 rounded-md transition-colors ${
              viewMode === 'field' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Real Visitors (CrUX)
          </button>
        </div>
      </div>

      {/* CWV Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* LCP */}
        <div className={`glass-panel rounded-xl p-4 border ${bandStyles[getLcpBand(metrics.lcp)]}`}>
          <div className="flex items-center justify-between text-xs mb-1 font-semibold opacity-80">
            <span>Largest Paint (LCP)</span>
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-black">
            {(metrics.lcp / 1000).toFixed(2)} <span className="text-sm font-normal">s</span>
          </div>
          <div className="text-[11px] mt-1 opacity-80 font-medium">
            Good ≤ 2.5s · Poor &gt; 4.0s
          </div>
        </div>

        {/* TBT */}
        <div className={`glass-panel rounded-xl p-4 border ${bandStyles[getTbtBand(metrics.tbt)]}`}>
          <div className="flex items-center justify-between text-xs mb-1 font-semibold opacity-80">
            <span>Blocking Time (TBT)</span>
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-black">
            {metrics.tbt} <span className="text-sm font-normal">ms</span>
          </div>
          <div className="text-[11px] mt-1 opacity-80 font-medium">
            Good ≤ 200ms · Poor &gt; 600ms
          </div>
        </div>

        {/* CLS */}
        <div className={`glass-panel rounded-xl p-4 border ${bandStyles[getClsBand(metrics.cls)]}`}>
          <div className="flex items-center justify-between text-xs mb-1 font-semibold opacity-80">
            <span>Layout Shift (CLS)</span>
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-black">
            {metrics.cls.toFixed(2)}
          </div>
          <div className="text-[11px] mt-1 opacity-80 font-medium">
            Good ≤ 0.10 · Poor &gt; 0.25
          </div>
        </div>

        {/* TTFB */}
        <div className={`glass-panel rounded-xl p-4 border ${bandStyles[getTtfbBand(metrics.ttfb)]}`}>
          <div className="flex items-center justify-between text-xs mb-1 font-semibold opacity-80">
            <span>Server Response (TTFB)</span>
            <Server className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-black">
            {metrics.ttfb} <span className="text-sm font-normal">ms</span>
          </div>
          <div className="text-[11px] mt-1 opacity-80 font-medium">
            Good ≤ 800ms · Poor &gt; 1.8s
          </div>
        </div>
      </div>

      {/* Network & Transfer Weight Summary */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800">
        <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          Page Weight & Request Pressure
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">Total Transferred</span>
            <div className="text-xl font-bold text-slate-100 mt-0.5">
              {(metrics.transferBytes / (1024 * 1024)).toFixed(2)} MB
            </div>
          </div>
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">Total Network Requests</span>
            <div className="text-xl font-bold text-slate-100 mt-0.5">{metrics.requests} requests</div>
          </div>
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400">Third-Party Blocking</span>
            <div className="text-xl font-bold text-slate-100 mt-0.5">{metrics.thirdPartyBlockingMs} ms</div>
          </div>
        </div>
      </div>

      {/* Request Waterfall Preview */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-slate-200">Heavy & Render-Blocking Asset Waterfall</h4>
          <span className="text-xs text-slate-400">Sorted by size & impact</span>
        </div>
        <div className="space-y-2.5">
          {waterfall.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono"
            >
              <div className="flex items-center gap-2 truncate max-w-[65%]">
                {item.isRenderBlocking && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    BLOCKING
                  </span>
                )}
                <span className="text-slate-300 truncate">{item.url}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-slate-400">{item.duration_ms} ms</span>
                <span className="font-semibold text-indigo-400">
                  {(item.bytes / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
