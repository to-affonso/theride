'use client';

import { create } from 'zustand';
import { AntEngine, AntChannelName, AntChannelStatus } from '@/ble/antEngine';
import { useBleStore } from './bleStore';

export type { AntChannelName, AntChannelStatus };

export interface AntChannels {
  hr:    AntChannelStatus;
  power: AntChannelStatus;
  csc:   AntChannelStatus;
  fec:   AntChannelStatus;
}

interface AntState {
  isSupported: boolean;
  connected:   boolean;
  connecting:  boolean;
  dongleName:  string;
  channels:    AntChannels;
}

interface AntStore extends AntState {
  connect:    () => Promise<void>;
  disconnect: () => void;
}

// Module-level engine instance (not serialized into store state)
let engine: AntEngine | null = null;

const IDLE_CHANNELS: AntChannels = { hr: 'idle', power: 'idle', csc: 'idle', fec: 'idle' };

function ble() {
  return useBleStore.getState();
}

export const useAntStore = create<AntStore>((set, get) => ({
  isSupported: AntEngine.isSupported(),
  connected:   false,
  connecting:  false,
  dongleName:  '',
  channels:    { ...IDLE_CHANNELS },

  connect: async () => {
    if (get().connected || get().connecting) return;
    if (!AntEngine.isSupported()) {
      ble().addLog('Web Serial não suportado. Use Chrome 89+ ou Edge 89+.', 'error');
      return;
    }
    set({ connecting: true, channels: { ...IDLE_CHANNELS } });

    engine = new AntEngine({
      onHR: (bpm) => {
        ble().updateMetric('hr', bpm, 'ant');
      },
      onPower: (watts, cadence) => {
        ble().updateMetric('power', watts, 'ant');
        if (cadence !== undefined) ble().updateMetric('cadence', cadence, 'ant');
      },
      onCSC: (cadence) => {
        ble().updateMetric('cadence', cadence, 'ant');
      },
      onFEC: (watts, cadence) => {
        ble().updateMetric('power', watts, 'ant');
        if (cadence !== undefined) ble().updateMetric('cadence', cadence, 'ant');
      },
      onChannelUpdate: (ch: AntChannelName, status: AntChannelStatus) => {
        set(s => ({ channels: { ...s.channels, [ch]: status } }));
      },
      onLog: (msg, type) => {
        ble().addLog(`[ANT+] ${msg}`, type);
      },
      onConnect: (name) => {
        set({ connected: true, connecting: false, dongleName: name });
      },
      onDisconnect: () => {
        set({ connected: false, connecting: false, dongleName: '', channels: { ...IDLE_CHANNELS } });
        engine = null;
      },
    });

    await engine.connect();

    // If onConnect was never called (user cancelled), reset
    if (!get().connected) {
      set({ connecting: false });
      engine = null;
    }
  },

  disconnect: () => {
    engine?.disconnect();
  },
}));
