import { MessageSquare, Eye, Send, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

const forumPosts = [
  { title: 'New Meta Strategy Discussion', author: 'ProPlayer', avatar: 'https://picsum.photos/seed/f1/40/40', replies: 234, views: 1842 },
  { title: 'Best Loadout for Season 5', author: 'TacticGuru', avatar: 'https://picsum.photos/seed/f2/40/40', replies: 156, views: 2341 },
  { title: 'Upcoming Patch Notes Leak', author: 'Insider', avatar: 'https://picsum.photos/seed/f3/40/40', replies: 567, views: 8932 },
  { title: 'Team Formation Thread', author: 'Captain', avatar: 'https://picsum.photos/seed/f4/40/40', replies: 89, views: 645 },
];

export default function DiscussionsView() {
  return (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardContent className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4">Start a New Discussion</h2>
          <div className="flex items-start gap-4">
             <Avatar>
                <AvatarImage src="https://picsum.photos/seed/avatar/40/40" />
                <AvatarFallback>U</AvatarFallback>
            </Avatar>
            <div className="w-full space-y-2">
              <Textarea placeholder="What's on your mind?" className="bg-slate-900/50 border-slate-700 min-h-[80px]" />
              <Button>
                <Send className="w-4 h-4 mr-2" />
                Post Discussion
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-2xl font-bold pb-2 border-b border-slate-700/50">Latest Discussions</h2>
          {forumPosts.map((post, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-lg hover:bg-slate-900/50 transition-colors cursor-pointer group">
              <Avatar>
                <AvatarImage src={post.avatar} alt={post.author} />
                <AvatarFallback>{post.author.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{post.title}</h3>
                <p className="text-sm text-slate-400">by {post.author}</p>
              </div>
              <div className="flex gap-6 text-sm text-slate-400 text-center">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} />
                  <span>{post.replies}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye size={16} />
                  <span>{post.views}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
