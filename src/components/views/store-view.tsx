'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { getStoreItems } from '@/lib/actions';
import { purchaseStoreItem } from '@/lib/social-actions';
import type { StoreItem } from '@/generated/prisma';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { useToast } from '@/hooks/use-toast';

export default function StoreView({ userId }: { userId?: string }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const { toast } = useToast();

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

  const buy = async (item: StoreItem) => {
    setBuyingId(item.id);
    try {
      const result = await purchaseStoreItem(item.id);
      if (!result.ok) {
        toast({ title: result.error ?? 'Purchase failed', variant: 'destructive' });
      } else {
        toast({ title: `Purchased ${item.itemName}` });
      }
    } catch {
      toast({ title: 'Purchase failed', variant: 'destructive' });
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6">
      <h1 className="text-3xl sm:text-4xl font-black mb-6">In-Game Store</h1>
      {isLoading ? (
        <div className="flex items-center justify-center h-[40vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading catalog...
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
          <CardContent className="py-16 text-center text-slate-400">
            The store catalog is empty. Ask an admin to add items, or run{' '}
            <code>npm run db:seed</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {items.map((item) => (
            <Card
              key={item.id}
              className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 hover:border-primary/50 transition-all duration-300 group shadow-lg flex flex-col"
            >
              <CardContent className="p-0 w-full">
                <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-slate-900/80">
                  {item.bannerConfig ? (
                    <div
                      className={`absolute inset-0 ${bannerAnimationClass(
                        normalizeBannerConfig(item.bannerConfig)
                      )}`}
                      style={bannerStyle(normalizeBannerConfig(item.bannerConfig))}
                    />
                  ) : item.imageUrl && /^https?:\/\//i.test(item.imageUrl) ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.itemName}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.itemName}
                      className="absolute inset-0 h-full w-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
                      <span className="text-4xl font-black uppercase tracking-wider text-slate-600">
                        {item.itemCategory.slice(0, 1)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4 w-full">
                  <p className="text-xs text-slate-400 uppercase">{item.itemCategory}</p>
                  <h3 className="font-bold text-lg truncate">{item.itemName}</h3>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <p className="font-bold text-yellow-400">{item.vpPrice} VP</p>
                    <Button
                      size="sm"
                      disabled={buyingId === item.id}
                      onClick={() => buy(item)}
                    >
                      {buyingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Buy'
                      )}
                    </Button>
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
