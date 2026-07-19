'use client';

import { Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Avatar with optional VIP crown badge matching hub branding. */
export function PlayerAvatar({
  src,
  name,
  isVip,
  className,
  crownClassName,
}: {
  src?: string | null;
  name: string;
  isVip?: boolean | null;
  className?: string;
  crownClassName?: string;
}) {
  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <Avatar className="h-full w-full">
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
}
