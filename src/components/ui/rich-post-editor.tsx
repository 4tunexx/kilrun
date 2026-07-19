'use client';

import { useRef } from 'react';
import {
  Bold,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Lightweight BB-forum style editor — stores markdown-ish body + optional header image. */
export function RichPostEditor({
  body,
  onBodyChange,
  headerImageUrl,
  onHeaderImageChange,
  placeholder = 'Write your post…',
  className,
  minHeightClass = 'min-h-[160px]',
}: {
  body: string;
  onBodyChange: (value: string) => void;
  headerImageUrl?: string;
  onHeaderImageChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeightClass?: string;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const wrap = (before: string, after = before) => {
    const el = areaRef.current;
    if (!el) {
      onBodyChange(`${before}${body}${after}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || 'text';
    const next =
      body.slice(0, start) + before + selected + after + body.slice(end);
    onBodyChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length + after.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const insertBlock = (block: string) => {
    const el = areaRef.current;
    const start = el?.selectionStart ?? body.length;
    const prefix = start > 0 && body[start - 1] !== '\n' ? '\n' : '';
    const next = body.slice(0, start) + prefix + block + '\n' + body.slice(start);
    onBodyChange(next);
  };

  const askUrl = (label: string) => {
    if (typeof window === 'undefined') return null;
    const url = window.prompt(label);
    return url?.trim() || null;
  };

  return (
    <div className={cn('space-y-2', className)}>
      {onHeaderImageChange && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Header image URL</Label>
          <Input
            value={headerImageUrl || ''}
            onChange={(e) => onHeaderImageChange(e.target.value)}
            placeholder="https://… (optional hero image)"
            className="bg-slate-900/50 border-slate-700"
          />
          {headerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerImageUrl}
              alt=""
              className="mt-2 max-h-40 w-full rounded-md object-cover border border-slate-700/50"
            />
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-md border border-slate-700/50 bg-slate-900/40 p-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Bold"
          onClick={() => wrap('**', '**')}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Italic"
          onClick={() => wrap('*', '*')}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Heading"
          onClick={() => insertBlock('## Heading')}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="List"
          onClick={() => insertBlock('- Item')}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Link"
          onClick={() => {
            const url = askUrl('Link URL');
            if (url) wrap('[', `](${url})`);
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Image"
          onClick={() => {
            const url = askUrl('Image URL');
            if (url) insertBlock(`![image](${url})`);
          }}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          title="Video"
          onClick={() => {
            const url = askUrl('Video URL (YouTube / direct mp4)');
            if (url) insertBlock(`[video](${url})`);
          }}
        >
          <Video className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Textarea
        ref={areaRef}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'bg-slate-900/50 border-slate-700 font-mono text-sm',
          minHeightClass
        )}
      />
      <p className="text-[11px] text-slate-500">
        Supports **bold**, *italic*, headings, images, links, and [video](url).
      </p>
    </div>
  );
}
