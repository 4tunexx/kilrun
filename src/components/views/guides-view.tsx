'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  Coins,
  Crosshair,
  Gamepad2,
  Gift,
  LifeBuoy,
  Loader2,
  Map as MapIcon,
  MessageSquare,
  PencilRuler,
  Rocket,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wind,
  Wrench,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getGuides } from '@/lib/social-actions';
import { GUIDE_CATEGORIES, getGuideCategory } from '@/lib/guide-categories';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket,
  ShieldCheck,
  Gamepad2,
  Wind,
  Map: MapIcon,
  Crosshair,
  Sparkles,
  Trophy,
  Users,
  Gift,
  Coins,
  BarChart3,
  CalendarClock,
  ShieldAlert,
  MessageSquare,
  PencilRuler,
  LifeBuoy,
  Wrench,
  BookOpen,
};

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? BookOpen;
  return <Icon className={className} />;
}

export default function GuidesView() {
  const [guides, setGuides] = useState<Awaited<ReturnType<typeof getGuides>>>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    getGuides()
      .then(setGuides)
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of guides) map.set(g.category, (map.get(g.category) ?? 0) + 1);
    return map;
  }, [guides]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guides.filter((g) => {
      const matchesCategory = category === 'all' || g.category === category;
      const matchesQuery =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.body.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [guides, category, query]);

  const categoriesWithGuides = GUIDE_CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) > 0);

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <div className="animate-in fade-in slide-in-from-top-2 duration-500 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-primary" /> Guides
        </h1>
        <p className="text-slate-400">
          Everything about Kilrun — the website and the game — in one place.
        </p>
      </div>

      <div className="relative animate-in fade-in slide-in-from-top-2 duration-500 delay-75">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides…"
          className="pl-9 pr-9 bg-slate-900/50 border-slate-700"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading guides...
        </div>
      ) : guides.length === 0 ? (
        <p className="text-slate-400 text-center py-12">
          No guides yet. Staff can publish from the Admin panel.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 animate-in fade-in duration-500 delay-100">
            <button
              onClick={() => setCategory('all')}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105',
                category === 'all'
                  ? 'bg-primary/20 border-primary/60 text-primary'
                  : 'bg-slate-900/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
              )}
            >
              <BookOpen className="w-3.5 h-3.5" /> All ({guides.length})
            </button>
            {categoriesWithGuides.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105',
                  category === c.id
                    ? cn('bg-slate-800/80', c.accent)
                    : 'bg-slate-900/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                )}
              >
                <CategoryIcon name={c.icon} className="w-3.5 h-3.5" /> {c.label} ({counts.get(c.id)})
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-slate-400 text-center py-12 animate-in fade-in duration-300">
              No guides match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((guide, i) => {
                const cat = getGuideCategory(guide.category);
                const isOpen = expandedId === guide.id;
                return (
                  <Card
                    key={guide.id}
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    className={cn(
                      'bg-slate-900/60 backdrop-blur-md border-slate-700/30 group transition-all duration-300',
                      'animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
                      'hover:border-slate-500/60 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5',
                      isOpen && 'md:col-span-2 xl:col-span-3 border-primary/50'
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CategoryIcon
                            name={cat.icon}
                            className={cn(
                              'w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-125',
                              cat.accent.split(' ')[0]
                            )}
                          />
                          {guide.title}
                        </CardTitle>
                        <Badge variant="outline" className={cn('shrink-0 text-[10px]', cat.accent)}>
                          {cat.label}
                        </Badge>
                      </div>
                      <CardDescription>
                        {formatDistanceToNow(new Date(guide.createdAt))} ago · {guide.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={cn(
                          'grid transition-all duration-300 ease-in-out',
                          isOpen ? 'grid-rows-[1fr] opacity-100 mb-3' : 'grid-rows-[0fr] opacity-0'
                        )}
                      >
                        <p className="text-slate-300 whitespace-pre-wrap overflow-hidden">
                          {guide.body}
                        </p>
                      </div>
                      <button
                        className="text-sm text-primary hover:underline transition-colors"
                        onClick={() => setExpandedId((id) => (id === guide.id ? null : guide.id))}
                      >
                        {isOpen ? 'Show less' : 'Read guide'}
                      </button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
