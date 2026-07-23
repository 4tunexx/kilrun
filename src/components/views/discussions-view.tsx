'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquarePlus,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  createForumPost,
  createForumReply,
  getForumPosts,
  getForumReplies,
} from '@/lib/social-actions';
import { FORUM_CATEGORIES } from '@/lib/forum-categories';
import { UserHoverCard } from '@/components/user-hover-card';
import { RichPostEditor } from '@/components/ui/rich-post-editor';
import { RichContent } from '@/components/ui/rich-content';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function DiscussionsView() {
  const [posts, setPosts] = useState<Awaited<ReturnType<typeof getForumPosts>>>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [filter, setFilter] = useState<string>('all');
  const [openComposer, setOpenComposer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const { toast } = useToast();

  const reload = async () => {
    const data = await getForumPosts(60);
    setPosts(data);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return posts;
    return posts.filter((p) => p.category === filter);
  }, [posts, filter]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await createForumPost({ title, body, category });
      setTitle('');
      setBody('');
      setCategory('general');
      setOpenComposer(false);
      toast({ title: 'Discussion posted' });
      await reload();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not post';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl font-black">Forums</h1>
        <Button onClick={() => setOpenComposer((v) => !v)}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {openComposer ? 'Cancel' : 'New post'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          All
        </Button>
        {FORUM_CATEGORIES.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={filter === c.id ? 'default' : 'outline'}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {openComposer && (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="pt-6 space-y-3">
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-slate-900/50 border-slate-700"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-slate-900/50 border-slate-700">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {FORUM_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RichPostEditor
              body={body}
              onBodyChange={setBody}
              placeholder="Write your post — add images, video, headings…"
            />
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Publish
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading discussions...
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No posts yet. Be the first.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <Card key={post.id} className="bg-slate-800/40 border-slate-700/30">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg sm:text-xl">{post.title}</CardTitle>
                  <Badge variant="outline" className="capitalize shrink-0">
                    {post.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <RichContent body={post.body} />
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <PlayerAvatar
                    src={post.author.avatarUrl}
                    name={post.author.username}
                    isVip={post.author.isVip}
                    frameConfig={post.author.equippedFrameConfig}
                    className="h-6 w-6"
                    crownClassName="h-3.5 w-3.5 -top-0.5 -right-0.5"
                  />
                  <UserHoverCard
                    userId={post.author.id}
                    role={post.author.role}
                    isVip={post.author.isVip}
                    nicknameEffect={post.author.equippedNicknameConfig}
                  >
                    {post.author.username}
                  </UserHoverCard>
                  <span>·</span>
                  <span>
                    {formatDistanceToNow(new Date(post.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <span>·</span>
                  <span>{post._count?.replies ?? 0} replies</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400"
                  onClick={() =>
                    setExpandedPostId((id) => (id === post.id ? null : post.id))
                  }
                >
                  {expandedPostId === post.id ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-1" /> Hide replies
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-1" /> Replies
                    </>
                  )}
                </Button>
                {expandedPostId === post.id && (
                  <ThreadReplies postId={post.id} onPosted={reload} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadReplies({
  postId,
  onPosted,
}: {
  postId: string;
  onPosted: () => Promise<void>;
}) {
  const [replies, setReplies] = useState<Awaited<ReturnType<typeof getForumReplies>>>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getForumReplies(postId)
      .then(setReplies)
      .finally(() => setLoading(false));
  }, [postId]);

  const send = async () => {
    setSending(true);
    try {
      await createForumReply(postId, body);
      setBody('');
      const next = await getForumReplies(postId);
      setReplies(next);
      await onPosted();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Reply failed';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="text-slate-500 text-sm flex items-center gap-2 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading replies…
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-slate-700/40 pt-3">
      {replies.map((r) => (
        <div key={r.id} className="flex gap-2">
          <PlayerAvatar
            src={r.author.avatarUrl}
            name={r.author.username}
            isVip={r.author.isVip}
            frameConfig={r.author.equippedFrameConfig}
            className="h-7 w-7"
            crownClassName="h-3.5 w-3.5 -top-0.5 -right-0.5"
          />
          <div className="min-w-0 flex-1">
            <UserHoverCard
              userId={r.author.id}
              role={r.author.role}
              isVip={r.author.isVip}
              nicknameEffect={r.author.equippedNicknameConfig}
              className="text-sm font-medium"
            >
              {r.author.username}
            </UserHoverCard>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{r.body}</p>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          className="bg-slate-900/50 border-slate-700 min-h-[60px]"
        />
        <Button onClick={send} disabled={sending || !body.trim()} className="shrink-0">
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
