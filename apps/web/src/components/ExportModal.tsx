import React, { useState } from 'react';
import { X, FileText, Download, Share2, Check, Copy, Palette } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditId: string;
  host: string;
  scoreOverall: number;
  grade: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  auditId,
  host,
  scoreOverall,
  grade,
}) => {
  const [format, setFormat] = useState<'pdf' | 'json'>('pdf');
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
  const [downloading, setDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    setDownloading(true);
    if (format === 'pdf') {
      setTimeout(() => {
        setDownloading(false);
        onClose();
        window.print();
      }, 300);
    } else {
      setTimeout(() => {
        setDownloading(false);
        const element = document.createElement('a');
        const file = new Blob([JSON.stringify({ auditId, host, scoreOverall, grade, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
        element.href = URL.createObjectURL(file);
        element.download = `ConvertAudit_${host}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      }, 500);
    }
  };

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/r/${auditId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl glass-panel bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-slate-100">Export & Share Audit Report</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Choose Output Format</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold transition-all ${
                format === 'pdf'
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-400" />
              White-Label PDF (7 Pages)
            </button>
            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold transition-all ${
                format === 'json'
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/20'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              Canonical JSON (report.v1)
            </button>
          </div>
        </div>

        {/* White-Label Settings Preview */}
        {format === 'pdf' && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-indigo-400" />
                Active Brand Profile
              </span>
              <span className="text-emerald-400 font-medium">Web Axis Solutions (Default Agency Brand)</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
              <span className="text-slate-400">Page Size Format</span>
              <div className="flex gap-2 font-mono">
                <button
                  type="button"
                  onClick={() => setPageSize('A4')}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                    pageSize === 'A4' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  A4
                </button>
                <button
                  type="button"
                  onClick={() => setPageSize('Letter')}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                    pageSize === 'Letter' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  US Letter
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share Link Generation Box */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Public Client Share Link</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/r/share_${auditId.replace('aud_', '')}`}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span className="text-[11px] text-slate-500 block">
            Clients view this branded report without logging in. Link expires in 30 days.
          </span>
        </div>

        {/* Download Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-glow disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Compiling PDF with Typst...' : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
