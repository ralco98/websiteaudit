import React from 'react';

interface ScoreRingProps {
  score: number | null;
  label: string;
  size?: number;
  strokeWidth?: number;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  label,
  size = 110,
  strokeWidth = 9,
}) => {
  const currentScore = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (currentScore / 100) * circumference;

  let colorClass = 'stroke-rose-500 text-rose-400';
  if (currentScore >= 90) colorClass = 'stroke-emerald-400 text-emerald-400';
  else if (currentScore >= 75) colorClass = 'stroke-green-400 text-green-400';
  else if (currentScore >= 55) colorClass = 'stroke-amber-400 text-amber-400';
  else if (currentScore >= 35) colorClass = 'stroke-orange-400 text-orange-400';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            className="stroke-slate-800/80 fill-none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${colorClass.split(' ')[0]} fill-none transition-all duration-1000 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-black ${colorClass.split(' ')[1]}`}>
            {score !== null ? currentScore : '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold tracking-wider">/ 100</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-300 tracking-wide text-center uppercase">
        {label}
      </span>
    </div>
  );
};
