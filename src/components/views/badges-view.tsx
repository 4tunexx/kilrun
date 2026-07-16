import { Award, Gem, ShieldCheck, Star, Target, Trophy, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const badges = [
  { icon: Trophy, name: 'Season 1 Champion', description: 'Achieved the highest rank in Season 1.' },
  { icon: Target, name: 'Sharpshooter', description: 'Achieve a 75% headshot rate in a competitive match.' },
  { icon: Gem, name: 'Diamond Hands', description: 'Accumulate over 1,000,000 in-game currency.' },
  { icon: ShieldCheck, name: 'The Guardian', description: 'Block over 10,000 damage with shields.' },
  { icon: Zap, name: 'Lightning Fast', description: 'Win a Spike Rush match in under 2 minutes.' },
  { icon: Award, name: 'Flawless Victory', description: 'Win a competitive match 13-0.' },
  { icon: Star, name: 'All-Star', description: 'Get selected for the end-of-season All-Star team.' },
  { icon: ShieldCheck, name: 'Community Pillar', description: 'Be an active and helpful member of the community for over a year.' },
];

export default function BadgesView() {
  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <Award className="w-12 h-12 text-blue-400" />
        Badges Collection
      </h1>
      <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
          <CardTitle>Your Earned Badges</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {badges.map((badge, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="p-4 bg-slate-700/50 rounded-lg">
                <badge.icon className="w-8 h-8 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{badge.name}</h3>
                <p className="text-sm text-slate-400">{badge.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
