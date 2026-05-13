import { redirect } from 'next/navigation';

/**
 * Legacy URL — `/pair` was renamed to `/settings` in migration 002.
 * Kept as a permanent redirect so old bookmarks/links keep working.
 */
export default function PairLegacyRedirect() {
  redirect('/settings');
}
