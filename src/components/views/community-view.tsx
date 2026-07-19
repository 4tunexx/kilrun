'use client';

import { useEffect, useState } from 'react';
import { Rss, Newspaper } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DiscussionsView from './discussions-view';
import NewsView from './news-view';

const OPEN_NEWS_KEY = 'kilrun.openNewsId';

export default function CommunityView() {
  const [tab, setTab] = useState('forums');

  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPEN_NEWS_KEY)) {
        setTab('news');
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
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
