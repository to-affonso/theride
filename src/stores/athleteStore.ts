'use client';

import { create } from 'zustand';
import { Athlete } from '@/types';

interface AthleteStore {
  athlete: Athlete | null;
  setAthlete: (a: Athlete | null) => void;
  updateAthlete: (patch: Partial<Athlete>) => void;
}

export const useAthleteStore = create<AthleteStore>((set) => ({
  athlete: null,
  setAthlete: (athlete) => set({ athlete }),
  updateAthlete: (patch) => set(s => s.athlete ? { athlete: { ...s.athlete, ...patch } } : {}),
}));
