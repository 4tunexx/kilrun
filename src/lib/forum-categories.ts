export const FORUM_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'off-topic', label: 'Off Topic' },
  { id: 'deathrun', label: 'Deathrun' },
  { id: 'guides', label: 'Guides & Tips' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'looking-for-group', label: 'Looking for Group' },
] as const;

export type ForumCategoryId = (typeof FORUM_CATEGORIES)[number]['id'];

export function normalizeForumCategory(raw?: string | null): ForumCategoryId {
  const id = (raw || 'general').toLowerCase().trim();
  return (
    FORUM_CATEGORIES.find((c) => c.id === id)?.id ?? 'general'
  );
}
