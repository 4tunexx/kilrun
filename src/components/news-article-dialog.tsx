'use client';

import { useEffect, useState } from 'react';
import { Loader2, Newspaper } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RichContent } from '@/components/ui/rich-content';
import { getNewsPost } from '@/lib/social-actions';
import { formatDistanceToNow } from 'date-fns';

export type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  body: string;
  headerImageUrl?: string | null;
  createdAt: Date | string;
  published?: boolean;
};

/** Full-article reader dialog used from the home dashboard and Community → News. */
export function NewsArticleDialog({
  open,
  onOpenChange,
  postId,
  initialPost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId?: string | null;
  /** When provided, skips a fetch (useful for admin preview / already-loaded lists). */
  initialPost?: NewsArticle | null;
}) {
  const [post, setPost] = useState<NewsArticle | null>(initialPost ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialPost) {
      setPost(initialPost);
      setError(null);
      setLoading(false);
      return;
    }
    if (!postId) {
      setPost(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getNewsPost(postId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setPost(null);
          setError('This article could not be found.');
          return;
        }
        setPost(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load article.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId, initialPost]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900/95 border-slate-700 text-white max-w-2xl mx-4 max-h-[85vh] overflow-y-auto p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading article…
          </div>
        ) : error || !post ? (
          <div className="p-8 text-center text-slate-400">{error ?? 'Article not found.'}</div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pb-2 space-y-2">
              <DialogTitle className="text-xl sm:text-2xl font-black flex items-start gap-2 text-left">
                <Newspaper className="h-5 w-5 text-primary shrink-0 mt-1" />
                <span>{post.title}</span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-left">
                {formatDistanceToNow(new Date(post.createdAt))} ago
                {post.summary ? ` · ${post.summary}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-6">
              <RichContent body={post.body} headerImageUrl={post.headerImageUrl} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
