/**
 * Map a route's type/elevation to a Portuguese category badge.
 *
 * Four categories, each with a tone class consumed by `.route-badge`:
 *   - Plana  → endurance/recovery routes, or anything with elevation < 200 m
 *   - Subida → climb routes, or elevation > 600 m
 *   - Mista  → hills, or 200 ≤ elevation ≤ 600 m
 *   - Sprint → explicitly Sprint type
 */

import type { Route } from '@/types';

export interface RouteBadge {
  label: 'Plana' | 'Subida' | 'Mista' | 'Sprint';
  tone:  'flat' | 'climb' | 'mixed' | 'sprint';
}

export function routeBadge(r: Route): RouteBadge {
  if (r.type === 'Sprint')                                 return { label: 'Sprint', tone: 'sprint' };
  if (r.type === 'Climb' || r.elevation_m >  600)          return { label: 'Subida', tone: 'climb'  };
  if (r.type === 'Recovery' || r.type === 'Endurance' || r.elevation_m < 200)
                                                            return { label: 'Plana',  tone: 'flat'   };
  return { label: 'Mista', tone: 'mixed' };
}
