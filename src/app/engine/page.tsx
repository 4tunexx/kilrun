import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { withPrismaRetry } from '@/lib/prisma';
import { isAdminRole, isStaffRole } from '@/lib/roles';
import { EngineApp } from '@/components/engine/engine-app';
import { Download, Monitor, Sparkles, Box, Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Kilrun Engine — Map Studio & Game Creator',
  description: 'Kilrun standalone map editor, player studio, and game-development platform.',
};

export default async function EnginePage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string }>;
}) {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;

  let user = null;
  if (steamId) {
    try {
      user = await withPrismaRetry((db) => db.user.findUnique({ where: { steamId } }));
    } catch (error) {
      console.error('[engine] failed to load user', error);
    }
  }

  const params = await searchParams;

  // Staff and admins get direct web engine access
  if (user && isStaffRole(user.role)) {
    return (
      <EngineApp
        user={{
          username: user.username,
          role: user.role,
          avatarUrl: user.avatarUrl,
        }}
        initialMapId={params.map}
      />
    );
  }

  // Non-staff or guest creators get the Kilrun Engine showcase & installer download hub
  return (
    <div className="min-h-screen bg-[#080b12] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow fx */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-bold uppercase tracking-widest">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Standalone Windows Engine
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-cyan-400">
          Kilrun Engine Studio
        </h1>

        <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          The official high-performance 3D map builder, player studio, and level authoring suite for Kilrun. Build maps 1,000&times; faster than traditional game engines with zero compilation wait, authoritative netcode parity, real-time CSG boolean carving, and 1-click cloud publishing.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Button
            asChild
            size="lg"
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8 shadow-lg shadow-cyan-600/30 text-base"
          >
            <a href="/api/engine/download" download="Kilrun-Engine-Setup.exe">
              <Download className="w-5 h-5 mr-2" /> Download Kilrun Engine Setup.exe
            </a>
          </Button>

          <Button asChild variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10 text-base">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Arcade Hub
            </Link>
          </Button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 text-left">
          <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur space-y-2">
            <Box className="w-6 h-6 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Real-time CSG &amp; Physics</h3>
            <p className="text-xs text-slate-400">
              Subtract doorways, carve tunnels, union solids, and test on the exact same authoritative physics loop.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur space-y-2">
            <Monitor className="w-6 h-6 text-emerald-400" />
            <h3 className="font-bold text-white text-sm">Instant Live Play Test</h3>
            <p className="text-xs text-slate-400">
              Press F5 anytime to test with full AAA HUD, weapons, movement abilities, and practice target dummies.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur space-y-2">
            <Shield className="w-6 h-6 text-purple-400" />
            <h3 className="font-bold text-white text-sm">1-Click Live Publishing</h3>
            <p className="text-xs text-slate-400">
              Push your creations straight to the live cloud platform for millions of players across Deathrun, Horde, and Competitive.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Native Windows 10/11 64-bit app &middot; DPAPI hardware-encrypted session &middot; Powered by Tauri 2 &amp; Three.js
        </p>
      </div>
    </div>
  );
}
