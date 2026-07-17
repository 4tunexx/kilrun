'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { createForumPost, getForumPosts } from '@/lib/social-actions';
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
    } catch {
      toast({ title: 'Could not post', variant: 'destructive' });
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
                  <UserHoverCard userId={post.author.id} className="text-slate-300">
                    {post.author.username}
                  </UserHoverCard>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
                  <span>·</span>
                  <span>{post._count.replies} replies</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
