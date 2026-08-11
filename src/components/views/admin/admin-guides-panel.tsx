'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { BookOpen, Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  adminCreateGuide,
  adminDeleteGuide,
  adminListGuides,
  adminUpdateGuide,
} from '@/lib/social-actions';
import { GUIDE_CATEGORIES, getGuideCategory } from '@/lib/guide-categories';
import { useToast } from '@/hooks/use-toast';

type GuideForm = {
  id: string | null;
  title: string;
  summary: string;
  body: string;
  category: string;
  published: boolean;
};

const EMPTY: GuideForm = {
  id: null,
  title: '',
  summary: '',
  body: '',
  category: GUIDE_CATEGORIES[0].id,
  published: true,
};

type ListedGuide = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  published: boolean;
  createdAt: Date;
};

export function AdminGuidesPanel() {
  const { toast } = useToast();
  const [guides, setGuides] = useState<ListedGuide[]>([]);
  const [form, setForm] = useState<GuideForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const reload = useCallback(async () => {
    const list = await adminListGuides();
    setGuides(list as ListedGuide[]);
  }, []);

  useEffect(() => {
    reload()
      .catch(() => toast({ title: 'Could not load guides', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [reload, toast]);

  const startNew = () => setForm(EMPTY);

  const loadGuide = (guide: ListedGuide) => {
    setForm({
      id: guide.id,
      title: guide.title,
      summary: guide.summary,
      body: guide.body,
      category: guide.category,
      published: guide.published,
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
        await adminUpdateGuide(form.id, {
          title: form.title,
          summary: form.summary,
          body: form.body,
          category: form.category,
          published,
        });
        toast({ title: published ? 'Guide updated & published' : 'Draft saved' });
      } else {
        const created = await adminCreateGuide({
          title: form.title,
          summary: form.summary,
          body: form.body,
          category: form.category,
          published,
        });
        setForm((f) => ({ ...f, id: created.id }));
        toast({ title: published ? 'Guide published' : 'Draft saved' });
      }
      await reload();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this guide permanently?')) return;
    setBusy(`delete-${id}`);
    try {
      await adminDeleteGuide(id);
      if (form.id === id) setForm(EMPTY);
      toast({ title: 'Guide deleted' });
      await reload();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'Delete failed', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading guides editor…
      </div>
    );
  }

  const visibleGuides = filter === 'all' ? guides : guides.filter((g) => g.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Guides editor
          </h3>
          <p className="text-sm text-slate-400">
            Pick a category, write the guide, and publish. Edit existing guides from the list below.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> New guide
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {form.id ? (
                <>
                  <Pencil className="h-4 w-4" /> Edit guide
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> New guide
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
              placeholder="Summary (shown in the guide list)"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="bg-slate-900/50 border-slate-700"
            />
            <Select
              value={form.category}
              onValueChange={(category) => setForm((f) => ({ ...f, category }))}
            >
              <SelectTrigger className="bg-slate-900/50 border-slate-700">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {GUIDE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Body (supports plain text / markdown-style line breaks)"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="bg-slate-900/50 border-slate-700 min-h-[200px]"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" disabled={busy !== null} onClick={() => save(true)}>
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
            <CardDescription>How players will see this guide.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
              <div className="p-4 border-b border-slate-700/40">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xl font-black">{form.title.trim() || 'Untitled guide'}</h4>
                  <Badge variant="outline" className={getGuideCategory(form.category).accent}>
                    {getGuideCategory(form.category).label}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Just now{form.summary.trim() ? ` · ${form.summary.trim()}` : ''}
                </p>
              </div>
              <div className="p-4 max-h-[24rem] overflow-y-auto whitespace-pre-wrap text-sm text-slate-300">
                {form.body.trim() || 'Preview appears here as you type.'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Existing guides ({guides.length})</CardTitle>
              <CardDescription>Click Edit to load into the editor above.</CardDescription>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-48 bg-slate-900/50 border-slate-700">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {GUIDE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleGuides.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No guides in this category yet.</p>
          ) : (
            visibleGuides.map((guide) => (
              <div
                key={guide.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  form.id === guide.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-slate-700/40 bg-slate-900/30'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{guide.title}</p>
                    <Badge variant="outline" className={`text-[10px] ${getGuideCategory(guide.category).accent}`}>
                      {getGuideCategory(guide.category).label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        guide.published
                          ? 'border-emerald-500/40 text-emerald-300 text-[10px]'
                          : 'border-amber-500/40 text-amber-300 text-[10px]'
                      }
                    >
                      {guide.published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {formatDistanceToNow(new Date(guide.createdAt))} ago
                    {guide.summary ? ` · ${guide.summary}` : ''}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => loadGuide(guide)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy === `delete-${guide.id}`}
                  onClick={() => remove(guide.id)}
                >
                  {busy === `delete-${guide.id}` ? (
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
