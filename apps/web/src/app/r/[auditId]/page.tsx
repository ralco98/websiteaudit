'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ReportV1 } from '@convertaudit/contracts';
import { ReportView } from '../../../components/ReportView';
import { Zap, Printer, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function PublicReportPage() {
  const params = useParams();
  const auditId = params?.auditId as string;

  const [report, setReport] = useState<ReportV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auditId) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const cleanId = auditId.startsWith('share_') ? `aud_${auditId.replace('share_', '')}` : auditId;

    async function loadReport() {
      try {
        setLoading(true);
        setError(null);

        // Fetch from API
        const res = await fetch(`${apiUrl}/v1/audits/${cleanId}/report`);
        if (!res.ok) {
          throw new Error('Report not found or still processing');
        }
        const data = await res.json();
        setReport(data);
      } catch (err: any) {
        // Check localStorage cache for recent audits
        try {
          const cached = localStorage.getItem(`audit_${cleanId}`);
          if (cached) {
            setReport(JSON.parse(cached));
            return;
          }
        } catch (e) {
          // ignore
        }
        setError(err.message || 'Unable to load audit report');
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [auditId]);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 selection:bg-indigo-500 selection:text-white flex flex-col justify-between">
      {/* Executive Agency Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-slate-800/80 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Official Client Audit</span>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
            <h3 className="text-base font-bold text-slate-200">Loading Client Audit Report...</h3>
            <p className="text-xs text-slate-400 mt-1">Retrieving Core Web Vitals, 5s clarity capture, and prioritized action plan.</p>
          </div>
        )}

        {error && !loading && (
          <div className="max-w-md mx-auto glass-panel rounded-3xl p-8 border border-rose-500/40 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100">Report Unavailable</h3>
            <p className="text-xs text-slate-400">
              The requested audit report ID (<span className="font-mono text-slate-300">{auditId}</span>) could not be loaded or has expired.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
            >
              Run New Audit
            </Link>
          </div>
        )}

        {report && !loading && (
          <ReportView report={report} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-4 sm:px-6 text-center text-xs text-slate-500 bg-[#060a12]/60">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">ConvertAudit AI™</span>
            <span>·</span>
            <span>A Product by <a href="https://webaxissolutions.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Web Axis Solutions (webaxissolutions.com)</a></span>
          </div>
          <div className="text-[11px] text-slate-500">
            Confidential Client Audit Deliverable · Tested on Simulated Mobile Device
          </div>
        </div>
      </footer>
    </div>
  );
}
