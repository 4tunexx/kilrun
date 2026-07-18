'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  frameAnimationClass,
  frameWrapperStyle,
  normalizeFrameConfig,
  type FrameConfig,
} from '@/lib/cosmetics';
import { cn } from '@/lib/utils';

export function AvatarWithFrame({
  src,
  alt,
  fallback,
  frameConfig,
  className,
  sizeClass = 'h-24 w-24 sm:h-32 sm:w-32',
}: {
  src?: string | null;
  alt?: string;
  fallback?: string;
  frameConfig?: FrameConfig | null | unknown;
  className?: string;
  sizeClass?: string;
}) {
  const frame = frameConfig ? normalizeFrameConfig(frameConfig) : null;

  const avatar = (
    <Avatar className={cn(sizeClass, 'border-4 border-slate-900 shadow-2xl', className)}>
      <AvatarImage src={src ?? undefined} alt={alt ?? 'Player'} />
      <AvatarFallback>{fallback ?? '?'}</AvatarFallback>
    </Avatar>
  );

  if (!frame) return <div className="relative shrink-0">{avatar}</div>;

  return (
    <div
      className={cn(
        'relative shrink-0 inline-flex',
        frameAnimationClass(frame)
      )}
      style={frameWrapperStyle(frame)}
    >
      {avatar}
    </div>
  );
}
