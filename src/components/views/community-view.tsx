'use client';

import { Users, Rss, Newspaper } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DiscussionsView from './discussions-view';
import NewsView from './news-view';

export default function CommunityView() {
  return (
    <div className="px-4 sm:px-8 py-6">
      <h1 className="text-3xl sm:text-4xl font-black mb-6 flex items-center gap-3">
        <Users className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
        Community Hub
      </h1>
      <Tabs defaultValue="forums" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-800/60 p-1 mb-4">
          <TabsTrigger value="news" className="flex-none">
            <Newspaper className="w-4 h-4 mr-2" /> News
          </TabsTrigger>
          <TabsTrigger value="forums" className="flex-none">
            <Rss className="w-4 h-4 mr-2" /> Forums
          </TabsTrigger>
        </TabsList>
        <TabsContent value="news">
          <NewsView />
        </TabsContent>
        <TabsContent value="forums">
          <DiscussionsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
