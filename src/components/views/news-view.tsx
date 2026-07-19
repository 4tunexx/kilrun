'use client';

import { useEffect, useState } from 'react';
import { Loader2, Newspaper } from 'lucide-react';
import { getNewsPosts } from '@/lib/social-actions';
import { NewsArticleDialog, type NewsArticle } from '@/components/news-article-dialog';
import { resolveNewsThumbnail } from '@/lib/news-thumbnail';
import { formatDistanceToNow } from 'date-fns';

const OPEN_NEWS_KEY = 'kilrun.openNewsId';

export default function NewsView() {
  const [posts, setPosts] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readingPost, setReadingPost] = useState<NewsArticle | null>(null);

  useEffect(() => {
    getNewsPosts()
      .then((list) => setPosts(list as NewsArticle[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const id = sessionStorage.getItem(OPEN_NEWS_KEY);
      if (id) {
        sessionStorage.removeItem(OPEN_NEWS_KEY);
        setReadingId(id);
        setReadingPost(null);
      }
    } catch {
      // ignore
    }
  }, []);

  const openArticle = (post: NewsArticle) => {
    setReadingPost(post);
    setReadingId(post.id);
  };

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
      {posts.map((post) => {
        const thumb = resolveNewsThumbnail(post.headerImageUrl, post.body);
        return (
          <button
            key={post.id}
            type="button"
            onClick={() => openArticle(post)}
            className="group flex w-full items-stretch gap-3 rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 text-left transition hover:border-primary/40 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {thumb ? (
              <div className="relative h-20 w-28 sm:h-24 sm:w-36 shrink-0 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900/80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb}
                  alt=""
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
              <p className="text-lg sm:text-xl font-bold truncate">{post.title}</p>
              <p className="text-sm text-slate-400 line-clamp-2">
                {formatDistanceToNow(new Date(post.createdAt))} ago
                {post.summary ? ` · ${post.summary}` : ''}
              </p>
              <span className="text-sm text-primary mt-1">Read article →</span>
            </div>
          </button>
        );
      })}

      <NewsArticleDialog
        open={!!readingId}
        onOpenChange={(open) => {
          if (!open) {
            setReadingId(null);
            setReadingPost(null);
          }
        }}
        postId={readingId}
        initialPost={readingPost}
      />
    </div>
  );
}
