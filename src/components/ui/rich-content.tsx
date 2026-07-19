'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Renders the lightweight markdown produced by RichPostEditor. */
export function RichContent({
  body,
  headerImageUrl,
  className,
}: {
  body: string;
  headerImageUrl?: string | null;
  className?: string;
}) {
  const lines = (body || '').split('\n');

  return (
    <div className={cn('space-y-3 text-slate-300', className)}>
      {headerImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headerImageUrl}
          alt=""
          className="w-full max-h-72 rounded-lg object-cover border border-slate-700/40"
        />
      ) : null}
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        const videoMatch = trimmed.match(/^\[video\]\((.+)\)$/i);
        if (videoMatch) {
          const src = videoMatch[1];
          const yt = youtubeEmbed(src);
          if (yt) {
            return (
              <div
                key={i}
                className="aspect-video w-full overflow-hidden rounded-lg border border-slate-700/40"
              >
                <iframe
                  src={yt}
                  title="Video"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            );
          }
          return (
            <video
              key={i}
              src={src}
              controls
              className="w-full max-h-80 rounded-lg border border-slate-700/40"
            />
          );
        }

        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/);
        if (imgMatch) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={imgMatch[2]}
              alt={imgMatch[1] || ''}
              className="max-h-80 w-full rounded-lg object-cover border border-slate-700/40"
            />
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="text-lg font-bold text-white pt-1">
              {formatInline(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} className="text-xl font-black text-white pt-1">
              {formatInline(trimmed.slice(2))}
            </h2>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <li key={i} className="ml-4 list-disc">
              {formatInline(trimmed.slice(2))}
            </li>
          );
        }

        return (
          <p key={i} className="leading-relaxed whitespace-pre-wrap">
            {formatInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re =
    /(\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*')) {
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (m[2] && m[3]) {
      parts.push(
        <a
          key={key++}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
        >
          {m[2]}
        </a>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
