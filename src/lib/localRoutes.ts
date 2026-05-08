import { Route } from '@/types';

const KEY = 'theride:gpx_routes';

export function loadLocalRoutes(): Route[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Route[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalRoute(route: Route): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadLocalRoutes();
    const updated = [route, ...existing.filter(r => r.id !== route.id)];
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // localStorage quota exceeded — nothing to do
  }
}

export function deleteLocalRoute(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const updated = loadLocalRoutes().filter(r => r.id !== id);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
