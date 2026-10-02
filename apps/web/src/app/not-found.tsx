import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#070b14] text-slate-100">
      <div className="glass-panel max-w-md w-full p-8 rounded-2xl text-center border border-slate-800 shadow-2xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-2xl font-mono">
          404
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Audit Report Not Found</h2>
        <p className="text-sm text-slate-400 mb-6">
          The requested audit report could not be found or may have expired.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/25"
        >
          Run a New Audit
        </Link>
      </div>
    </div>
  );
}
