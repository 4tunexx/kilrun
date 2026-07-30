'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../net/types';

const FADE_MS = 7000;
const MAX_VISIBLE = 6;

interface FeedItem extends ChatMessage {
  /** Local dedupe key — server `at` alone can collide across senders. */
  id: string;
  expiresAt: number;
  /** Rendered from RoomState.adminMessage, not the peer-to-peer chat channel. */
  isAdminBroadcast?: boolean;
}

/**
 * Enter opens the chat input (all-chat). Pressing Enter again while the box
 * is still empty switches it to team-chat instead of submitting — matches
 * "press enter twice brings team chat" without relying on a timing window.
 * Typing then Enter submits; Escape cancels. Received messages appear
 * top-left and fade out after a few seconds.
 */
export const LiveChatOverlay: React.FC<{
  registerOnChat: (cb: (msg: ChatMessage) => void) => void;
  sendChat: (text: string, scope: 'all' | 'team') => void;
  /** Suppress the global Enter-to-open listener (e.g. menu/pause/editor open). */
  disabled?: boolean;
  /** RoomState.adminMessage / adminMessageSeq — an admin's Live-dashboard broadcast. */
  adminMessage?: string;
  adminMessageSeq?: number;
}> = ({ registerOnChat, sendChat, disabled = false, adminMessage, adminMessageSeq }) => {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'all' | 'team'>('all');
  const [draft, setDraft] = useState('');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);
  const lastAdminSeqRef = useRef(0);

  useEffect(() => {
    registerOnChat((msg) => {
      idCounter.current += 1;
      const item: FeedItem = {
        ...msg,
        id: `${msg.sessionId}-${msg.at}-${idCounter.current}`,
        expiresAt: performance.now() + FADE_MS,
      };
      setFeed((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
    });
  }, [registerOnChat]);

  // Admin dashboard broadcast — a distinct channel from peer chat (RoomState,
  // not the 'chat' message type), shown the same way but styled and never
  // subject to mute/rate-limit since it's staff-issued.
  useEffect(() => {
    if (!adminMessage || !adminMessageSeq || adminMessageSeq <= lastAdminSeqRef.current) return;
    lastAdminSeqRef.current = adminMessageSeq;
    idCounter.current += 1;
    const item: FeedItem = {
      sessionId: 'admin',
      username: 'Admin',
      text: adminMessage,
      scope: 'all',
      at: Date.now(),
      id: `admin-${adminMessageSeq}-${idCounter.current}`,
      expiresAt: performance.now() + FADE_MS * 1.5,
      isAdminBroadcast: true,
    };
    setFeed((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item]);
  }, [adminMessage, adminMessageSeq]);

  // Sweep expired messages out of the feed.
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now();
      setFeed((prev) => prev.filter((m) => m.expiresAt > now));
    }, 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const closeBox = useCallback(() => {
    setOpen(false);
    setDraft('');
    setScope('all');
  }, []);

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (open) return; // input's own handler covers this while focused
      if (e.key !== 'Enter') return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;
      e.preventDefault();
      setScope('all');
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, disabled]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeBox();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed) {
        // Empty box, second Enter — switch mode instead of sending nothing.
        setScope((prev) => (prev === 'all' ? 'team' : 'all'));
        return;
      }
      sendChat(trimmed, scope);
      closeBox();
    }
  };

  return (
    <div className="absolute top-4 left-4 z-[110] w-[min(360px,80vw)] pointer-events-none select-none">
      <div className="space-y-1 mb-1">
        {feed.map((m) =>
          m.isAdminBroadcast ? (
            <div
              key={m.id}
              className="text-sm bg-rose-600/90 text-white rounded px-2 py-1 font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] leading-snug"
            >
              Admin: {m.text}
            </div>
          ) : (
            <div
              key={m.id}
              className="text-sm text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] leading-snug"
            >
              {m.scope === 'team' && (
                <span className="text-emerald-400 font-semibold">[Team] </span>
              )}
              <span className="font-semibold">{m.username}: </span>
              <span className="text-white/90">{m.text}</span>
            </div>
          )
        )}
      </div>
      {open && (
        <div className="pointer-events-auto flex items-center gap-2 bg-black/70 rounded-md px-2 py-1.5 border border-white/20">
          <span
            className={`text-xs font-bold shrink-0 ${
              scope === 'team' ? 'text-emerald-400' : 'text-white/70'
            }`}
          >
            {scope === 'team' ? 'TEAM' : 'ALL'}
          </span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={closeBox}
            maxLength={240}
            placeholder="Say something…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none min-w-0"
          />
        </div>
      )}
    </div>
  );
};
