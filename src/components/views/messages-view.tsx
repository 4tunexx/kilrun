'use client';

import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Mail, Paperclip, Search, Send, Smile } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Card } from '../ui/card';

const conversations = [
  { name: 'ShadowStriker', avatar: 'https://picsum.photos/seed/p1/80/80', lastMessage: 'Sure, I can join for a ranked', time: '10:42 AM', unread: 0 },
  { name: 'Vortex', avatar: 'https://picsum.photos/seed/p2/80/80', lastMessage: 'Wanna duo later?', time: '9:30 AM', unread: 2 },
  { name: 'Phoenix', avatar: 'https://picsum.photos/seed/p3/80/80', lastMessage: 'gg', time: 'Yesterday', unread: 0 },
  { name: 'System', avatar: 'https://picsum.photos/seed/system/80/80', lastMessage: 'Patch 5.04 is now live!', time: '2 days ago', unread: 1 },
];

const initialMessages = [
    { from: 'them', text: 'Hey, you on?' },
    { from: 'me', text: 'Yeah, just logging in now. What\'s up?' },
    { from: 'them', text: 'Down for a comp game? Need one more for a 5-stack.' },
    { from: 'me', text: 'For sure, let me just finish my warm-up. 5 mins.' },
    { from: 'them', text: 'Sounds good, I\'ll send the invite.' },
];

export default function MessagesView() {
  const [selectedConvo, setSelectedConvo] = useState(conversations[0]);
  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      setMessages([...messages, { from: 'me', text: newMessage.trim() }]);
      setNewMessage('');
    }
  };

  return (
    <div className="px-12 py-8 h-full flex flex-col">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <Mail className="w-12 h-12 text-blue-400" />
        Messages
      </h1>

      <Card className="flex-1 flex overflow-hidden bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        {/* Conversations List */}
        <div className="w-1/3 min-w-[300px] border-r border-slate-700/30 flex flex-col">
          <div className="p-4 border-b border-slate-700/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input placeholder="Search conversations..." className="pl-10 bg-slate-800 border-slate-700" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {conversations.map((convo, i) => (
              <div
                key={i}
                className={`flex items-center p-4 cursor-pointer border-l-4 ${selectedConvo.name === convo.name ? 'border-primary bg-slate-700/20' : 'border-transparent hover:bg-slate-800/50'}`}
                onClick={() => setSelectedConvo(convo)}
              >
                <Avatar>
                  <AvatarImage src={convo.avatar} alt={convo.name} />
                  <AvatarFallback>{convo.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="ml-4 flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">{convo.name}</h3>
                    <p className="text-xs text-slate-400">{convo.time}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-400 truncate w-4/5">{convo.lastMessage}</p>
                    {convo.unread > 0 && <div className="w-5 h-5 bg-primary text-xs rounded-full flex items-center justify-center">{convo.unread}</div>}
                  </div>
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="w-2/3 flex flex-col">
          <div className="p-4 border-b border-slate-700/30 flex items-center justify-between bg-slate-900/50">
            <h2 className="text-xl font-bold">{selectedConvo.name}</h2>
            {/* Could add more actions here */}
          </div>
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md p-3 rounded-2xl ${msg.from === 'me' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-slate-700/50 rounded-bl-none'}`}>
                    <p>{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-4 bg-slate-900/50 border-t border-slate-700/30">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon"><Smile /></Button>
              <Button variant="ghost" size="icon"><Paperclip /></Button>
              <Input
                placeholder="Type a message..."
                className="bg-slate-800 border-slate-700 focus:ring-primary/50"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <Button onClick={handleSendMessage}>
                <Send className="w-4 h-4 mr-2"/> Send
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}