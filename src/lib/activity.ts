import type { ActivityItem } from '../api/types';

/** Pages can overlap when new items arrive between requests; keep the first copy of each id. */
export function dedupeById(pages: ActivityItem[][]): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const page of pages) for (const it of page) if (!seen.has(it.id)) (seen.add(it.id), out.push(it));
  return out;
}
