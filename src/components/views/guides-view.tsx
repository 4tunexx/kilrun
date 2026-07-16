import { BookOpen, User, Tag, Eye } from 'lucide-react';
import Image from 'next/image';

const guides = [
  {
    title: 'Advanced Movement Techniques',
    author: 'ProGamer',
    category: 'Movement',
    views: 12840,
    image: 'https://picsum.photos/seed/g1/600/400',
    hint: 'parkour character',
  },
  {
    title: 'Vandal vs. Phantom: Which to Choose?',
    author: 'TacticGuru',
    category: 'Weapons',
    views: 25987,
    image: 'https://picsum.photos/seed/g2/600/400',
    hint: 'weapon loadout',
  },
  {
    title: 'Mastering Agent X: A Complete Guide',
    author: 'AgentMain',
    category: 'Agents',
    views: 8950,
    image: 'https://picsum.photos/seed/g3/600/400',
    hint: 'futuristic soldier',
  },
  {
    title: 'Economy Guide: How to Manage Your Credits',
    author: 'EcoMaster',
    category: 'Strategy',
    views: 15300,
    image: 'https://picsum.photos/seed/g4/600/400',
    hint: 'gold coins',
  },
  {
    title: 'Top 10 Lineups for Ascent',
    author: 'LineupLarry',
    category: 'Maps',
    views: 19870,
    image: 'https://picsum.photos/seed/g5/600/400',
    hint: 'map strategy',
  },
   {
    title: 'Improving Your Aim: Drills and Tips',
    author: 'AimGod',
    category: 'Aiming',
    views: 32045,
    image: 'https://picsum.photos/seed/g6/600/400',
    hint: 'target practice',
  },
];

export default function GuidesView() {
  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <BookOpen className="w-12 h-12 text-blue-400" />
        Guides & Tutorials
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {guides.map((guide, i) => (
          <div key={i} className="bg-slate-800/60 backdrop-blur-md rounded-lg overflow-hidden border border-slate-700/50 hover:border-primary/50 transition-all duration-300 group cursor-pointer hover:scale-[1.03]">
            <div className="relative h-40">
              <Image
                src={guide.image}
                alt={guide.title}
                fill
                className="object-cover group-hover:scale-110 transition-transform"
                data-ai-hint={guide.hint}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <Tag size={14} /> {guide.category}
              </div>
              <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors">
                {guide.title}
              </h3>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <div className="flex items-center gap-1.5">
                  <User size={14} /> {guide.author}
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye size={14} /> {guide.views.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
