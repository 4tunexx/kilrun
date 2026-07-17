'use client';

import { useEffect, useState } from 'react';
import { Award, Crown, Loader2, Shield, Star, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUserProfile } from '@/lib/social-actions';

export default function BadgesView() {
  const [role, setRole] = useState('player');
  const [isVip, setIsVip] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUserProfile()
      .then((u) => {
        setRole(u.role);
        setIsVip(u.isVip);
      })
      .finally(() => setLoading(false));
  }, []);

  const badges = [
    {
      icon: User,
      name: 'Registered Player',
      description: 'Created a Kilrun account via Steam.',
      earned: true,
    },
    {
      icon: Crown,
      name: 'VIP',
      description: 'Unlocked VIP with VP or staff grant.',
      earned: isVip || role === 'vip' || role === 'admin' || role === 'moderator',
    },
    {
      icon: Shield,
      name: 'Moderator',
      description: 'Trusted staff with support access.',
      earned: role === 'moderator' || role === 'admin',
    },
    {
      icon: Star,
      name: 'Administrator',
      description: 'Full admin panel and role management.',
      earned: role === 'admin',
    },
  ];

  return (
    <div className="px-4 sm:px-8 py-6">
      <h1 className="text-3xl sm:text-4xl font-black mb-6 flex items-center gap-3">
        <Award className="w-8 h-8 text-blue-400" />
        Badges
      </h1>
      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading...
        </div>
      ) : (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle>Your status badges</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {badges.map((badge) => (
              <div
                key={badge.name}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  badge.earned
                    ? 'bg-slate-900/50 border-primary/40'
                    : 'bg-slate-900/20 border-slate-700/40 opacity-50'
                }`}
              >
                <div className="p-4 bg-slate-700/50 rounded-lg">
                  <badge.icon className="w-8 h-8 text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{badge.name}</h3>
                  <p className="text-sm text-slate-400">{badge.description}</p>
                  <p className="text-xs mt-1 font-semibold">
                    {badge.earned ? 'Earned' : 'Locked'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
