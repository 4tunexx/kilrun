'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquarePlus,
  Send,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  createForumPost,
  createForumReply,
  getForumPosts,
  getForumReplies,
} from '@/lib/social-actions';
import { UserHoverCard } from '@/components/user-hover-card';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function DiscussionsView() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [openComposer, setOpenComposer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const { toast } = useToast();

  const reload = async () => {
    const data = await getForumPosts();
    setPosts(data);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  const submit = async () => {
    setSubmitting(true);
    try {
      await createForumPost({ title, body });
      setTitle('');
      setBody('');
      setOpenComposer(false);
      toast({ title: 'Discussion posted' });
      await reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not post', variant: 'destructive' });
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

      {openComposer && (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="pt-6 space-y-3">
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-slate-900/50 border-slate-700"
            />
            <Textarea
              placeholder="Write your post..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="bg-slate-900/50 border-slate-700 min-h-[120px]"
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
      ) : posts.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No posts yet. Be the first.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
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
                <p className="text-slate-300 whitespace-pre-wrap">{post.body}</p>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={post.author.avatarUrl} />
                    <AvatarFallback>{post.author.username.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <UserHoverCard
                    userId={post.author.id}
                    role={post.author.role}
                    isVip={post.author.isVip}
                  >
                    {post.author.username}
                  </UserHoverCard>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
                  <span>·</span>
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    onClick={() =>
                      setExpandedPostId((cur) => (cur === post.id ? null : post.id))
                    }
                  >
                    {post._count.replies} replies
                    {expandedPostId === post.id ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {expandedPostId === post.id && (
                  <RepliesSection
                    postId={post.id}
                    onReplyPosted={() =>
                      setPosts((ps) =>
                        ps.map((p) =>
                          p.id === post.id
                            ? { ...p, _count: { replies: p._count.replies + 1 } }
                            : p
                        )
                      )
                    }
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RepliesSection({
  postId,
  onReplyPosted,
}: {
  postId: string;
  onReplyPosted: () => void;
}) {
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    getForumReplies(postId)
      .then((data) => {
        if (mounted) setReplies(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [postId]);

  const handleReply = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await createForumReply(postId, draft);
      setDraft('');
      onReplyPosted();
      const fresh = await getForumReplies(postId);
      setReplies(fresh);
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not reply', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-slate-700/40 pt-3 space-y-3">
      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading replies...
        </div>
      ) : replies.length === 0 ? (
        <p className="text-sm text-slate-500">No replies yet.</p>
      ) : (
        <div className="space-y-2">
          {replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2 text-sm">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarImage src={reply.author?.avatarUrl} />
                <AvatarFallback>{reply.author?.username?.charAt(0) ?? '?'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {reply.author && (
                    <UserHoverCard
                      userId={reply.author.id}
                      role={reply.author.role}
                      isVip={reply.author.isVip}
                      className="text-xs"
                    >
                      {reply.author.username}
                    </UserHoverCard>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-slate-300 break-words">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply..."
          className="bg-slate-900/50 border-slate-700 h-9"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleReply();
          }}
        />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleReply} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
