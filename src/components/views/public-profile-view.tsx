'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  Award,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LevelBar } from '@/components/ui/level-bar';
import { AvatarWithFrame } from '@/components/avatar-with-frame';
import { NicknameEffectText } from '@/components/nickname-effect';
import {
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  voteReputation,
} from '@/lib/social-actions';
import { getPublicProfile, type PublicProfile } from '@/lib/public-profile-actions';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { ShowcaseChips } from '@/components/showcase-chips';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { flagUrl, getCountryName } from '@/lib/countries';

const PANEL = 'bg-slate-900/60 backdrop-blur-md border border-slate-700/30';

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
  const [busyAction, setBusyAction] = useState<string | null>(null);
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
    setBusyAction('add-friend');
    try {
      await sendFriendRequest(profile.id);
      toast({ title: 'Friend request sent' });
      reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not send request', variant: 'destructive' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveFriend = async () => {
    setBusyAction('remove-friend');
    try {
      await removeFriend(profile.id);
      toast({ title: 'Friend removed' });
      reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not remove friend', variant: 'destructive' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRespondRequest = async (accept: boolean) => {
    if (!profile.incomingFriendshipId) return;
    setBusyAction(accept ? 'accept-friend' : 'decline-friend');
    try {
      await respondFriendRequest(profile.incomingFriendshipId, accept);
      toast({ title: accept ? 'Friend request accepted' : 'Friend request declined' });
      reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not update request', variant: 'destructive' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleVote = async (value: 1 | -1) => {
    if (profile.myReputationVote !== 0) {
      toast({ title: 'You already submitted reputation for this player' });
      return;
    }
    setBusyAction(value === 1 ? 'rep-up' : 'rep-down');
    try {
      const result = await voteReputation(profile.id, value);
      setProfile((p) =>
        p
          ? {
              ...p,
              reputation: result.reputation,
              myReputationVote: result.myVote,
            }
          : p
      );
      toast({
        title: result.myVote === 1 ? 'Gave +REP — locked in' : 'Gave −REP — locked in',
        description: 'Your vote is permanent and cannot be changed.',
      });
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not vote', variant: 'destructive' });
    } finally {
      setBusyAction(null);
    }
  };

  const gameAch = profile.achievements.filter((a) => a.category === 'game');
  const webAch = profile.achievements.filter((a) => a.category === 'website');

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      )}

      <Card className={`${PANEL} overflow-hidden`}>
        <div
          className={`relative h-28 sm:h-40 w-full ${
            banner
              ? bannerAnimationClass(banner)
              : 'bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800'
          }`}
          style={banner ? bannerStyle(banner) : undefined}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
        </div>

        <CardContent className="pt-0 pb-6">
          <div className="-mt-12 sm:-mt-14 flex flex-col sm:flex-row sm:items-end gap-4">
            <AvatarWithFrame
              src={profile.avatarUrl}
              alt={profile.username}
              fallback={profile.username.charAt(0)}
              frameConfig={profile.equippedFrameConfig}
              sizeClass="h-24 w-24 sm:h-28 sm:w-28"
            />

            <div className="min-w-0 flex-1 pb-1">
              <h2
                className={`text-2xl sm:text-3xl font-black truncate flex items-center gap-2 flex-wrap ${getRoleTextColorClass(
                  profile.role,
                  profile.isVip
                )}`}
              >
                <NicknameEffectText
                  name={profile.username}
                  effect={profile.equippedNicknameConfig}
                  className="truncate"
                />
                {profile.countryCode && (
                  <Image
                    src={flagUrl(profile.countryCode, 40)}
                    alt={getCountryName(profile.countryCode) ?? profile.countryCode}
                    width={26}
                    height={20}
                    className="rounded-sm shadow-md shrink-0"
                    title={getCountryName(profile.countryCode) ?? undefined}
                    unoptimized
                  />
                )}
                {profile.isVip && (
                  <Badge className="bg-yellow-500 text-black h-5 px-1.5 text-[10px]">VIP</Badge>
                )}
              </h2>
              {profile.statusMessage ? (
                <p className="text-sm text-slate-300 mt-0.5 line-clamp-2">
                  {profile.statusMessage}
                </p>
              ) : null}
              <p className="text-sm text-slate-400 capitalize">
                {profile.role}
                {profile.countryCode && getCountryName(profile.countryCode)
                  ? ` · ${getCountryName(profile.countryCode)}`
                  : ''}{' '}
                · Joined {formatDistanceToNow(new Date(profile.createdAt))} ago
              </p>
              {profile.showcase.length > 0 && (
                <div className="mt-2">
                  <ShowcaseChips items={profile.showcase} />
                </div>
              )}
            </div>

            {profile.friendStatus !== 'self' && (
              <div className="flex flex-wrap gap-2 pb-1 items-center">
                {profile.myReputationVote !== 0 ? (
                  <div
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold opacity-60 cursor-not-allowed ${
                      profile.myReputationVote === 1
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    }`}
                    title="Your reputation vote is locked"
                  >
                    {profile.myReputationVote === 1 ? (
                      <ThumbsUp className="h-4 w-4" />
                    ) : (
                      <ThumbsDown className="h-4 w-4" />
                    )}
                    {profile.myReputationVote === 1 ? '+REP submitted' : '−REP submitted'}
                  </div>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => handleVote(1)}
                      className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                      title="Give permanent +REP"
                    >
                      {busyAction === 'rep-up' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <ThumbsUp className="h-4 w-4 mr-1" />
                      )}
                      +REP
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => handleVote(-1)}
                      className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                      title="Give permanent −REP"
                    >
                      {busyAction === 'rep-down' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <ThumbsDown className="h-4 w-4 mr-1" />
                      )}
                      −REP
                    </Button>
                  </>
                )}

                {profile.friendStatus === 'friends' && (
                  <>
                    <Button size="sm" onClick={() => onMessage?.(profile.id)}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Message
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={handleRemoveFriend}
                    >
                      {busyAction === 'remove-friend' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  </>
                )}
                {profile.friendStatus === 'none' && (
                  <Button size="sm" disabled={busyAction !== null} onClick={handleAddFriend}>
                    {busyAction === 'add-friend' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" />
                    )}
                    Add Friend
                  </Button>
                )}
                {profile.friendStatus === 'pending_sent' && (
                  <Button size="sm" variant="outline" disabled>
                    Request Sent
                  </Button>
                )}
                {profile.friendStatus === 'pending_received' && (
                  <>
                    <Button
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => handleRespondRequest(true)}
                    >
                      {busyAction === 'accept-friend' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyAction !== null}
                      onClick={() => handleRespondRequest(false)}
                    >
                      {busyAction === 'decline-friend' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <X className="mr-2 h-4 w-4" />
                      )}
                      Decline
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {profile.bio && (
            <p className="mt-4 text-slate-300 whitespace-pre-wrap text-sm sm:text-base">
              {profile.bio}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <Card className={PANEL}>
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

          <Card className={PANEL}>
            <CardContent className="pt-6">
              <Tabs defaultValue="badges">
                <TabsList className="bg-slate-800/60 w-full h-auto flex flex-wrap justify-start gap-1">
                  <TabsTrigger value="badges" className="flex-none">
                    Badges ({profile.badges.filter((b) => b.unlocked).length}/
                    {profile.badges.length})
                  </TabsTrigger>
                  <TabsTrigger value="game" className="flex-none">
                    In-Game
                  </TabsTrigger>
                  <TabsTrigger value="web" className="flex-none">
                    Website
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="badges" className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profile.badges.map((badge) => (
                      <Card
                        key={badge.id}
                        className={`${PANEL} group transition ${
                          badge.unlocked
                            ? 'border-emerald-500/55 hover:border-emerald-400/80'
                            : 'opacity-60'
                        }`}
                      >
                        <CardContent className="pt-5 flex gap-3 items-start">
                          {badge.iconImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={badge.iconImageUrl}
                              alt=""
                              className={`w-10 h-10 rounded object-cover shrink-0 transition duration-200 group-hover:scale-125 ${
                                badge.unlocked ? '' : 'opacity-40 grayscale'
                              }`}
                            />
                          ) : badge.unlocked ? (
                            <Award className="w-10 h-10 text-emerald-400 shrink-0 transition duration-200 group-hover:scale-125" />
                          ) : (
                            <Lock className="w-10 h-10 text-slate-500 shrink-0 transition duration-200 group-hover:scale-110" />
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
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={PANEL}>
            <CardContent className="pt-6 space-y-4">
              <LevelBar
                level={profile.level}
                xpIntoLevel={profile.xpIntoLevel}
                xpForNextLevel={profile.xpForNextLevel}
                percent={profile.levelProgressPercent}
              />
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-3 text-center">
                <p className="text-xs text-slate-400">Rank</p>
                <p className="text-lg font-bold text-yellow-400 flex items-center justify-center gap-1">
                  <Crown className="h-4 w-4" /> {profile.currentRank}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/30 p-3 text-center">
                <p className="text-xs text-slate-400">Leaderboard</p>
                <p className="text-lg font-bold flex items-center justify-center gap-1">
                  <Trophy className="h-4 w-4 text-primary" /> #{profile.leaderboardPosition} of{' '}
                  {profile.totalPlayers}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-900/40 border border-slate-700/30 p-3">
                <span className="flex items-center gap-2 text-sm text-slate-300">
                  <Gauge className="h-4 w-4 text-primary" /> Reputation
                </span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    profile.reputation > 0
                      ? 'text-emerald-400'
                      : profile.reputation < 0
                        ? 'text-rose-400'
                        : 'text-white'
                  }`}
                >
                  {profile.reputation > 0 ? '+' : ''}
                  {profile.reputation}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AchievementRow({ ach }: { ach: PublicProfile['achievements'][number] }) {
  return (
    <Card
      className={`${PANEL} group transition ${
        ach.unlocked ? 'border-emerald-500/50 hover:border-emerald-400/70' : 'opacity-55'
      }`}
    >
      <CardContent className="py-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium min-w-0">
          {ach.iconImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ach.iconImageUrl}
              alt=""
              className={`h-5 w-5 rounded object-cover shrink-0 transition duration-200 group-hover:scale-150 ${
                ach.unlocked ? '' : 'opacity-40 grayscale'
              }`}
            />
          ) : ach.unlocked ? (
            <Trophy className="h-4 w-4 text-yellow-400 shrink-0 transition duration-200 group-hover:scale-150" />
          ) : (
            <Lock className="h-4 w-4 text-slate-500 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block truncate">{ach.title}</span>
            <span className="block text-xs text-slate-400 font-normal line-clamp-2">
              {ach.description}
            </span>
          </span>
        </span>
        <span className="text-sm font-normal text-yellow-400 shrink-0">
          +{ach.xpReward} XP
        </span>
      </CardContent>
    </Card>
  );
}
