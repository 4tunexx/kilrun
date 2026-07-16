import Image from 'next/image';
import { Button } from '../ui/button';

const newsUpdates = [
  {
    title: 'New Map "Abyss" Released!',
    date: '2 days ago',
    description: 'Explore the depths of the new underwater map and discover new strategies. Abyss brings verticality and flanking routes to a whole new level. Are you ready to take the plunge?',
    image: 'https://picsum.photos/seed/news1/800/400',
    hint: 'underwater city',
    category: 'MAPS',
  },
  {
    title: 'Patch Notes v5.03',
    date: '4 days ago',
    description: 'This patch includes major balancing changes for Agents Neon and Fade, updates to the Vandal\'s spray pattern, and various performance improvements to make your game run smoother than ever.',
    image: 'https://picsum.photos/seed/news2/800/400',
    hint: 'code on screen',
    category: 'UPDATES',
  },
   {
    title: 'The "Cybernetic" Skin Bundle is Here!',
    date: '1 week ago',
    description: 'Upgrade your arsenal with the new Cybernetic skin line, featuring a futuristic design, custom animations, and a unique finisher. Available in the store for a limited time.',
    image: 'https://picsum.photos/seed/news3/800/400',
    hint: 'futuristic weapon',
    category: 'STORE',
  },
   {
    title: 'Community Spotlight: Best Plays of June',
    date: '2 weeks ago',
    description: 'We\'ve reviewed thousands of submissions, and we\'re excited to showcase the most incredible plays from the community in June. Watch the highlight reel now!',
    image: 'https://picsum.photos/seed/news4/800/400',
    hint: 'esports player celebrating',
    category: 'COMMUNITY',
  },
];

export default function NewsView() {
  return (
    <div className="space-y-8">
      {newsUpdates.map((item, i) => (
        <div key={i} className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/30 rounded-lg overflow-hidden group transition-all hover:border-primary/50">
          <div className="relative h-64">
             <Image
                src={item.image}
                alt={item.title}
                fill
                className="object-cover"
                data-ai-hint={item.hint}
              />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
            <div className="absolute bottom-6 left-6">
               <p className="text-sm font-bold text-primary uppercase tracking-wider">{item.category}</p>
               <h2 className="text-4xl font-black text-white group-hover:text-primary/90 transition-colors">{item.title}</h2>
            </div>
          </div>
          <div className="p-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-slate-300 leading-relaxed max-w-2xl">{item.description}</p>
              <p className="text-xs text-slate-500 mt-4">{item.date}</p>
            </div>
            <Button variant="outline" className="flex-shrink-0 self-center">Read More</Button>
          </div>
        </div>
      ))}
    </div>
  );
}