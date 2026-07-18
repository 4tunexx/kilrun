'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  createSupportTicket,
  getMySupportTickets,
} from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';

export default function SupportView({ userId }: { userId?: string }) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('account');
  const [body, setBody] = useState('');
  const [tickets, setTickets] = useState<
    { id: string; subject: string; category: string; status: string; staffNote: string; createdAt: Date }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    const data = await getMySupportTickets();
    setTickets(data);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [userId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      await createSupportTicket({ subject, category, body });
      setSubject('');
      setBody('');
      toast({ title: 'Ticket submitted' });
      await reload();
    } catch {
      toast({ title: 'Failed to submit ticket', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardHeader>
          <CardTitle>New ticket</CardTitle>
          <CardDescription>Describe the issue as clearly as you can.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="bg-slate-900/50 border-slate-700"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="billing">Billing / VP</SelectItem>
                  <SelectItem value="gameplay">Gameplay</SelectItem>
                  <SelectItem value="report">Player report</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Details</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="bg-slate-900/50 border-slate-700 min-h-[120px]"
                required
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit ticket
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardHeader>
          <CardTitle>Your tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : tickets.length === 0 ? (
            <p className="text-slate-400 text-sm">No tickets yet.</p>
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/40 space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{t.subject}</p>
                  <Badge variant="outline" className="capitalize">
                    {t.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 capitalize">{t.category}</p>
                {t.staffNote ? (
                  <p className="text-sm text-slate-300 mt-2">Staff: {t.staffNote}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
