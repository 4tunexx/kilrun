import { HubLoadingState } from '@/components/ui/hub-loading-state';

export default function Loading() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.12),transparent_55%)]"
        aria-hidden="true"
      />
      <HubLoadingState
        label="Preparing your Kilrun hub"
        className="relative z-10 w-full max-w-xl p-6 sm:p-8"
      />
    </main>
  );
}
