'use client';

import { useEffect, useState } from 'react';
import { Loader2, Newspaper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getNewsPosts } from '@/lib/social-actions';
import { formatDistanceToNow } from 'date-fns';

export default function NewsView() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getNewsPosts()
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading news...
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="text-slate-400 text-center py-12">
        No news yet. Staff can publish updates from the Admin panel.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold flex items-center gap-2 px-1">
        <Newspaper className="w-5 h-5" /> Latest news
      </h2>
      {posts.map((post) => (
        <Card key={post.id} className="bg-slate-800/40 border-slate-700/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg sm:text-xl">{post.title}</CardTitle>
            <CardDescription>
              {formatDistanceToNow(new Date(post.createdAt))} ago · {post.summary}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expandedId === post.id ? (
              <p className="text-slate-300 whitespace-pre-wrap mb-3">{post.body}</p>
            ) : null}
            <button
              className="text-sm text-primary hover:underline"
              onClick={() =>
                setExpandedId((id) => (id === post.id ? null : post.id))
              }
            >
              {expandedId === post.id ? 'Show less' : 'Read more'}
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
