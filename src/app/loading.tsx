import { HubLoadingState } from '@/components/ui/hub-loading-state';

export default function Loading() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.13),transparent_58%)]"
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/K2.png"
            alt=""
            className="h-10 w-10 object-contain drop-shadow-[0_0_16px_hsl(var(--primary)/0.35)]"
          />
          <span className="text-xl font-bold tracking-wide">KILRUN</span>
        </div>
        <HubLoadingState
          label="Preparing your Kilrun hub"
          description="Connecting your account and loading the latest platform data."
          className="w-full p-5 sm:p-6"
        />
      </div>
    </main>
  );
}
