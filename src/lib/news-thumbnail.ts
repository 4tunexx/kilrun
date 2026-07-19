/**
 * Resolve a thumbnail for news list cards:
 * 1) header image if set
 * 2) first embedded markdown image in the body (![alt](url))
 * 3) null — no thumbnail
 */
export function resolveNewsThumbnail(
  headerImageUrl?: string | null,
  body?: string | null
): string | null {
  const header = headerImageUrl?.trim();
  if (header) return header;

  const text = body ?? '';
  const match = text.match(/!\[([^\]]*)\]\(([^)\s]+)\)/);
  const embedded = match?.[2]?.trim();
  if (embedded && /^https?:\/\//i.test(embedded)) return embedded;

  return null;
}
