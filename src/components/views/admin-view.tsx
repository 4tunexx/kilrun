'use client';

import {
  Shield,
  Users,
  FileText,
  LifeBuoy,
  Gamepad2,
  Search,
  MoreHorizontal,
  PlusCircle,
  BarChart,
  UserCheck,
  UserX,
  MessageSquare,
  Award,
  Trash2,
  PenSquare,
  Newspaper,
  CalendarCheck,
  Trophy,
  Upload,
  Image as ImageIcon,
  LayoutTemplate,
  ShoppingBag,
  DollarSign,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import AnimatedCounter from '../ui/animated-counter';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';
import Image from 'next/image';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


const users = [
  { id: '1', name: 'ShadowStriker', avatar: 'https://picsum.photos/seed/p1/80/80', rank: 'Immortal', level: 99, status: 'Online' },
  { id: '2', name: 'Vortex', avatar: 'https://picsum.photos/seed/p2/80/80', rank: 'Diamond III', level: 92, status: 'In-Game' },
  { id: '3', name: 'Phoenix', avatar: 'https://picsum.photos/seed/p3/80/80', rank: 'Diamond I', level: 88, status: 'Away' },
  { id: '4', name: 'Wraith', avatar: 'https://picsum.photos/seed/p4/80/80', rank: 'Platinum II', level: 85, status: 'Offline' },
];

const supportTickets = [
    { id: 'TKT-001', user: 'NewbiePlayer', subject: 'Cannot log in', status: 'Open', date: '2h ago' },
    { id: 'TKT-002', user: 'ProGamer', subject: 'Bug Report: Map Glitch on Abyss', status: 'In Progress', date: '5h ago' },
    { id: 'TKT-003', user: 'CasualGamer', subject: 'Question about VIP perks', status: 'Closed', date: '1d ago' },
];

const missions = [
    { id: 'M01', title: 'Play 5 Spike Rush Matches', type: 'Play Matches', requirement: '5', reward: '1,500 XP' },
    { id: 'M02', title: 'Get 20 Headshots', type: 'Get Kills', requirement: '20', reward: '1,000 XP' },
];

const achievements = [
    { id: 'A01', title: 'Season 1 Champion', description: 'Achieved the highest rank in Season 1.', icon: 'https://picsum.photos/seed/ach1/80/80' },
    { id: 'A02', title: 'Sharpshooter', description: 'Achieve a 75% headshot rate in a competitive match.', icon: 'https://picsum.photos/seed/ach2/80/80' },
];

const badges = [
    { id: 'B01', title: 'Beta Tester', description: 'Participated in the closed beta.', icon: 'https://picsum.photos/seed/b1/80/80' },
    { id: 'B02', title: 'Day One', description: 'Played on the official launch day.', icon: 'https://picsum.photos/seed/b2/80/80' },
];

const newsArticles = [
    { id: 'N01', title: 'New Map "Abyss" Released!', category: 'MAPS', date: '2 days ago' },
    { id: 'N02', title: 'Patch Notes v5.03', category: 'UPDATES', date: '4 days ago' },
];

const ranks = [
    { id: 'R01', name: 'Immortal', icon: 'https://picsum.photos/seed/r1/80/80', minXP: 90000 },
    { id: 'R02', name: 'Diamond', icon: 'https://picsum.photos/seed/r2/80/80', minXP: 80000 },
];

const shopItems = [
    { id: 'S01', name: 'Cyber Blade Skin', price: 1999, category: 'Weapon Skin', image: 'https://picsum.photos/seed/store1/400/400' },
    { id: 'S02', name: 'Neon Runner Pack', price: 2499, category: 'Bundle', image: 'https://picsum.photos/seed/store2/400/400' },
    { id: 'S03', name: 'Quantum Armor', price: 1499, category: 'Outfit', image: 'https://picsum.photos/seed/store3/400/400' },
    { id: 'S04', name: 'Holographic Emote', price: 599, category: 'Emote', image: 'https://picsum.photos/seed/store4/400/400' },
];

const salesData = [
    { name: 'Mon', sales: 400 }, { name: 'Tue', sales: 300 }, { name: 'Wed', sales: 600 }, { name: 'Thu', sales: 800 },
    { name: 'Fri', sales: 1500 }, { name: 'Sat', sales: 1200 }, { name: 'Sun', sales: 900 },
];


const AdminDashboard = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Online Players</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold"><AnimatedCounter end={3421} /></div>
        <p className="text-xs text-muted-foreground">+5% from last hour</p>
      </CardContent>
    </Card>
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Active Matches</CardTitle>
        <Gamepad2 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold"><AnimatedCounter end={450} /></div>
        <p className="text-xs text-muted-foreground">12 competitive games</p>
      </CardContent>
    </Card>
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Open Support Tickets</CardTitle>
        <LifeBuoy className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
        <div className="text-2xl font-bold"><AnimatedCounter end={12} /></div>
        <p className="text-xs text-muted-foreground">+2 new tickets today</p>
        </CardContent>
    </Card>
     <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
        <div className="text-2xl font-bold">$<AnimatedCounter end={45231} /></div>
        <p className="text-xs text-muted-foreground">+20.1% from last month</p>
        </CardContent>
    </Card>
    <Card className="md:col-span-2 lg:col-span-4 bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
            <CardTitle>Weekly Sales</CardTitle>
            <CardDescription>Revenue from in-game shop items this week.</CardDescription>
        </CardHeader>
        <CardContent className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={salesData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                    <XAxis dataKey="name" stroke="rgba(255, 255, 255, 0.5)"/>
                    <YAxis stroke="rgba(255, 255, 255, 0.5)" />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', border: '1px solid #475569' }} />
                    <Bar dataKey="sales" fill="#ef4444" name="Sales (USD)" />
                </RechartsBarChart>
            </ResponsiveContainer>
        </CardContent>
    </Card>
  </div>
);

const UserManagement = () => (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Search, view, and manage player accounts.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by username, email, or ID..." className="pl-9 bg-slate-900/50 border-slate-700" />
                </div>
                <Button>Search</Button>
            </div>
             <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-slate-800/20">
                <TableHead>Player</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead className="text-center">Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="border-slate-700/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{user.rank}</TableCell>
                  <TableCell className="text-center">{user.level}</TableCell>
                  <TableCell><Badge variant={user.status === 'Online' ? 'default' : 'secondary'}>{user.status}</Badge></TableCell>
                  <TableCell className="text-right">
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white">
                        <DropdownMenuItem className="cursor-pointer gap-2"><UserCheck /> View Profile</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer gap-2"><MessageSquare /> Send Message</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer gap-2"><Award /> Award Item</DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"><UserX /> Ban Player</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
    </Card>
);

const ContentManagement = () => {
    const missionTypes = [
      { value: 'game_kills_total', label: 'Get total kills', category: 'In-Game' },
      { value: 'game_kills_match', label: 'Get kills in a match', category: 'In-Game' },
      { value: 'game_headshots_total', label: 'Get total headshots', category: 'In-Game' },
      { value: 'game_headshots_match', label: 'Get headshots in a match', category: 'In-Game' },
      { value: 'game_win_rounds', label: 'Win rounds', category: 'In-Game' },
      { value: 'game_win_matches_comp', label: 'Win Competitive matches', category: 'In-Game' },
      { value: 'game_win_matches_unrated', label: 'Win Unrated matches', category: 'In-Game' },
      { value: 'game_play_matches_any', label: 'Play any matches', category: 'In-Game' },
      { value: 'game_plant_spike', label: 'Plant the Spike', category: 'In-Game' },
      { value: 'game_defuse_spike', label: 'Defuse the Spike', category: 'In-Game' },
      { value: 'game_use_ultimate', label: 'Use your Ultimate', category: 'In-Game' },
      { value: 'game_get_ace', label: 'Get an Ace', category: 'In-Game' },
      { value: 'game_get_clutch', label: 'Win a Clutch round', category: 'In-Game' },
      { value: 'game_get_first_blood', label: 'Get First Blood in a round', category: 'In-Game' },
      { value: 'progression_reach_level', label: 'Reach account level', category: 'Progression' },
      { value: 'progression_reach_rank', label: 'Reach a specific rank', category: 'Progression' },
      { value: 'progression_complete_season', label: 'Finish a season in a rank', category: 'Progression' },
      { value: 'progression_complete_dailies', label: 'Complete daily missions', category: 'Progression' },
      { value: 'progression_complete_weeklies', label: 'Complete weekly missions', category: 'Progression' },
      { value: 'progression_unlock_agent', label: 'Unlock an agent', category: 'Progression' },
      { value: 'economy_purchase_item', label: 'Purchase an item from the store', category: 'Economy' },
      { value: 'economy_own_skins', label: 'Own a number of weapon skins', category: 'Economy' },
      { value: 'economy_spend_vp', label: 'Spend Valorant Points (VP)', category: 'Economy' },
      { value: 'economy_spend_credits_match', label: 'Spend credits in a match', category: 'Economy' },
      { value: 'economy_buy_battle_pass', label: 'Purchase a Battle Pass', category: 'Economy' },
      { value: 'social_add_friends', label: 'Add friends', category: 'Social' },
      { value: 'social_join_clan', label: 'Join a Clan', category: 'Social' },
      { value: 'social_play_in_party', label: 'Play in a full party', category: 'Social' },
      { value: 'social_receive_commendations', label: 'Receive commendations', category: 'Social' },
      { value: 'social_send_message', label: 'Send a message', category: 'Social' },
      { value: 'meta_login_consecutive', label: 'Login for consecutive days', category: 'Website & Launcher' },
      { value: 'meta_post_forum', label: 'Create a forum post', category: 'Website & Launcher' },
      { value: 'meta_comment_guide', label: 'Comment on a guide', category: 'Website & Launcher' },
      { value: 'meta_update_profile', label: 'Customize your profile bio', category: 'Website & Launcher' },
      { value: 'meta_watch_esports', label: 'Watch a live esports match', category: 'Website & Launcher' },
      { value: 'event_participate', label: 'Participate in a special event', category: 'Special Events' },
      { value: 'event_complete_challenge', label: 'Complete an event challenge', category: 'Special Events' },
      { value: 'event_collect_item', label: 'Collect a limited-time event item', category: 'Special Events' },
      { value: 'event_win_mode', label: 'Win in a limited-time game mode', category: 'Special Events' },
    ];
    const categories = [...new Set(missionTypes.map(m => m.category))];

    return (
    <Tabs defaultValue="missions" orientation="vertical">
        <div className="grid grid-cols-5 gap-6">
            <div className="col-span-1">
                <TabsList className="flex-col h-auto items-stretch bg-slate-800/60">
                    <TabsTrigger value="missions" className="justify-start gap-2"><CalendarCheck /> Missions</TabsTrigger>
                    <TabsTrigger value="achievements" className="justify-start gap-2"><Trophy /> Achievements</TabsTrigger>
                    <TabsTrigger value="badges" className="justify-start gap-2"><Award /> Badges</TabsTrigger>
                    <TabsTrigger value="news" className="justify-start gap-2"><Newspaper /> News</TabsTrigger>
                    <TabsTrigger value="ranks" className="justify-start gap-2"><BarChart /> Ranks</TabsTrigger>
                </TabsList>
            </div>
            <div className="col-span-4">
                <TabsContent value="missions" className="mt-0">
                    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                        <CardHeader><CardTitle>Manage Missions</CardTitle></CardHeader>
                        <CardContent>
                            <div className="mb-6 space-y-4 p-4 border border-slate-700/50 rounded-lg">
                                <h3 className="font-semibold text-lg">Create New Mission</h3>
                                <div className="space-y-2">
                                    <Label htmlFor="mission-title">Title</Label>
                                    <Input id="mission-title" placeholder="Mission Title" className="bg-slate-900/50 border-slate-700" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select>
                                      <SelectTrigger className="bg-slate-900/50 border-slate-700"><SelectValue placeholder="Select type..." /></SelectTrigger>
                                      <SelectContent>
                                        {categories.map(category => (
                                            <SelectGroup key={category}>
                                                <SelectLabel>{category}</SelectLabel>
                                                {missionTypes.filter(m => m.category === category).map(mission => (
                                                    <SelectItem key={mission.value} value={mission.value}>
                                                        {mission.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                   <div className="space-y-2">
                                    <Label htmlFor="mission-req">Quantity / Target</Label>
                                    <Input id="mission-req" type="number" placeholder="e.g., 5 or 5000" className="bg-slate-900/50 border-slate-700" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mission-reward">Reward</Label>
                                    <Input id="mission-reward" placeholder="e.g., 1500 XP" className="bg-slate-900/50 border-slate-700" />
                                </div>
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Mission</Button>
                            </div>
                             <h3 className="font-semibold text-lg mb-4">Existing Missions</h3>
                            <Table>
                                <TableHeader><TableRow className="border-slate-700/50 hover:bg-slate-800/20"><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Reward</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>{missions.map(m => <TableRow key={m.id} className="border-slate-700/50"><TableCell>{m.title}</TableCell><TableCell>{m.type}</TableCell><TableCell>{m.reward}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon"><PenSquare size={16}/></Button><Button variant="ghost" size="icon"><Trash2 size={16}/></Button></TableCell></TableRow>)}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="achievements" className="mt-0">
                    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                        <CardHeader><CardTitle>Manage Achievements</CardTitle></CardHeader>
                        <CardContent>
                            <div className="mb-6 space-y-4 p-4 border border-slate-700/50 rounded-lg">
                                <h3 className="font-semibold text-lg">Create New Achievement</h3>
                                <div className="space-y-2"><Label htmlFor="ach-title">Title</Label><Input id="ach-title" placeholder="Achievement Title" className="bg-slate-900/50 border-slate-700" /></div>
                                <div className="space-y-2"><Label htmlFor="ach-desc">Description</Label><Textarea id="ach-desc" placeholder="Achievement Description" className="bg-slate-900/50 border-slate-700" /></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select>
                                      <SelectTrigger className="bg-slate-900/50 border-slate-700"><SelectValue placeholder="Select type..." /></SelectTrigger>
                                      <SelectContent>
                                        {categories.map(category => (
                                            <SelectGroup key={category}>
                                                <SelectLabel>{category}</SelectLabel>
                                                {missionTypes.filter(m => m.category === category).map(mission => (
                                                    <SelectItem key={mission.value} value={mission.value}>
                                                        {mission.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                   <div className="space-y-2">
                                    <Label htmlFor="ach-req">Quantity / Target</Label>
                                    <Input id="ach-req" type="number" placeholder="e.g., 5 or 5000" className="bg-slate-900/50 border-slate-700" />
                                  </div>
                                </div>
                                <div className="space-y-2"><Label htmlFor="ach-icon">Icon</Label><Input id="ach-icon" type="file" className="bg-slate-900/50 border-slate-700" /></div>
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Achievement</Button>
                            </div>
                            <h3 className="font-semibold text-lg mb-4">Existing Achievements</h3>
                            <Table>
                               <TableHeader><TableRow className="border-slate-700/50 hover:bg-slate-800/20"><TableHead>Icon</TableHead><TableHead>Title</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                               <TableBody>{achievements.map(a => <TableRow key={a.id} className="border-slate-700/50"><TableCell><Avatar><AvatarImage src={a.icon} /></Avatar></TableCell><TableCell>{a.title}</TableCell><TableCell>{a.description}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon"><PenSquare size={16}/></Button><Button variant="ghost" size="icon"><Trash2 size={16}/></Button></TableCell></TableRow>)}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="badges" className="mt-0">
                    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                        <CardHeader><CardTitle>Manage Badges</CardTitle></CardHeader>
                        <CardContent>
                            <div className="mb-6 space-y-4 p-4 border border-slate-700/50 rounded-lg">
                                <h3 className="font-semibold text-lg">Create New Badge</h3>
                                <div className="space-y-2"><Label htmlFor="badge-title">Title</Label><Input id="badge-title" placeholder="Badge Title" className="bg-slate-900/50 border-slate-700" /></div>
                                <div className="space-y-2"><Label htmlFor="badge-desc">Description</Label><Textarea id="badge-desc" placeholder="Badge Description" className="bg-slate-900/50 border-slate-700" /></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select>
                                      <SelectTrigger className="bg-slate-900/50 border-slate-700"><SelectValue placeholder="Select type..." /></SelectTrigger>
                                      <SelectContent>
                                        {categories.map(category => (
                                            <SelectGroup key={category}>
                                                <SelectLabel>{category}</SelectLabel>
                                                {missionTypes.filter(m => m.category === category).map(mission => (
                                                    <SelectItem key={mission.value} value={mission.value}>
                                                        {mission.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                   <div className="space-y-2">
                                    <Label htmlFor="badge-req">Quantity / Target</Label>
                                    <Input id="badge-req" type="number" placeholder="e.g., 5 or 5000" className="bg-slate-900/50 border-slate-700" />
                                  </div>
                                </div>
                                <div className="space-y-2"><Label htmlFor="badge-icon">Icon</Label><Input id="badge-icon" type="file" className="bg-slate-900/50 border-slate-700" /></div>
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Badge</Button>
                            </div>
                            <h3 className="font-semibold text-lg mb-4">Existing Badges</h3>
                            <Table>
                               <TableHeader><TableRow className="border-slate-700/50 hover:bg-slate-800/20"><TableHead>Icon</TableHead><TableHead>Title</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                               <TableBody>{badges.map(b => <TableRow key={b.id} className="border-slate-700/50"><TableCell><Avatar><AvatarImage src={b.icon} /></Avatar></TableCell><TableCell>{b.title}</TableCell><TableCell>{b.description}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon"><PenSquare size={16}/></Button><Button variant="ghost" size="icon"><Trash2 size={16}/></Button></TableCell></TableRow>)}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="news" className="mt-0">
                    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                         <CardHeader><CardTitle>Manage News</CardTitle></CardHeader>
                         <CardContent>
                            <div className="mb-6 space-y-4 p-4 border border-slate-700/50 rounded-lg">
                                <h3 className="font-semibold text-lg">Create News Article</h3>
                                <div className="space-y-2"><Label htmlFor="news-title">Title</Label><Input id="news-title" placeholder="Article Title" className="bg-slate-900/50 border-slate-700"/></div>
                                <div className="space-y-2"><Label htmlFor="news-cat">Category</Label><Input id="news-cat" placeholder="e.g., UPDATES" className="bg-slate-900/50 border-slate-700"/></div>
                                <div className="space-y-2"><Label htmlFor="news-content">Content</Label><Textarea id="news-content" placeholder="Article Content..." className="bg-slate-900/50 border-slate-700 min-h-[150px]"/></div>
                                <div className="space-y-2"><Label htmlFor="news-img">Header Image</Label><Input id="news-img" type="file" className="bg-slate-900/50 border-slate-700" /></div>
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Publish Article</Button>
                            </div>
                            <h3 className="font-semibold text-lg mb-4">Existing Articles</h3>
                            <Table>
                               <TableHeader><TableRow className="border-slate-700/50 hover:bg-slate-800/20"><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                               <TableBody>{newsArticles.map(n => <TableRow key={n.id} className="border-slate-700/50"><TableCell>{n.title}</TableCell><TableCell>{n.category}</TableCell><TableCell>{n.date}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon"><PenSquare size={16}/></Button><Button variant="ghost" size="icon"><Trash2 size={16}/></Button></TableCell></TableRow>)}</TableBody>
                            </Table>
                         </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="ranks" className="mt-0">
                    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                        <CardHeader><CardTitle>Manage Ranks</CardTitle></CardHeader>
                        <CardContent>
                            <div className="mb-6 space-y-4 p-4 border border-slate-700/50 rounded-lg">
                                <h3 className="font-semibold text-lg">Create New Rank</h3>
                                <div className="space-y-2"><Label htmlFor="rank-name">Rank Name</Label><Input id="rank-name" placeholder="e.g., Bronze" className="bg-slate-900/50 border-slate-700"/></div>
                                <div className="space-y-2"><Label htmlFor="rank-xp">Minimum XP</Label><Input id="rank-xp" type="number" placeholder="e.g., 10000" className="bg-slate-900/50 border-slate-700"/></div>
                                <div className="space-y-2"><Label htmlFor="rank-icon">Rank Icon</Label><Input id="rank-icon" type="file" className="bg-slate-900/50 border-slate-700" /></div>
                                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Rank</Button>
                            </div>
                            <h3 className="font-semibold text-lg mb-4">Existing Ranks</h3>
                            <Table>
                               <TableHeader><TableRow className="border-slate-700/50 hover:bg-slate-800/20"><TableHead>Icon</TableHead><TableHead>Name</TableHead><TableHead>Minimum XP</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                               <TableBody>{ranks.map(r => <TableRow key={r.id} className="border-slate-700/50"><TableCell><Avatar><AvatarImage src={r.icon} /></Avatar></TableCell><TableCell>{r.name}</TableCell><TableCell>{r.minXP.toLocaleString()}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon"><PenSquare size={16}/></Button><Button variant="ghost" size="icon"><Trash2 size={16}/></Button></TableCell></TableRow>)}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </div>
        </div>
    </Tabs>
)};

const SiteManagement = () => (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
            <CardTitle>Site Management</CardTitle>
            <CardDescription>Control the content of the public landing page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
            <div className="space-y-4 p-4 border border-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-lg">Header Content</h3>
                 <div className="space-y-2">
                    <Label htmlFor="main-title">Main Title</Label>
                    <Input id="main-title" defaultValue="Welcome to Kilrun" className="bg-slate-900/50 border-slate-700"/>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="sub-title">Subtitle</Label>
                    <Input id="sub-title" defaultValue="The ultimate deathrun experience. Compete, conquer, and climb the ranks." className="bg-slate-900/50 border-slate-700"/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="logo-upload">Logo</Label>
                    <div className="flex items-center gap-4">
                        <Avatar><AvatarImage src="https://picsum.photos/seed/logo/80/80" /></Avatar>
                        <Input id="logo-upload" type="file" className="bg-slate-900/50 border-slate-700"/>
                    </div>
                </div>
                 <Button><PenSquare className="mr-2 h-4 w-4" /> Update Header</Button>
            </div>

            <div className="space-y-4 p-4 border border-slate-700/50 rounded-lg">
                 <h3 className="font-semibold text-lg">Banner Management</h3>
                 <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="relative group">
                        <Image src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80" width={400} height={200} alt="Banner 1" className="rounded-md" />
                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100"><Trash2 size={16} /></Button>
                    </div>
                     <div className="relative group">
                        <Image src="https://picsum.photos/seed/slide2/400/200" width={400} height={200} alt="Banner 2" className="rounded-md" />
                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100"><Trash2 size={16} /></Button>
                    </div>
                    <div className="flex items-center justify-center border-2 border-dashed border-slate-700 rounded-md">
                        <Button variant="outline" className="flex-col h-full w-full">
                            <PlusCircle className="h-8 w-8 mb-2"/>
                            Add Banner
                        </Button>
                    </div>
                 </div>
            </div>
        </CardContent>
    </Card>
);

const SupportTickets = () => (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
            <CardTitle>Support Tickets</CardTitle>
            <CardDescription>View and respond to player support requests.</CardDescription>
        </CardHeader>
        <CardContent>
             <Table>
                <TableHeader>
                <TableRow className="border-slate-700/50 hover:bg-slate-800/20">
                    <TableHead>Ticket ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {supportTickets.map((ticket) => (
                    <TableRow key={ticket.id} className="border-slate-700/50">
                        <TableCell className="font-mono">{ticket.id}</TableCell>
                        <TableCell>{ticket.user}</TableCell>
                        <TableCell className="font-medium">{ticket.subject}</TableCell>
                        <TableCell><Badge variant={ticket.status === 'Open' ? 'destructive' : 'secondary'}>{ticket.status}</Badge></TableCell>
                        <TableCell>{ticket.date}</TableCell>
                        <TableCell className="text-right">
                            <Button variant="outline" size="sm">View Ticket</Button>
                        </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
);

const ShopManagement = () => (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
            <CardTitle>Shop Management</CardTitle>
            <CardDescription>Add, edit, or remove items from the in-game store.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="mb-8 space-y-4 p-4 border border-slate-700/50 rounded-lg">
                <h3 className="font-semibold text-lg">Create New Item</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="item-name">Item Name</Label>
                        <Input id="item-name" placeholder="e.g., Cyber Blade Skin" className="bg-slate-900/50 border-slate-700" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="item-price">Price (VP)</Label>
                        <Input id="item-price" type="number" placeholder="e.g., 1999" className="bg-slate-900/50 border-slate-700" />
                    </div>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="item-category">Category</Label>
                        <Input id="item-category" placeholder="e.g., Weapon Skin" className="bg-slate-900/50 border-slate-700" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="item-image">Item Image</Label>
                        <Input id="item-image" type="file" className="bg-slate-900/50 border-slate-700" />
                    </div>
                </div>
                <Button><PlusCircle className="mr-2 h-4 w-4" /> Add Item to Store</Button>
            </div>

            <h3 className="font-semibold text-lg mb-4">Existing Shop Items</h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {shopItems.map((item) => (
                <Card key={item.id} className="bg-slate-900/60 border-slate-700/50 group flex flex-col">
                    <CardContent className="p-0 w-full">
                    <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
                        <Image src={item.image} alt={item.name} fill className="object-cover" />
                    </div>
                    <div className="p-4 w-full flex-1 flex flex-col">
                        <p className="text-xs text-slate-400 uppercase">{item.category}</p>
                        <h3 className="font-bold text-lg truncate">{item.name}</h3>
                        <div className="flex items-center justify-between mt-auto pt-2">
                        <p className="font-bold text-yellow-400">{item.price} VP</p>
                        <div className="flex">
                            <Button variant="ghost" size="icon" className="h-8 w-8"><PenSquare size={16}/></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-400"><Trash2 size={16}/></Button>
                        </div>
                        </div>
                    </div>
                    </CardContent>
                </Card>
                ))}
            </div>
        </CardContent>
    </Card>
);


export default function AdminView() {
  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <Shield className="w-12 h-12 text-primary" />
        Admin Panel
      </h1>
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-6 bg-slate-800/60 mb-6">
          <TabsTrigger value="dashboard"><BarChart className="w-4 h-4 mr-2" /> Dashboard</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-2" /> Users</TabsTrigger>
          <TabsTrigger value="content"><FileText className="w-4 h-4 mr-2" /> Content</TabsTrigger>
          <TabsTrigger value="shop"><ShoppingBag className="w-4 h-4 mr-2" /> Shop</TabsTrigger>
          <TabsTrigger value="site-management"><LayoutTemplate className="w-4 h-4 mr-2" /> Site</TabsTrigger>
          <TabsTrigger value="support"><LifeBuoy className="w-4 h-4 mr-2" /> Support</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <AdminDashboard />
        </TabsContent>
        <TabsContent value="users">
          <UserManagement />
        </TabsContent>
        <TabsContent value="content">
            <ContentManagement />
        </TabsContent>
        <TabsContent value="shop">
            <ShopManagement />
        </TabsContent>
        <TabsContent value="site-management">
            <SiteManagement />
        </TabsContent>
        <TabsContent value="support">
            <SupportTickets />
        </TabsContent>
      </Tabs>
    </div>
  );
}
