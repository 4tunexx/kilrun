'use client';

import { Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  frameAnimationClass,
  frameWrapperStyle,
  normalizeFrameConfig,
} from '@/lib/cosmetics';
import { cn } from '@/lib/utils';

/** Avatar with optional VIP crown + equipped store frame. */
export function PlayerAvatar({
  src,
  name,
  isVip,
  frameConfig,
  className,
  crownClassName,
  borderClassName = 'border-2 border-slate-900',
}: {
  src?: string | null;
  name: string;
  isVip?: boolean | null;
  frameConfig?: unknown | null;
  className?: string;
  crownClassName?: string;
  borderClassName?: string;
}) {
  const frame = frameConfig ? normalizeFrameConfig(frameConfig) : null;

  const avatar = (
    <div className={cn('relative inline-flex shrink-0 h-full w-full', !frame && className)}>
      <Avatar className={cn('h-full w-full', borderClassName)}>
        <AvatarImage src={src || undefined} alt={name} />
        <AvatarFallback>{name?.charAt(0) || '?'}</AvatarFallback>
      </Avatar>
      {isVip ? (
        <span
          className={cn(
            'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-black shadow-md ring-2 ring-slate-900',
            crownClassName
          )}
          title="VIP"
        >
          <Crown className="h-3 w-3 fill-current" />
        </span>
      ) : null}
    </div>
  );

  if (!frame) return avatar;

  return (
    <div
      className={cn(
        'relative shrink-0 inline-flex h-full w-full',
        frameAnimationClass(frame),
        className
      )}
      style={frameWrapperStyle(frame)}
    >
      {avatar}
    </div>
  );
}
