import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  User,
  Save,
  Bell,
  Lock,
  Trophy,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { getMatchStats, getSessionUser, getStatsSummary, type StatsSummary } from '@/lib/actions';
import type { MatchStat, User as UserModel } from '@/generated/prisma';

export default function ProfileView({ userId }: { userId: string }) {
  const [user, setUser] = useState<UserModel | null>(null);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [history, setHistory] = useState<MatchStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getSessionUser(), getStatsSummary(userId), getMatchStats(userId, 5)]).then(
      ([u, s, h]) => {
        if (!isMounted) return;
        setUser(u);
        setSummary(s);
        setHistory(h);
        setIsLoading(false);
      }
    );
    return () => {
      isMounted = false;
    };
  }, [userId]);

  return (
    <div className="px-12 py-8">
      <div className="flex items-center gap-6 mb-8">
        <div className="relative">
          <Avatar className="h-32 w-32 border-4 border-primary">
            <AvatarImage
              src={user?.avatarUrl}
              alt={user?.username ?? 'Player avatar'}
            />
            <AvatarFallback>{user?.username?.charAt(0) ?? '?'}</AvatarFallback>
          </Avatar>
        </div>
        <div>
          <h1 className="text-5xl font-black">{user?.username ?? 'Loading...'}</h1>
          <p className="text-xl text-slate-400">
            {user?.createdAt
              ? `Joined ${formatDistanceToNow(new Date(user.createdAt))} ago`
              : ''}
          </p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={() => signOut({ callbackUrl: '/landing' })}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-slate-800/60 mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="match-history">Match History</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>
                This is how other players see you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  defaultValue="Competitive player from EU. Streaming every weekend. Looking for a duo to climb the ranks."
                  className="bg-slate-900/50 border-slate-700 min-h-[100px]"
                />
              </div>
              <div className="flex items-center gap-4">
                <Label>Profile Banner</Label>
                <Button variant="outline">Change Banner</Button>
              </div>
              <Button>
                <Save className="mr-2 h-4 w-4" />
                Save Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Player Statistics</CardTitle>
              <CardDescription>
                Your all-time performance stats.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.totalRuns ?? 0}</p>
                <p className="text-slate-400">Total Runs</p>
              </div>
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.bestScore ?? 0}</p>
                <p className="text-slate-400">Best Score</p>
              </div>
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.bestDistance ?? 0}m</p>
                <p className="text-slate-400">Best Distance</p>
              </div>
              <div className="text-center bg-slate-900/40 p-4 rounded-lg">
                <p className="text-4xl font-black text-primary">{summary?.avgScore ?? 0}</p>
                <p className="text-slate-400">Avg Score</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="match-history" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Match History</CardTitle>
              <CardDescription>Your last {history.length} recorded runs.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading match history...
                </div>
              ) : history.length === 0 ? (
                <p className="text-center py-12 text-slate-400">
                  No runs recorded yet. Launch the game to build your match history.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 hover:bg-transparent">
                      <TableHead>Score</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Lives Remaining</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((match) => (
                      <TableRow key={match.id} className="border-slate-700/50">
                        <TableCell className="font-bold">{match.score}</TableCell>
                        <TableCell>{match.distance}m</TableCell>
                        <TableCell className="font-mono">{match.livesRemaining}</TableCell>
                        <TableCell className="text-right text-slate-400">
                          {formatDistanceToNow(new Date(match.datePlayed))} ago
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Show off your accomplishments.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2">
                <Trophy className="w-10 h-10 text-slate-600" />
                <p>Achievement tracking isn&apos;t part of the current data model yet.</p>
                <p className="text-sm">
                  Check the <span className="font-semibold text-slate-300">Statistics</span> and{' '}
                  <span className="font-semibold text-slate-300">Match History</span> tabs for your live
                  performance data.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>
                Manage your account and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 max-w-2xl mx-auto">
              {/* Account */}
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <User className="w-5 h-5" /> Account
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="space-y-2">
                    <Label htmlFor="username">Steam Username</Label>
                    <Input id="username" value={user?.username ?? ''} readOnly className="bg-slate-900/50 border-slate-700" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="steamid">Steam ID</Label>
                    <Input id="steamid" value={user?.steamId ?? ''} readOnly className="bg-slate-900/50 border-slate-700 font-mono" />
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5" />
                    Your identity is managed by Steam. Update your username/avatar from your Steam profile.
                  </p>
                </div>
              </div>
              <Separator className="bg-slate-700/50" />
              {/* Email Verification */}
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Mail className="w-5 h-5" /> Email Verification
                </h3>
                <div className="space-y-3 pl-7">
                  {user?.emailVerified ? (
                    <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-emerald-300">Verified</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 border border-primary/30 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-primary">Not verified</p>
                        <p className="text-xs text-slate-400">
                          Verify your email to unlock a 100 VP Welcome Bonus.
                        </p>
                      </div>
                      <Button asChild size="sm">
                        <Link href="/verify-email">Verify Now</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <Separator className="bg-slate-700/50" />
              {/* Notifications */}
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Bell className="w-5 h-5" /> Notifications
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="friend-requests">Friend Requests</Label>
                    <Switch id="friend-requests" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="game-invites">Game Invites</Label>
                    <Switch id="game-invites" defaultChecked />
                  </div>
                   <div className="flex items-center justify-between">
                    <Label htmlFor="patch-notes">Patch Notes & Updates</Label>
                    <Switch id="patch-notes" />
                  </div>
                </div>
              </div>
              <Separator className="bg-slate-700/50" />
              {/* Privacy */}
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5" /> Privacy
                </h3>
                <div className="space-y-4 pl-7">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-online">Show my online status</Label>
                    <Switch id="show-online" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="allow-spectate">
                      Allow others to spectate my games
                    </Label>
                    <Switch id="allow-spectate" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="allow-friend-requests">
                      Allow friend requests
                    </Label>
                    <Switch id="allow-friend-requests" defaultChecked />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
