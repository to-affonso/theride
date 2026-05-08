'use client';

import { create } from 'zustand';
import { Route } from '@/types';
import { GpxPoint } from '@/lib/gpx';

interface RouteStore {
  routes: Route[];
  selectedRoute: Route | null;
  gpxPoints: GpxPoint[] | null;
  setRoutes: (routes: Route[]) => void;
  selectRoute: (route: Route | null) => void;
  setGpxPoints: (points: GpxPoint[] | null) => void;
}

export const useRouteStore = create<RouteStore>((set) => ({
  routes: [],
  selectedRoute: null,
  gpxPoints: null,
  setRoutes:    (routes) => set({ routes }),
  selectRoute:  (route)  => set({ selectedRoute: route }),
  setGpxPoints: (points) => set({ gpxPoints: points }),
}));
