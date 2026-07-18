'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CircularProgressProps {
  progress: number;
  level: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  level,
  size = 140,
  strokeWidth = 10,
  className,
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = React.useState(circumference);

  // Thick soft arc — same thickness as the XP bar, long faded sweep on empty track
  const trailLen = circumference * 0.42;

  React.useEffect(() => {
    const progressOffset = circumference - (progress / 100) * circumference;
    const timer = setTimeout(() => setOffset(progressOffset), 100);
    return () => clearTimeout(timer);
  }, [progress, circumference]);

  return (
    <div
      className={cn('relative', className)}
      style={{ width: size, height: size, marginBottom: 18 }}
    >
      <svg className="absolute top-0 left-0 overflow-visible" width={size} height={size}>
        <circle
          className="text-slate-800/90"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />

        {progress < 100 && (
          <g
            className="animate-xp-spin"
            style={{
              transformOrigin: `${size / 2}px ${size / 2}px`,
              transformBox: 'view-box',
              opacity: 0.22,
            }}
          >
            <circle
              stroke="hsl(var(--primary))"
              strokeWidth={strokeWidth}
              fill="transparent"
              r={radius}
              cx={size / 2}
              cy={size / 2}
              strokeDasharray={`${trailLen} ${circumference - trailLen}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </g>
        )}

        <circle
          className="text-primary"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="butt"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 bg-slate-900 border-4 border-slate-700 rounded-full flex items-center justify-center z-10">
        <span className="font-bold text-sm text-white">{level}</span>
      </div>
    </div>
  );
};

export { CircularProgress };
