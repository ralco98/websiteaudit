import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Globe, Calendar, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

interface Monitor {
  id: string;
  host: string;
  url: string;
  schedule: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  active: boolean;
  next_run_at: string;
  last_grade: string | null;
  created_at: string;
}

interface MonitorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SCHEDULES = [
  { value: 'DAILY', label: 'Daily', desc: '24 credits/month' },
  { value: 'WEEKLY', label: 'Weekly', desc: '4–5 credits/month' },
  { value: 'MONTHLY', label: 'Monthly', desc: '1 credit/month' },
];

const gradeColor = (g: string | null) => {
  if (!g) return 'text-slate-500';
  if (g === 'A') return 'text-emerald-400';
  if (g === 'B') return 'text-sky-400';
  if (g === 'C') return 'text-amber-400';
  if (g === 'D') return 'text-orange-400';
  return 'text-rose-400';
};

export const MonitorPanel: React.FC<MonitorPanelProps> = ({ isOpen, onClose }) => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [schedule, setSchedule] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const loadMonitors = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/v1/monitors`);
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.data || []);
      }
    } catch { /* offline */ }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) loadMonitors();
  }, [isOpen]);

  const handleAdd = async () => {
    if (!urlInput.trim()) { setError('Please enter a URL'); return; }
    setAdding(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/v1/monitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim(), schedule, notify_email: emailInput || null, notify_on_grade_drop: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || 'Failed to create monitor');
      }
      const monitor = await res.json();
      setMonitors(prev => [monitor, ...prev]);
      setUrlInput(''); setEmailInput(''); setShowForm(false);
    } catch (e: any) {
      setError(e.message || 'Network error');
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${apiUrl}/v1/monitors/${id}`, { method: 'DELETE' });
      setMonitors(prev => prev.filter(m => m.id !== id));
    } catch { /* offline */ }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg glass-panel rounded-3xl border border-slate-700 shadow-2xl animate-scaleIn overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Bell className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Site Monitors</h3>
              <p className="text-xs text-slate-400">Automated recurring audits with grade-drop alerts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Add monitor button / form */}
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500/60 text-slate-400 hover:text-indigo-300 transition-all text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add new monitor
            </button>
          ) : (
            <div className="glass-panel rounded-xl p-4 border border-indigo-500/30 space-y-3 animate-slideUp">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Website URL</label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://yourbusiness.com"
                  className="w-full bg-slate-900 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {SCHEDULES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSchedule(s.value as any)}
                      className={`p-2 rounded-lg text-xs font-semibold transition-all border ${
                        schedule === s.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div>{s.label}</div>
                      <div className="text-[10px] opacity-75">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Alert Email (optional)</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="you@agency.com"
                  className="w-full bg-slate-900 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Create Monitor
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(''); }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Monitor list */}
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
          ) : monitors.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No monitors yet. Add one to get weekly grade-drop alerts.
            </div>
          ) : (
            <div className="space-y-2">
              {monitors.map((m, i) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 gap-3 animate-slideIn"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-200 truncate">{m.host}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        <span>{m.schedule.toLowerCase()}</span>
                        <span>·</span>
                        <span>next: {new Date(m.next_run_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.last_grade && (
                      <span className={`text-base font-black ${gradeColor(m.last_grade)}`}>{m.last_grade}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
