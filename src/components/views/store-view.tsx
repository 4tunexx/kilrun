'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { getStoreItems } from '@/lib/actions';
import type { StoreItem } from '@/generated/prisma';

const FALLBACK_IMAGE = 'https://picsum.photos/seed/store-fallback/400/400';

export default function StoreView() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getStoreItems().then((data) => {
      if (!isMounted) return;
      setItems(data);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8">In-Game Store</h1>
      {isLoading ? (
        <div className="flex items-center justify-center h-[50vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading catalog...
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
          <CardContent className="py-16 text-center text-slate-400">
            The store catalog is empty. Run <code>npm run db:seed</code> to populate it.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <Card key={item.id} className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 group shadow-lg cursor-pointer flex flex-col items-center justify-start h-full">
              <CardContent className="p-0 w-full">
                <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
                  <Image
                    src={FALLBACK_IMAGE}
                    alt={item.itemName}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="p-4 w-full">
                  <p className="text-xs text-slate-400 uppercase">
                    {item.itemCategory}
                  </p>
                  <h3 className="font-bold text-lg truncate">
                    {item.itemName}
                  </h3>
                  <div className="flex items-center justify-between mt-2">
                    <p className="font-bold text-yellow-400">
                      {item.vpPrice} VP
                    </p>
                    <Button size="sm">Buy Now</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
