import { Bell, UserPlus, Gift, Gamepad2, AlertTriangle, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '../ui/button';

const notifications = [
  { icon: UserPlus, text: 'Vortex sent you a friend request.', time: '5m ago', type: 'request' },
  { icon: Gift, text: 'Your daily reward is available to claim!', time: '1h ago', type: 'info' },
  { icon: Gamepad2, text: 'ShadowStriker invited you to a party.', time: '3h ago', type: 'invite' },
  { icon: AlertTriangle, text: 'Your account was logged into from a new device.', time: '1d ago', type: 'alert' },
  { icon: Gift, text: 'You unlocked the "Centurion" achievement.', time: '2d ago', type: 'info' },
];

export default function NotificationsView() {
  const getIconColor = (type: string) => {
    switch (type) {
      case 'request': return 'text-blue-400';
      case 'invite': return 'text-green-400';
      case 'alert': return 'text-red-400';
      default: return 'text-yellow-400';
    }
  }

  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <Bell className="w-12 h-12 text-blue-400" />
        Notifications
      </h1>
      <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 max-w-4xl mx-auto">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent Notifications</CardTitle>
          <Button variant="ghost"><CheckCheck className="mr-2 h-4 w-4"/> Mark All as Read</Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {notifications.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <div className={`p-2 bg-slate-700/50 rounded-lg ${getIconColor(item.type)}`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p>{item.text}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{item.time}</p>
                  { (item.type === 'request' || item.type === 'invite') && 
                    <div className="flex gap-2 mt-1">
                      <Button size="sm" variant="secondary">Decline</Button>
                      <Button size="sm">Accept</Button>
                    </div>
                  }
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
