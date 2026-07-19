'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Loader2, Newspaper, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RichPostEditor } from '@/components/ui/rich-post-editor';
import { RichContent } from '@/components/ui/rich-content';
import {
  adminCreateNews,
  adminDeleteNews,
  adminListNewsPosts,
  adminUpdateNews,
} from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';

type NewsForm = {
  id: string | null;
  title: string;
  summary: string;
  body: string;
  headerImageUrl: string;
};

const EMPTY: NewsForm = {
  id: null,
  title: '',
  summary: '',
  body: '',
  headerImageUrl: '',
};

type ListedPost = {
  id: string;
  title: string;
  summary: string;
  body: string;
  headerImageUrl: string | null;
  published: boolean;
  createdAt: Date;
};

export function AdminNewsPanel() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<ListedPost[]>([]);
  const [form, setForm] = useState<NewsForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await adminListNewsPosts();
    setPosts(list as ListedPost[]);
  }, []);

  useEffect(() => {
    reload()
      .catch(() => toast({ title: 'Could not load news', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [reload, toast]);

  const startNew = () => setForm(EMPTY);

  const loadPost = (post: ListedPost) => {
    setForm({
      id: post.id,
      title: post.title,
      summary: post.summary,
      body: post.body,
      headerImageUrl: post.headerImageUrl ?? '',
    });
  };

  const save = async (published: boolean) => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    const key = published ? 'publish' : 'draft';
    setBusy(key);
    try {
      if (form.id) {
        await adminUpdateNews(form.id, {
          title: form.title,
          summary: form.summary,
          body: form.body,
          headerImageUrl: form.headerImageUrl || null,
          published,
        });
        toast({ title: published ? 'News updated & published' : 'Draft saved' });
      } else {
        const created = await adminCreateNews({
          title: form.title,
          summary: form.summary,
          body: form.body,
          headerImageUrl: form.headerImageUrl || undefined,
          published,
        });
        setForm((f) => ({ ...f, id: created.id }));
        toast({ title: published ? 'News published' : 'Draft saved' });
      }
      await reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Save failed', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this news post permanently?')) return;
    setBusy(`delete-${id}`);
    try {
      await adminDeleteNews(id);
      if (form.id === id) setForm(EMPTY);
      toast({ title: 'News deleted' });
      await reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Delete failed', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading news editor…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" /> News editor
          </h3>
          <p className="text-sm text-slate-400">
            Write on the left, preview live on the right. Edit existing posts from the list.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> New article
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {form.id ? (
                <>
                  <Pencil className="h-4 w-4" /> Edit article
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> New article
                </>
              )}
            </CardTitle>
            {form.id && (
              <CardDescription className="font-mono text-[11px]">ID: {form.id}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="bg-slate-900/50 border-slate-700"
            />
            <Input
              placeholder="Summary (shown on dashboard cards)"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="bg-slate-900/50 border-slate-700"
            />
            <RichPostEditor
              body={form.body}
              onBodyChange={(body) => setForm((f) => ({ ...f, body }))}
              headerImageUrl={form.headerImageUrl}
              onHeaderImageChange={(headerImageUrl) =>
                setForm((f) => ({ ...f, headerImageUrl }))
              }
              placeholder="Write the news article…"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => save(true)}
              >
                {busy === 'publish' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {form.id ? 'Save & publish' : 'Publish'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => save(false)}
              >
                {busy === 'draft' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save draft
              </Button>
              {form.id && (
                <Button type="button" variant="ghost" onClick={startNew}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/30 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-cyan-400" /> Live preview
            </CardTitle>
            <CardDescription>How players will see this article.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
              <div className="p-4 border-b border-slate-700/40">
                <h4 className="text-xl font-black">
                  {form.title.trim() || 'Untitled article'}
                </h4>
                <p className="text-sm text-slate-400 mt-1">
                  Just now
                  {form.summary.trim() ? ` · ${form.summary.trim()}` : ''}
                </p>
              </div>
              <div className="p-4 max-h-[28rem] overflow-y-auto">
                {form.body.trim() || form.headerImageUrl ? (
                  <RichContent
                    body={form.body || '_Start writing to preview…_'}
                    headerImageUrl={form.headerImageUrl || null}
                  />
                ) : (
                  <p className="text-slate-500 text-sm italic">
                    Preview appears here as you type.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Existing posts</CardTitle>
          <CardDescription>Click Edit to load into the editor above.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {posts.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No news posts yet.</p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                  form.id === post.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-slate-700/40 bg-slate-900/30'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{post.title}</p>
                    <Badge
                      variant="outline"
                      className={
                        post.published
                          ? 'border-emerald-500/40 text-emerald-300 text-[10px]'
                          : 'border-amber-500/40 text-amber-300 text-[10px]'
                      }
                    >
                      {post.published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {formatDistanceToNow(new Date(post.createdAt))} ago
                    {post.summary ? ` · ${post.summary}` : ''}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => loadPost(post)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy === `delete-${post.id}`}
                  onClick={() => remove(post.id)}
                >
                  {busy === `delete-${post.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
