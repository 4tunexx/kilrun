'use client';

import { Users, Shield, Calendar, Rss, Newspaper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DiscussionsView from './discussions-view';
import { Button } from '../ui/button';
import Image from 'next/image';
import NewsView from './news-view';

const clans = [
  { name: 'Alpha Wolves', members: 48, rank: 'Diamond', image: 'https://picsum.photos/seed/c1/200/200', hint: 'wolf logo' },
  { name: 'Shadow Dragons', members: 35, rank: 'Platinum', image: 'https://picsum.photos/seed/c2/200/200', hint: 'dragon logo' },
  { name: 'Viper Squad', members: 50, rank: 'Diamond', image: 'https://picsum.photos/seed/c3/200/200', hint: 'snake logo' },
];

const events = [
  { name: 'Summer Skirmish', prize: '$10,000', date: 'July 20-22', image: 'https://picsum.photos/seed/e1/400/200', hint: 'esports tournament' },
  { name: 'Community Cup #12', prize: '50,000 VP', date: 'This Saturday', image: 'https://picsum.photos/seed/e2/400/200', hint: 'game trophy' },
];

export default function CommunityView() {
  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4"><Users className="w-12 h-12 text-blue-400" />Community Hub</h1>
      <Tabs defaultValue="forums" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800/60 mb-6">
          <TabsTrigger value="news"><Newspaper className="w-4 h-4 mr-2" /> News</TabsTrigger>
          <TabsTrigger value="forums"><Rss className="w-4 h-4 mr-2" /> Forums</TabsTrigger>
          <TabsTrigger value="clans"><Shield className="w-4 h-4 mr-2" /> Clans</TabsTrigger>
          <TabsTrigger value="events"><Calendar className="w-4 h-4 mr-2" /> Events</TabsTrigger>
        </TabsList>
        <TabsContent value="news">
          <NewsView />
        </TabsContent>
        <TabsContent value="forums">
          <DiscussionsView />
        </TabsContent>
        <TabsContent value="clans">
           <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Top Clans</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {clans.map((clan, i) => (
                <Card key={i} className="bg-slate-900/50 p-4 flex flex-col items-center text-center border-slate-700/50 hover:border-primary/50 transition-colors">
                  <Image src={clan.image} alt={clan.name} width={80} height={80} className="rounded-full mb-4 border-2 border-slate-600" data-ai-hint={clan.hint} />
                  <h3 className="text-xl font-bold">{clan.name}</h3>
                  <p className="text-slate-400">{clan.members}/50 Members</p>
                  <p className="font-bold text-yellow-400 mt-2">{clan.rank} Tier</p>
                  <Button variant="outline" size="sm" className="mt-4">View Clan</Button>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="events">
           <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {events.map((event, i) => (
                 <div key={i} className="flex gap-4 group p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                  <div className="w-48 h-24 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={event.image}
                      alt={event.name}
                      width={192}
                      height={96}
                      className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                      data-ai-hint={event.hint}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">{event.date}</p>
                    <h4 className="font-bold text-2xl mb-1 group-hover:text-primary/90 transition-colors">
                      {event.name}
                    </h4>
                    <p className="text-lg text-yellow-400 font-bold">
                      Prize Pool: {event.prize}
                    </p>
                  </div>
                  <Button className="ml-auto self-center">Register Now</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}