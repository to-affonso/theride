'use client';

/**
 * Configurações — central settings page (formerly /pair).
 *
 * Four sections (each is a `.settings-section` with a left description column
 * and a right control column):
 *
 *   1. Conecte seus dispositivos — BLE + ANT+ pairing (essential + complementary)
 *   2. Configure seu perfil      — name, weight, birth_date, bike, ftp
 *   3. Zonas cardíacas           — FCmáx input + draggable 7-zone slider
 *   4. Experiência em treino     — power smoothing, auto-lap defaults
 *
 * Changes save on blur / commit and persist to the `athletes` row in Supabase.
 */

import { useEffect, useMemo } from 'react';
import { useBleStore } from '@/stores/bleStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { useAntStore } from '@/stores/antStore';
import { createClient } from '@/lib/supabase/client';
import { Icons } from '@/components/icons';
import { DeviceType, Athlete, PowerSmoothingSeconds } from '@/types';
import { BatteryIndicator } from '@/components/pair/BatteryIndicator';
import { SpindownModal } from '@/components/pair/SpindownModal';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { HrZoneSlider } from '@/components/settings/HrZoneSlider';
import { ageFromBirthDate } from '@/lib/age';
import { DEFAULT_HR_ZONE_BOUNDS } from '@/lib/zones';

// ── Device taxonomy (mirrors the old /pair page) ─────────────────────────────
const ESSENTIAL: { id: DeviceType; kind: string; sub: string }[] = [
  { id: 'trainer', kind: 'Smart Trainer', sub: 'FTMS · Cycling Power · potência, cadência e velocidade' },
];
const COMPLEMENTARY: { id: DeviceType; kind: string; sub: string }[] = [
  { id: 'cadence', kind: 'Sensor de Cadência',   sub: 'CSC / Cycling Power · cadência (opcional se o trainer já fornece)' },
  { id: 'speed',   kind: 'Sensor de Velocidade', sub: 'CSC · velocidade (opcional se o trainer já fornece)' },
  { id: 'hr',      kind: 'Monitor Cardíaco',     sub: 'Heart Rate Service · frequência cardíaca' },
];
const DEVICE_ICON = { trainer: Icons.Trainer, cadence: Icons.Cadence, speed: Icons.Speed, hr: Icons.Heart };
const ACCENT = '#D5FF00';

const SMOOTHING_OPTIONS: PowerSmoothingSeconds[] = [1, 3, 5, 10];

export default function SettingsPage() {
  // ── BLE state ─────────────────────────────────────────────────────────
  const connect       = useBleStore(s => s.connect);
  const disconnect    = useBleStore(s => s.disconnect);
  const autoReconnect = useBleStore(s => s.autoReconnect);
  const devices       = useBleStore(s => s.devices);
  const battery       = useBleStore(s => s.battery);
  const deviceConfig  = useBleStore(s => s.deviceConfig);
  const isSupported   = useBleStore(s => s.isSupported);
  const ergEnabled    = useBleStore(s => s.ergEnabled);
  const openSpindown  = useBleStore(s => s.openSpindown);
  const setBleFtp     = useBleStore(s => s.setFtp);
  const setBleWeight  = useBleStore(s => s.setWeight);
  const setBleSmoothing = useBleStore(s => s.setSmoothingSeconds);
  const setBleAutoLapKm = useBleStore(s => s.setAutoLapKm);

  const antConnect    = useAntStore(s => s.connect);
  const antDisconnect = useAntStore(s => s.disconnect);
  const antConnected  = useAntStore(s => s.connected);
  const antConnecting = useAntStore(s => s.connecting);
  const antSupported  = useAntStore(s => s.isSupported);
  const antDongle     = useAntStore(s => s.dongleName);

  // ── Athlete ───────────────────────────────────────────────────────────
  const athlete       = useAthleteStore(s => s.athlete);
  const updateAthlete = useAthleteStore(s => s.updateAthlete);

  // Sprint 6: silently re-pair known devices on mount.
  useEffect(() => {
    if (isSupported) autoReconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  // ── Persistence helper ────────────────────────────────────────────────
  async function persist(patch: Partial<Athlete>) {
    if (!athlete) return;
    updateAthlete(patch);
    const { error } = await createClient().from('athletes').update(patch).eq('id', athlete.id);
    if (error) console.error('Falha ao salvar configuração:', error.message);
  }

  function handleDeviceClick(id: DeviceType) {
    if (devices[id].connected)  { disconnect(id); return; }
    if (devices[id].connecting) return;
    connect(id);
  }

  // ── Field commits ─────────────────────────────────────────────────────
  const commitName = (v: string) => persist({ name: v.trim() || athlete?.name || '' });
  const commitWeight = (v: string) => {
    const n = parseFloat(v); if (!isFinite(n) || n <= 0) return;
    persist({ weight: n }); setBleWeight(n);
  };
  const commitBirthDate = (v: string) => {
    persist({ birth_date: v || null });
  };
  const commitBike = (v: string) => persist({ bike: v.trim() });
  const commitFtp = (v: string) => {
    const n = parseInt(v, 10); if (!isFinite(n) || n <= 0) return;
    persist({ ftp: n }); setBleFtp(n);
  };
  const commitMaxHr = (v: string) => {
    const n = parseInt(v, 10); if (!isFinite(n) || n <= 0) return;
    persist({ max_hr: n });
  };
  const commitHrZones = (next: number[]) => {
    persist({ hr_zones: next });
  };
  const commitSmoothing = (s: PowerSmoothingSeconds) => {
    setBleSmoothing(s);
    persist({ power_smoothing_seconds: s });
  };
  const commitAutoLapEnabled = (enabled: boolean) => {
    persist({ auto_lap_enabled: enabled });
    setBleAutoLapKm(enabled ? Number(athlete?.auto_lap_distance_km ?? 5) : null);
  };
  const commitAutoLapDistance = (v: string) => {
    const n = parseFloat(v); if (!isFinite(n) || n <= 0) return;
    persist({ auto_lap_distance_km: n });
    if (athlete?.auto_lap_enabled !== false) setBleAutoLapKm(n);
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const age = useMemo(() => ageFromBirthDate(athlete?.birth_date), [athlete?.birth_date]);
  const hrBounds = athlete?.hr_zones && athlete.hr_zones.length === 6
    ? athlete.hr_zones
    : [...DEFAULT_HR_ZONE_BOUNDS];

  // ── Device card renderer ──────────────────────────────────────────────
  function renderDeviceCard(dt: { id: DeviceType; kind: string; sub: string }) {
    const d   = devices[dt.id];
    const Ico = DEVICE_ICON[dt.id];
    const cfg = deviceConfig[dt.id];
    const bat = battery[dt.id];
    return (
      <div
        key={dt.id}
        className={`device ${d.connected ? 'connected' : ''} ${d.connecting ? 'scanning' : ''}`}
        onClick={() => isSupported && handleDeviceClick(dt.id)}
        style={{ cursor: isSupported ? 'pointer' : 'not-allowed', opacity: isSupported ? 1 : 0.5 }}
      >
        <div className="device-head">
          <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
            <div className="device-icon" style={d.connected
              ? { background:'#1F1F1F', borderColor: ACCENT, color: ACCENT }
              : { color:'var(--fg-2)' }}>
              <Ico size={20} c={d.connected ? ACCENT : 'currentColor'}/>
            </div>
            <div>
              <div className="device-name">
                {d.connected ? d.name : d.connecting ? 'Conectando...' : dt.kind}
              </div>
              <div className="device-sub">{dt.kind} · {dt.sub}</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {d.connected && bat != null && <BatteryIndicator percent={bat}/>}
            <div className="device-status">
              <span className={`dot ${d.connected ? '' : d.connecting ? 'warn' : 'off'}`}/>
              {d.connected ? 'Conectado' : d.connecting ? 'Procurando...' : 'Desconectado'}
            </div>
          </div>
        </div>
        <div className="device-actions">
          <div className="device-meta">
            {d.connected
              ? <span style={{ fontSize:11, color:'var(--accent-2)' }}>Clique para desconectar</span>
              : <span style={{ fontSize:11, color:'var(--fg-3)' }}>Clique para conectar via BLE</span>}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {dt.id === 'trainer' && d.connected && ergEnabled && (
              <button
                className="spindown-btn"
                onClick={(e) => { e.stopPropagation(); openSpindown(); }}
                title="Calibração spindown (FTMS)"
              >
                <Icons.Settings size={12}/> Calibrar
              </button>
            )}
            <div className="protocol">
              {cfg.protocols.map(p => <span key={p} className={d.connected ? 'on' : ''}>{p}</span>)}
            </div>
          </div>
        </div>
        {d.connecting && <div className="scanning-bar"/>}
      </div>
    );
  }

  return (
    <div className="screen settings-screen">
      <div className="settings-header">
        <h1 className="h1">Configurações</h1>
        <p className="lede">Para uma melhor experiência realize as configurações abaixo.</p>
      </div>

      {/* ── 1. Conecte seus dispositivos ─────────────────────────────── */}
      <section className="settings-section">
        <div className="settings-section-aside">
          <h2 className="settings-section-title">Conecte seus dispositivos</h2>
          <p className="settings-section-desc">
            Selecione os sensores que deseja utilizar. Mantenha-os ativos durante o pareamento —
            pedale levemente para ativar medidores de potência e cadência.
          </p>
        </div>
        <div className="settings-section-main">
          <div className="device-group-label">
            <span>Essencial</span>
            <span className="device-group-hint">Obrigatório para iniciar uma sessão</span>
          </div>
          <div className="device-grid device-grid-full">
            {ESSENTIAL.map(renderDeviceCard)}
          </div>

          <div className="device-group-label" style={{ marginTop: 20 }}>
            <span>Complementares</span>
            <span className="device-group-hint">Opcional — adicionam mais dados ao seu treino</span>
          </div>
          <div className="device-grid device-grid-2">
            {COMPLEMENTARY.map(renderDeviceCard)}

            {/* ANT+ */}
            <div
              className={`device ${antConnected ? 'connected' : ''} ${antConnecting ? 'scanning' : ''}`}
              onClick={() => antSupported && (antConnected ? antDisconnect() : !antConnecting && antConnect())}
              style={{ cursor: antSupported ? 'pointer' : 'not-allowed', opacity: antSupported ? 1 : 0.5 }}
            >
              <div className="device-head">
                <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div className="device-icon" style={antConnected
                    ? { background:'#1F1F1F', borderColor: ACCENT, color: ACCENT }
                    : { color:'var(--fg-2)' }}>
                    <Icons.Bluetooth size={20} c={antConnected ? ACCENT : 'currentColor'}/>
                  </div>
                  <div>
                    <div className="device-name">
                      {antConnected ? antDongle : antConnecting ? 'Conectando...' : 'Dongle ANT+'}
                    </div>
                    <div className="device-sub">
                      {antSupported
                        ? 'Web Serial · HR · Potência · Cadência · FE-C'
                        : 'Web Serial não suportado neste browser'}
                    </div>
                  </div>
                </div>
                <div className="device-status">
                  <span className={`dot ${antConnected ? '' : antConnecting ? 'warn' : 'off'}`}/>
                  {antConnected ? 'Conectado' : antConnecting ? 'Procurando...' : 'Desconectado'}
                </div>
              </div>
              <div className="device-actions">
                <div className="device-meta">
                  {antConnected
                    ? <span style={{ fontSize:11, color:'var(--accent-2)' }}>Clique para desconectar</span>
                    : <span style={{ fontSize:11, color:'var(--fg-3)' }}>
                        {antSupported ? 'Clique para conectar via USB' : 'Use Chrome 89+ ou Edge 89+'}
                      </span>}
                </div>
                <div className="protocol">
                  {(['ANT+', 'Serial'] as string[]).map(p =>
                    <span key={p} className={antConnected ? 'on' : ''}>{p}</span>
                  )}
                </div>
              </div>
              {antConnecting && <div className="scanning-bar"/>}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Configure seu perfil ──────────────────────────────────── */}
      <section className="settings-section">
        <div className="settings-section-aside">
          <h2 className="settings-section-title">Configure seu perfil</h2>
          <p className="settings-section-desc">
            Preencha os dados de seu perfil. As informações são utilizadas para uma melhor configuração de seu treinamento.
          </p>
        </div>
        <div className="settings-section-main">
          <SettingsRow
            label="Nome"
            display={athlete?.name || '—'}
            value={athlete?.name}
            onCommit={commitName}
          />
          <SettingsRow
            label="Peso"
            display={athlete ? `${athlete.weight} kg` : '—'}
            value={athlete?.weight}
            onCommit={commitWeight}
            type="number" min={1} step={0.1} unit="kg"
          />
          <SettingsRow
            label="Idade"
            display={age != null ? `${age} anos` : '—'}
            value={athlete?.birth_date ?? ''}
            onCommit={commitBirthDate}
            type="date"
            inputWidth={180}
          />
          <SettingsRow
            label="Bicicleta"
            display={athlete?.bike || '—'}
            value={athlete?.bike}
            onCommit={commitBike}
            placeholder="Nome da bike"
          />
          <SettingsRow
            label="FTP"
            display={athlete ? `${athlete.ftp} W` : '—'}
            value={athlete?.ftp}
            onCommit={commitFtp}
            type="number" min={1} unit="W"
          />
        </div>
      </section>

      {/* ── 3. Zonas cardíacas ───────────────────────────────────────── */}
      <section className="settings-section">
        <div className="settings-section-aside">
          <h2 className="settings-section-title">Zonas cardíacas</h2>
          <p className="settings-section-desc">
            Insira sua frequência cardíaca máxima. As zonas cardíacas são calculadas automaticamente,
            mas você pode editar caso ache necessário.
          </p>
        </div>
        <div className="settings-section-main">
          <SettingsRow
            label="FCmáx"
            display={athlete ? `${athlete.max_hr} bpm` : '—'}
            value={athlete?.max_hr}
            onCommit={commitMaxHr}
            type="number" min={1} unit="bpm"
          />
          <div className="settings-row-static">
            <HrZoneSlider
              bounds={hrBounds}
              maxHr={athlete?.max_hr ?? 0}
              onChange={commitHrZones}
            />
          </div>
        </div>
      </section>

      {/* ── 4. Experiência em treino ─────────────────────────────────── */}
      <section className="settings-section">
        <div className="settings-section-aside">
          <h2 className="settings-section-title">Experiência em treino</h2>
          <p className="settings-section-desc">
            Defina as configurações ao lado para ajustar sua experiência durante a realização dos treinos.
          </p>
        </div>
        <div className="settings-section-main">
          <div className="settings-row settings-row-static">
            <span className="settings-row-label">Frequência de atualizações da potência</span>
            <span className="settings-row-value seg-row">
              {SMOOTHING_OPTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`seg-btn ${athlete?.power_smoothing_seconds === s ? 'active' : ''}`}
                  onClick={() => commitSmoothing(s)}
                >
                  {s} seg
                </button>
              ))}
            </span>
          </div>

          <div className="settings-row settings-row-static">
            <span className="settings-row-label">Voltas</span>
            <span className="settings-row-value seg-row">
              <button
                type="button"
                className={`seg-btn ${athlete?.auto_lap_enabled ? 'active' : ''}`}
                onClick={() => commitAutoLapEnabled(true)}
              >
                Automático
              </button>
              <button
                type="button"
                className={`seg-btn ${!athlete?.auto_lap_enabled ? 'active' : ''}`}
                onClick={() => commitAutoLapEnabled(false)}
              >
                Manual
              </button>
            </span>
          </div>

          {athlete?.auto_lap_enabled && (
            <SettingsRow
              label="Distância das voltas"
              display={`${athlete.auto_lap_distance_km} km`}
              value={athlete.auto_lap_distance_km}
              onCommit={commitAutoLapDistance}
              type="number" min={0.1} max={100} step={0.1} unit="km"
            />
          )}
        </div>
      </section>

      <SpindownModal/>
    </div>
  );
}
