import { AlertTriangle, Loader2 } from 'lucide-react';

export function HubLoadingState({
  label = 'Loading',
  description,
  className = '',
  compact = false,
}: {
  label?: string;
  description?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section
      role="status"
      aria-label={label}
      data-compact={compact}
      className={`hub-loading-state hub-glass-panel border shadow-lg shadow-black/20 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="hub-loading-indicator relative flex h-10 w-10 shrink-0 items-center justify-center border border-primary/30 bg-primary/10">
          <span className="absolute inset-0 motion-safe:animate-ping border border-primary/25" aria-hidden="true" />
          <Loader2 className="h-5 w-5 motion-safe:animate-spin text-primary" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{label}</span>
          {description && (
            <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
          )}
        </span>
        {compact && (
          <span className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-hidden="true">
            <span className="h-1.5 w-1.5 motion-safe:animate-pulse bg-primary" />
            <span className="h-1.5 w-1.5 motion-safe:animate-pulse bg-primary/60 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 motion-safe:animate-pulse bg-primary/30 [animation-delay:300ms]" />
          </span>
        )}
      </div>
      {!compact && (
        <div className="hub-loading-track mt-5" aria-hidden="true">
          <span className="hub-loading-progress" />
        </div>
      )}
      <span className="sr-only">Please wait while Kilrun loads this section.</span>
    </section>
  );
}

export function HubLoadErrorState({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={`hub-glass-panel border border-amber-400/30 shadow-lg shadow-black/20 ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
        <div>
          <p className="font-semibold text-slate-100">Could not load {label}</p>
          <p className="mt-1 text-sm text-slate-400">
            Check your connection and refresh the page to try again.
          </p>
        </div>
      </div>
    </section>
  );
}
