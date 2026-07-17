'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getGuides } from '@/lib/social-actions';
import { formatDistanceToNow } from 'date-fns';

export default function GuidesView() {
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getGuides()
      .then(setGuides)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <h1 className="text-3xl sm:text-4xl font-black flex items-center gap-2">
        <BookOpen className="w-8 h-8" /> Guides
      </h1>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading guides...
        </div>
      ) : guides.length === 0 ? (
        <p className="text-slate-400 text-center py-12">
          No guides yet. Staff can publish from the Admin panel.
        </p>
      ) : (
        <div className="space-y-3">
          {guides.map((guide) => (
            <Card key={guide.id} className="bg-slate-800/40 border-slate-700/30">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg sm:text-xl">{guide.title}</CardTitle>
                  <Badge variant="outline" className="capitalize shrink-0">
                    {guide.category}
                  </Badge>
                </div>
                <CardDescription>
                  {formatDistanceToNow(new Date(guide.createdAt))} ago · {guide.summary}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {expandedId === guide.id ? (
                  <p className="text-slate-300 whitespace-pre-wrap mb-3">{guide.body}</p>
                ) : null}
                <button
                  className="text-sm text-primary hover:underline"
                  onClick={() =>
                    setExpandedId((id) => (id === guide.id ? null : guide.id))
                  }
                >
                  {expandedId === guide.id ? 'Show less' : 'Read guide'}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
