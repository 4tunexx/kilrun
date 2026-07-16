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

  React.useEffect(() => {
    const progressOffset = circumference - (progress / 100) * circumference;
    const timer = setTimeout(() => setOffset(progressOffset), 100);
    return () => clearTimeout(timer);
  }, [progress, circumference]);

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }}>
      <svg className="absolute top-0 left-0" width={size} height={size}>
        <circle
          className="text-slate-800/80"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-primary animate-progress-pulse"
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
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-10 h-10 bg-slate-900 border-4 border-slate-700 rounded-full flex items-center justify-center">
        <span className="font-bold text-sm text-white">{level}</span>
      </div>
    </div>
  );
};

export { CircularProgress };
