import { AlertTriangle, Loader2 } from 'lucide-react';

export function HubLoadingState({
  label = 'Loading',
  className = '',
  compact = false,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section
      role="status"
      aria-label={label}
      className={`hub-glass-panel border shadow-lg shadow-black/20 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span className="absolute inset-0 motion-safe:animate-ping border border-primary/30" aria-hidden="true" />
          <Loader2 className="h-5 w-5 motion-safe:animate-spin text-primary" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-slate-200">{label}</span>
      </div>
      {compact ? (
        <span className="hub-loading-shimmer ml-auto h-2 w-20 border border-white/5" aria-hidden="true" />
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-hidden="true">
          <span className="hub-loading-shimmer h-16 border border-white/5" />
          <span className="hub-loading-shimmer h-16 border border-white/5" />
          <span className="hub-loading-shimmer h-16 border border-white/5" />
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
