
'use client';

import React from 'react';

export const Crosshair: React.FC<{ speed: number }> = ({ speed }) => {
  const spread = Math.min(speed * 150, 40);

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-difference">
      {/* Center Dot */}
      <div className="w-1 h-1 bg-primary rounded-full" />

      {/* Dynamic Lines */}
      <div className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-primary transition-all duration-75"
           style={{ top: -(spread + 8), height: 8 }} />
      <div className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-primary transition-all duration-75"
           style={{ bottom: -(spread + 8), height: 8 }} />
      <div className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-primary transition-all duration-75"
           style={{ left: -(spread + 8), width: 8 }} />
      <div className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-primary transition-all duration-75"
           style={{ right: -(spread + 8), width: 8 }} />
    </div>
  );
};
