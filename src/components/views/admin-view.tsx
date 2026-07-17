'use client';

import { useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  adminCreateGuide,
  adminCreateNews,
  adminDashboardStats,
  adminDeleteStoreItem,
  adminListTickets,
  adminListUsers,
  adminSetBanned,
  adminSetUserRole,
  adminUpdateTicketStatus,
  adminUpsertStoreItem,
} from '@/lib/social-actions';
import { getStoreItems } from '@/lib/actions';
import { ACCOUNT_ROLES } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';

export default function AdminView() {
  const [stats, setStats] = useState({
    users: 0,
    openTickets: 0,
    forumPosts: 0,
    purchases: 0,
  });
  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [itemForm, setItemForm] = useState({
    itemName: '',
    itemCategory: 'Cosmetic',
    itemSku: '',
    vpPrice: 100,
    imageUrl: '',
  });
  const [newsForm, setNewsForm] = useState({ title: '', summary: '', body: '' });
  const [guideForm, setGuideForm] = useState({
    title: '',
    summary: '',
    body: '',
    category: 'general',
  });

  const reload = async () => {
    const [s, u, t, store] = await Promise.all([
      adminDashboardStats(),
      adminListUsers(),
      adminListTickets(),
      getStoreItems(),
    ]);
    setStats(s);
    setUsers(u);
    setTickets(t);
    setItems(store);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch((err) => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-16 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading admin panel...
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <h1 className="text-3xl sm:text-4xl font-black flex items-center gap-2">
        <Shield className="text-primary" /> Admin Panel
      </h1>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-800/60 p-1">
          <TabsTrigger value="dashboard" className="flex-none">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="users" className="flex-none">
            Users
          </TabsTrigger>
          <TabsTrigger value="support" className="flex-none">
            Support
          </TabsTrigger>
          <TabsTrigger value="shop" className="flex-none">
            Shop
          </TabsTrigger>
          <TabsTrigger value="content" className="flex-none">
            Content
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Players', stats.users],
              ['Open tickets', stats.openTickets],
              ['Forum posts', stats.forumPosts],
              ['Purchases', stats.purchases],
            ].map(([label, value]) => (
              <Card key={String(label)} className="bg-slate-800/40 border-slate-700/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-black">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="bg-slate-800/40 border-slate-700/30">
              <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar>
                    <AvatarImage src={u.avatarUrl} />
                    <AvatarFallback>{u.username.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{u.username}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {u.steamId} · {u.vpCurrency} VP
                      {u.isBanned ? ' · BANNED' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={u.role}
                    onValueChange={async (role) => {
                      try {
                        await adminSetUserRole(u.id, role);
                        toast({ title: `Set ${u.username} to ${role}` });
                        await reload();
                      } catch (e: any) {
                        toast({
                          title: e?.message ?? 'Failed',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={u.isBanned ? 'default' : 'destructive'}
                    size="sm"
                    onClick={async () => {
                      await adminSetBanned(u.id, !u.isBanned);
                      await reload();
                    }}
                  >
                    {u.isBanned ? 'Unban' : 'Ban'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="support" className="mt-4 space-y-2">
          {tickets.length === 0 ? (
            <p className="text-slate-400">No tickets.</p>
          ) : (
            tickets.map((t) => (
              <Card key={t.id} className="bg-slate-800/40 border-slate-700/30">
                <CardContent className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t.subject}</p>
                      <p className="text-xs text-slate-400">
                        {t.user.username} · {t.category}
                      </p>
                    </div>
                    <Badge className="capitalize">{t.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{t.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {['open', 'in_progress', 'resolved', 'closed'].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={t.status === status ? 'default' : 'outline'}
                        onClick={async () => {
                          await adminUpdateTicketStatus(t.id, status);
                          await reload();
                        }}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    placeholder="Staff note..."
                    defaultValue={t.staffNote}
                    className="bg-slate-900/50 border-slate-700"
                    onBlur={async (e) => {
                      if (e.target.value !== t.staffNote) {
                        await adminUpdateTicketStatus(t.id, t.status, e.target.value);
                        toast({ title: 'Note saved' });
                      }
                    }}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="shop" className="mt-4 space-y-4">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader>
              <CardTitle>Add store item</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={itemForm.itemName}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, itemName: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>SKU</Label>
                <Input
                  value={itemForm.itemSku}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, itemSku: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input
                  value={itemForm.itemCategory}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, itemCategory: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>VP price</Label>
                <Input
                  type="number"
                  value={itemForm.vpPrice}
                  onChange={(e) =>
                    setItemForm((f) => ({
                      ...f,
                      vpPrice: Number(e.target.value) || 0,
                    }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Image URL (optional)</Label>
                <Input
                  value={itemForm.imageUrl}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, imageUrl: e.target.value }))
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <Button
                className="sm:col-span-2"
                onClick={async () => {
                  try {
                    await adminUpsertStoreItem({
                      ...itemForm,
                      imageUrl: itemForm.imageUrl || undefined,
                    });
                    setItemForm({
                      itemName: '',
                      itemCategory: 'Cosmetic',
                      itemSku: '',
                      vpPrice: 100,
                      imageUrl: '',
                    });
                    toast({ title: 'Item created' });
                    await reload();
                  } catch {
                    toast({ title: 'Failed to create item', variant: 'destructive' });
                  }
                }}
              >
                Create item
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.id} className="bg-slate-800/40 border-slate-700/30">
                <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.itemName}</p>
                    <p className="text-xs text-slate-400">
                      {item.itemSku} · {item.vpPrice} VP · {item.itemCategory}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await adminDeleteStoreItem(item.id);
                      await reload();
                    }}
                  >
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader>
              <CardTitle>Publish news</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Title"
                value={newsForm.title}
                onChange={(e) => setNewsForm((f) => ({ ...f, title: e.target.value }))}
                className="bg-slate-900/50 border-slate-700"
              />
              <Input
                placeholder="Summary"
                value={newsForm.summary}
                onChange={(e) =>
                  setNewsForm((f) => ({ ...f, summary: e.target.value }))
                }
                className="bg-slate-900/50 border-slate-700"
              />
              <Textarea
                placeholder="Body"
                value={newsForm.body}
                onChange={(e) => setNewsForm((f) => ({ ...f, body: e.target.value }))}
                className="bg-slate-900/50 border-slate-700"
              />
              <Button
                onClick={async () => {
                  await adminCreateNews(newsForm);
                  setNewsForm({ title: '', summary: '', body: '' });
                  toast({ title: 'News published' });
                }}
              >
                Publish news
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader>
              <CardTitle>Publish guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Title"
                value={guideForm.title}
                onChange={(e) =>
                  setGuideForm((f) => ({ ...f, title: e.target.value }))
                }
                className="bg-slate-900/50 border-slate-700"
              />
              <Input
                placeholder="Summary"
                value={guideForm.summary}
                onChange={(e) =>
                  setGuideForm((f) => ({ ...f, summary: e.target.value }))
                }
                className="bg-slate-900/50 border-slate-700"
              />
              <Input
                placeholder="Category"
                value={guideForm.category}
                onChange={(e) =>
                  setGuideForm((f) => ({ ...f, category: e.target.value }))
                }
                className="bg-slate-900/50 border-slate-700"
              />
              <Textarea
                placeholder="Body"
                value={guideForm.body}
                onChange={(e) => setGuideForm((f) => ({ ...f, body: e.target.value }))}
                className="bg-slate-900/50 border-slate-700"
              />
              <Button
                onClick={async () => {
                  await adminCreateGuide(guideForm);
                  setGuideForm({
                    title: '',
                    summary: '',
                    body: '',
                    category: 'general',
                  });
                  toast({ title: 'Guide published' });
                }}
              >
                Publish guide
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
