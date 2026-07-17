'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  Gauge,
  Loader2,
  Lock,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LevelBar } from '@/components/ui/level-bar';
import {
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  voteReputation,
} from '@/lib/social-actions';
import { getPublicProfile, type PublicProfile } from '@/lib/public-profile-actions';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function PublicProfileView({
  userId,
  onMessage,
  onBack,
}: {
  userId: string;
  onMessage?: (peerId: string) => void;
  onBack?: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const reload = () => {
    setLoading(true);
    getPublicProfile(userId)
      .then(setProfile)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="px-4 sm:px-8 py-16 text-center text-slate-400">
        Player not found.
        {onBack && (
          <div className="mt-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </div>
        )}
      </div>
    );
  }

  const banner = profile.equippedBannerConfig
    ? normalizeBannerConfig(profile.equippedBannerConfig)
    : null;

  const handleAddFriend = async () => {
    setBusy(true);
    try {
      await sendFriendRequest(profile.id);
      toast({ title: 'Friend request sent' });
      reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not send request', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveFriend = async () => {
    setBusy(true);
    try {
      await removeFriend(profile.id);
      toast({ title: 'Friend removed' });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleRespondRequest = async (accept: boolean) => {
    if (!profile.incomingFriendshipId) return;
    setBusy(true);
    try {
      await respondFriendRequest(profile.incomingFriendshipId, accept);
      toast({ title: accept ? 'Friend request accepted' : 'Friend request declined' });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (value: 1 | -1) => {
    setBusy(true);
    try {
      const result = await voteReputation(profile.id, value);
      setProfile((p) =>
        p
          ? {
              ...p,
              reputation: result.reputation,
              myReputationVote: p.myReputationVote === value ? 0 : value,
            }
          : p
      );
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not vote', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const gameAch = profile.achievements.filter((a) => a.category === 'game');
  const webAch = profile.achievements.filter((a) => a.category === 'website');

  return (
    <div className="px-0 sm:px-0 pb-10">
      {onBack && (
        <div className="px-4 sm:px-8 pt-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      )}

      {/* Banner header */}
      <div
        className={`relative h-32 sm:h-48 w-full ${
          banner ? bannerAnimationClass(banner) : 'bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800'
        }`}
        style={banner ? bannerStyle(banner) : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
      </div>

      <div className="px-4 sm:px-8">
        <div className="-mt-12 sm:-mt-16 flex flex-col sm:flex-row sm:items-end gap-4">
          <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-slate-900 shadow-2xl shrink-0">
            <AvatarImage src={profile.avatarUrl} alt={profile.username} />
            <AvatarFallback>{profile.username.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-2xl sm:text-4xl font-black truncate flex items-center gap-2">
              {profile.username}
              {profile.isVip && <Badge className="bg-yellow-500 text-black">VIP</Badge>}
            </h1>
            <p className="text-sm text-slate-400 capitalize">
              {profile.role} · Joined {formatDistanceToNow(new Date(profile.createdAt))} ago
            </p>
          </div>

          {profile.friendStatus !== 'self' && (
            <div className="flex flex-wrap gap-2 pb-1">
              <Button
                variant={profile.myReputationVote === 1 ? 'default' : 'outline'}
                size="sm"
                disabled={busy}
                onClick={() => handleVote(1)}
                title="+rep"
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                variant={profile.myReputationVote === -1 ? 'destructive' : 'outline'}
                size="sm"
                disabled={busy}
                onClick={() => handleVote(-1)}
                title="-rep"
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>

              {profile.friendStatus === 'friends' && (
                <>
                  <Button size="sm" onClick={() => onMessage?.(profile.id)}>
                    <MessageSquare className="mr-2 h-4 w-4" /> Message
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={handleRemoveFriend}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Remove Friend
                  </Button>
                </>
              )}
              {profile.friendStatus === 'none' && (
                <Button size="sm" disabled={busy} onClick={handleAddFriend}>
                  <UserPlus className="mr-2 h-4 w-4" /> Add Friend
                </Button>
              )}
              {profile.friendStatus === 'pending_sent' && (
                <Button size="sm" variant="outline" disabled>
                  Request Sent
                </Button>
              )}
              {profile.friendStatus === 'pending_received' && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => handleRespondRequest(true)}>
                    <Check className="mr-2 h-4 w-4" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => handleRespondRequest(false)}
                  >
                    <X className="mr-2 h-4 w-4" /> Decline
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {profile.bio && <p className="mt-4 text-slate-300 whitespace-pre-wrap">{profile.bio}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardContent className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-primary">
                    {profile.stats.totalRuns}
                  </p>
                  <p className="text-xs text-slate-400">Total Runs</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-primary">
                    {profile.stats.bestScore}
                  </p>
                  <p className="text-xs text-slate-400">Best Score</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-primary">
                    {profile.stats.bestDistance}m
                  </p>
                  <p className="text-xs text-slate-400">Best Distance</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-primary">
                    {profile.stats.winRate}%
                  </p>
                  <p className="text-xs text-slate-400">Win Rate</p>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="badges">
              <TabsList className="bg-slate-800/60">
                <TabsTrigger value="badges">
                  Badges ({profile.badges.filter((b) => b.unlocked).length}/{profile.badges.length})
                </TabsTrigger>
                <TabsTrigger value="game">In-Game</TabsTrigger>
                <TabsTrigger value="web">Website</TabsTrigger>
              </TabsList>
              <TabsContent value="badges" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profile.badges.map((badge) => (
                    <Card
                      key={badge.id}
                      className={`border ${
                        badge.unlocked
                          ? 'bg-slate-800/50 border-primary/40'
                          : 'bg-slate-900/30 border-slate-700/40 opacity-60'
                      }`}
                    >
                      <CardContent className="pt-5 flex gap-3 items-start">
                        {badge.iconImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={badge.iconImageUrl}
                            alt=""
                            className={`w-10 h-10 rounded object-cover shrink-0 ${
                              badge.unlocked ? '' : 'opacity-40 grayscale'
                            }`}
                          />
                        ) : (
                          <div className="text-2xl">{badge.unlocked ? '🏅' : '🔒'}</div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold">{badge.title}</h3>
                            <Badge variant="outline" className="capitalize text-[10px]">
                              {badge.rarity}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-400">{badge.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="game" className="mt-4 space-y-2">
                {gameAch.map((ach) => (
                  <AchievementRow key={ach.id} ach={ach} />
                ))}
              </TabsContent>
              <TabsContent value="web" className="mt-4 space-y-2">
                {webAch.map((ach) => (
                  <AchievementRow key={ach.id} ach={ach} />
                ))}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardContent className="pt-6 space-y-4">
                <LevelBar
                  level={profile.level}
                  xpIntoLevel={profile.xpIntoLevel}
                  xpForNextLevel={profile.xpForNextLevel}
                  percent={profile.levelProgressPercent}
                />
                <div className="rounded-lg bg-slate-900/40 p-3 text-center">
                  <p className="text-xs text-slate-400">Rank</p>
                  <p className="text-lg font-bold text-yellow-400 flex items-center justify-center gap-1">
                    <Crown className="h-4 w-4" /> {profile.currentRank}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/40 p-3 text-center">
                  <p className="text-xs text-slate-400">Leaderboard Position</p>
                  <p className="text-lg font-bold flex items-center justify-center gap-1">
                    <Trophy className="h-4 w-4 text-primary" /> #{profile.leaderboardPosition} of{' '}
                    {profile.totalPlayers}
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-900/40 p-3">
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <Gauge className="h-4 w-4 text-primary" /> Reputation
                  </span>
                  <span className="text-lg font-bold">{profile.reputation}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function AchievementRow({ ach }: { ach: PublicProfile['achievements'][number] }) {
  return (
    <Card
      className={`bg-slate-800/40 border-slate-700/30 ${ach.unlocked ? '' : 'opacity-55'}`}
    >
      <CardContent className="py-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          {ach.iconImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ach.iconImageUrl}
              alt=""
              className={`h-5 w-5 rounded object-cover shrink-0 ${
                ach.unlocked ? '' : 'opacity-40 grayscale'
              }`}
            />
          ) : ach.unlocked ? (
            <Trophy className="h-4 w-4 text-yellow-400 shrink-0" />
          ) : (
            <Lock className="h-4 w-4 text-slate-500 shrink-0" />
          )}
          <span>
            <span className="block">{ach.title}</span>
            <span className="block text-xs text-slate-400 font-normal">{ach.description}</span>
          </span>
        </span>
        <span className="text-sm font-normal text-yellow-400 shrink-0">
          +{ach.xpReward} XP
        </span>
      </CardContent>
    </Card>
  );
}
