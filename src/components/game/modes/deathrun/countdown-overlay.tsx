'use client';

import React from 'react';

export const CountdownOverlay: React.FC<{ countdownMs: number }> = ({ countdownMs }) => {
  const seconds = Math.max(1, Math.ceil(countdownMs / 1000));

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 z-[130] pointer-events-none">
      <p className="text-slate-300 uppercase font-black tracking-[0.3em] mb-4">Roles assigned -- get ready</p>
      <p
        key={seconds}
        className="text-[10rem] font-black text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.6)] animate-in zoom-in duration-300"
      >
        {seconds}
      </p>
    </div>
  );
};
