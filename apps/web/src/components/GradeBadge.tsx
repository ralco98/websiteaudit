import React from 'react';

interface GradeBadgeProps {
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  size?: 'sm' | 'md' | 'lg';
}

export const GradeBadge: React.FC<GradeBadgeProps> = ({ grade = 'C', size = 'md' }) => {
  const g = grade || 'C';

  const colorStyles: Record<string, { bg: string; text: string; border: string; glow: string; label: string }> = {
    A: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'badge-glow-good', label: 'Converting well' },
    B: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', glow: 'badge-glow-good', label: 'Solid, minor leaks' },
    C: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'badge-glow-medium', label: 'Leaking leads' },
    D: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', glow: 'badge-glow-critical', label: 'Serious problems' },
    F: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'badge-glow-critical', label: 'Visitors leaving' },
  };

  const current = colorStyles[g] || colorStyles.C;

  const sizeClasses = {
    sm: 'w-10 h-10 text-xl font-extrabold',
    md: 'w-20 h-20 text-4xl font-extrabold',
    lg: 'w-28 h-28 text-6xl font-black',
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`flex items-center justify-center rounded-2xl border ${current.bg} ${current.text} ${current.border} ${current.glow} ${sizeClasses[size]} transition-all duration-300 shadow-xl`}
      >
        <span>{g}</span>
      </div>
      {size !== 'sm' && (
        <span className={`text-xs font-semibold uppercase tracking-wider ${current.text}`}>
          {current.label}
        </span>
      )}
    </div>
  );
};
