'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBleStore } from '@/stores/bleStore';
import { useAthleteStore } from '@/stores/athleteStore';
import { useAntStore } from '@/stores/antStore';
import { createClient } from '@/lib/supabase/client';
import { Icons } from '@/components/icons';
import { DeviceType } from '@/types';

const DEVICE_TYPES: { id: DeviceType; kind: string; sub: string }[] = [
  { id: 'trainer', kind: 'Smart Trainer',      sub: 'FTMS / Cycling Power · potência, cadência e velocidade' },
  { id: 'cadence', kind: 'Sensor de Cadência', sub: 'CSC / Cycling Power · cadência (opcional se o trainer já fornece)' },
  { id: 'hr',      kind: 'Monitor Cardíaco',   sub: 'Heart Rate Service · frequência cardíaca' },
];

const LOG_COLORS = { success: 'var(--ok)', error: 'var(--warn)', warn: '#FF9F43', info: 'var(--fg-3)' };

const DEVICE_ICON = { trainer: Icons.Trainer, cadence: Icons.Cadence, hr: Icons.Heart };

const ACCENT = '#D5FF00';

const ANT_CHANNEL_LABEL: Record<string, string> = {
  hr: 'HR', power: 'Potência', csc: 'Cadência', fec: 'FE-C'
};

const STATUS_DOT: Record<string, string> = {
  idle: 'off', searching: 'warn', found: ''
};

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-3)',
  border: '1px solid var(--line-soft)',
  borderRadius: 4,
  padding: '2px 6px',
  color: 'var(--fg)',
  fontSize: 12,
  fontFamily: "'JetBrains Mono'",
  width: 110,
  outline: 'none',
};

export default function PairPage() {
  const router     = useRouter();
  const connect    = useBleStore(s => s.connect);
  const disconnect = useBleStore(s => s.disconnect);
  const devices    = useBleStore(s => s.devices);
  const deviceConfig = useBleStore(s => s.deviceConfig);
  const isSupported = useBleStore(s => s.isSupported);
  const ergEnabled = useBleStore(s => s.ergEnabled);
  const ftp        = useBleStore(s => s.ftp);
  const weight     = useBleStore(s => s.weight);
  const setFtp     = useBleStore(s => s.setFtp);
  const setWeight  = useBleStore(s => s.setWeight);
  const log        = useBleStore(s => s.log);
  const athlete      = useAthleteStore(s => s.athlete);
  const updateAthlete = useAthleteStore(s => s.updateAthlete);

  const antConnect    = useAntStore(s => s.connect);
  const antDisconnect = useAntStore(s => s.disconnect);
  const antConnected  = useAntStore(s => s.connected);
  const antConnecting = useAntStore(s => s.connecting);
  const antSupported  = useAntStore(s => s.isSupported);
  const antDongle     = useAntStore(s => s.dongleName);
  const antChannels   = useAntStore(s => s.channels);

  const connectedCount = Object.values(devices).filter(d => d.connected).length + (antConnected ? 1 : 0);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', ftp: '', max_hr: '', weight: '', bike: '' });

  function startEdit() {
    setDraft({
      name:   athlete?.name          ?? '',
      ftp:    String(athlete?.ftp    ?? ftp),
      max_hr: String(athlete?.max_hr ?? 189),
      weight: String(athlete?.weight ?? weight),
      bike:   athlete?.bike          ?? '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!athlete) return;
    const patch = {
      name:   draft.name.trim() || athlete.name,
      ftp:    Math.max(1, parseInt(draft.ftp,    10) || athlete.ftp),
      max_hr: Math.max(1, parseInt(draft.max_hr, 10) || athlete.max_hr),
      weight: Math.max(1, parseFloat(draft.weight)   || athlete.weight),
      bike:   draft.bike.trim(),
    };
    const supabase = createClient();
    const { error } = await supabase.from('athletes').update(patch).eq('id', athlete.id);
    if (!error) {
      updateAthlete(patch);
      setFtp(patch.ftp);
      setWeight(patch.weight);
    }
    setEditing(false);
  }

  function handleDeviceClick(id: DeviceType) {
    if (devices[id].connected)  { disconnect(id); return; }
    if (devices[id].connecting) return;
    connect(id);
  }

  return (
    <div className="screen">
      <div className="pair">

        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="pair-left">
          {!isSupported && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:8,
              background:'rgba(255,90,31,0.08)', border:'1px solid rgba(255,90,31,0.25)',
              fontSize:12, color:'var(--warn)', marginBottom:4 }}>
              <Icons.Bluetooth size={14} c="var(--warn)"/>
              Web Bluetooth não suportado. Use Google Chrome ou Microsoft Edge no desktop.
            </div>
          )}

          <div>
            <h1 className="h1">Conecte seus dispositivos.</h1>
            <p className="lede" style={{ marginTop:8 }}>
              Selecione os sensores que deseja utilizar. Mantenha-os ativos durante o pareamento —
              pedale levemente para ativar medidores de potência e cadência.
            </p>
          </div>

          <div className="device-grid">
            {DEVICE_TYPES.map(dt => {
              const d   = devices[dt.id];
              const Ico = DEVICE_ICON[dt.id];
              const cfg = deviceConfig[dt.id];
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
                        ? { background:'#1F1F1F', borderColor:ACCENT, color:ACCENT }
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
                    <div className="device-status">
                      <span className={`dot ${d.connected ? '' : d.connecting ? 'warn' : 'off'}`}/>
                      {d.connected ? 'Conectado' : d.connecting ? 'Procurando...' : 'Desconectado'}
                    </div>
                  </div>

                  <div className="device-actions">
                    <div className="device-meta">
                      {d.connected
                        ? <span style={{ fontSize:11, color:'var(--accent-2)' }}>Clique para desconectar</span>
                        : <span style={{ fontSize:11, color:'var(--fg-3)' }}>Clique para conectar via BLE</span>}
                    </div>
                    <div className="protocol">
                      {cfg.protocols.map(p =>
                        <span key={p} className={d.connected ? 'on' : ''}>{p}</span>
                      )}
                    </div>
                  </div>

                  {d.connecting && <div className="scanning-bar"/>}
                </div>
              );
            })}

            {/* ANT+ card */}
            <div
              className={`device ${antConnected ? 'connected' : ''} ${antConnecting ? 'scanning' : ''}`}
              onClick={() => antSupported && (antConnected ? antDisconnect() : !antConnecting && antConnect())}
              style={{ cursor: antSupported ? 'pointer' : 'not-allowed', opacity: antSupported ? 1 : 0.5 }}
            >
              <div className="device-head">
                <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                  <div className="device-icon" style={antConnected
                    ? { background:'#1F1F1F', borderColor:ACCENT, color:ACCENT }
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

              {/* Channel status when connected */}
              {antConnected && (
                <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                  {(Object.entries(antChannels) as [string, string][]).map(([ch, status]) => (
                    <div key={ch} style={{
                      display:'flex', alignItems:'center', gap:4,
                      fontSize:10, fontFamily:"'JetBrains Mono'", letterSpacing:'0.08em',
                      color: status === 'found' ? ACCENT : status === 'searching' ? '#FF9F43' : 'var(--fg-3)',
                    }}>
                      <span className={`dot ${STATUS_DOT[status]}`} style={{ width:5, height:5 }}/>
                      {ANT_CHANNEL_LABEL[ch]}
                    </div>
                  ))}
                </div>
              )}

              {antConnecting && <div className="scanning-bar"/>}
            </div>
          </div>

          {/* System log */}
          {log.length > 0 && (
            <div style={{ marginTop:'auto', paddingTop:16, borderTop:'1px solid var(--line-soft)' }}>
              <div style={{ fontFamily:"'JetBrains Mono'", fontSize:9.5, letterSpacing:'0.14em',
                textTransform:'uppercase', color:'var(--fg-3)', marginBottom:8 }}>
                Log do sistema
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {log.slice(0, 7).map((entry, i) => (
                  <div key={i} style={{ display:'flex', gap:12, fontSize:11, fontFamily:"'JetBrains Mono'", lineHeight:1.4 }}>
                    <span style={{ color:'var(--fg-3)', flexShrink:0 }}>{entry.t}</span>
                    <span style={{ color: LOG_COLORS[entry.type] || 'var(--fg-3)' }}>{entry.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="pair-right">
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <h3 style={{ margin:0 }}>Usuário</h3>
            {athlete && (
              editing ? (
                <>
                  <button
                    onClick={saveEdit}
                    title="Salvar"
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ok)', padding:4, display:'flex', alignItems:'center' }}
                  >
                    <Icons.Check size={14} c="var(--ok)"/>
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--fg-3)', padding:4, fontSize:11, fontFamily:"'JetBrains Mono'" }}
                  >
                    cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={startEdit}
                  title="Editar perfil"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--fg-3)', padding:4, display:'flex', alignItems:'center' }}
                >
                  <Icons.Pencil size={13}/>
                </button>
              )
            )}
          </div>
          <div className="summary-list">
            <div className="summary-item">
              <span className="lbl">Nome</span>
              {editing
                ? <input type="text" value={draft.name} onChange={e => setDraft(d => ({...d, name: e.target.value}))} style={INPUT_STYLE}/>
                : <span className="val">{athlete?.name || '—'}</span>}
            </div>
            <div className="summary-item">
              <span className="lbl">FTP</span>
              {editing
                ? <input type="number" min={1} value={draft.ftp} onChange={e => setDraft(d => ({...d, ftp: e.target.value}))} style={INPUT_STYLE}/>
                : <span className="val">{athlete?.ftp ?? ftp} W</span>}
            </div>
            <div className="summary-item">
              <span className="lbl">FCmáx</span>
              {editing
                ? <input type="number" min={1} value={draft.max_hr} onChange={e => setDraft(d => ({...d, max_hr: e.target.value}))} style={INPUT_STYLE}/>
                : <span className="val">{athlete?.max_hr ?? 189} bpm</span>}
            </div>
            <div className="summary-item">
              <span className="lbl">Peso</span>
              {editing
                ? <input type="number" min={1} step={0.1} value={draft.weight} onChange={e => setDraft(d => ({...d, weight: e.target.value}))} style={INPUT_STYLE}/>
                : <span className="val">{athlete?.weight ?? weight} kg</span>}
            </div>
            <div className="summary-item">
              <span className="lbl">Bicicleta</span>
              {editing
                ? <input type="text" value={draft.bike} onChange={e => setDraft(d => ({...d, bike: e.target.value}))} style={INPUT_STYLE} placeholder="Nome da bike"/>
                : <span className="val">{athlete?.bike || 'Não definida'}</span>}
            </div>
          </div>

          <h3 style={{ marginTop:8 }}>Status do pareamento</h3>
          <div style={{ padding:'18px 18px 16px', background:'var(--bg)', border:'1px solid var(--line-soft)', borderRadius:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10 }}>
              <div style={{ fontFamily:"'Inter'", fontSize:32, fontWeight:600, letterSpacing:'-0.02em' }}>
                {connectedCount}
                <span style={{ fontSize:16, color:'var(--fg-3)', fontWeight:500 }}> / {DEVICE_TYPES.length + 1}</span>
              </div>
              <div style={{ fontFamily:"'JetBrains Mono'", fontSize:10.5, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--fg-3)' }}>
                conectados
              </div>
            </div>
            <div style={{ height:6, background:'var(--bg-3)', borderRadius:3, overflow:'hidden' }}>
              <div style={{
                height:'100%',
                width:`${(connectedCount / (DEVICE_TYPES.length + 1)) * 100}%`,
                background: ACCENT,
                transition:'width 0.4s',
              }}/>
            </div>
            <div style={{ marginTop:12, fontSize:12, color:'var(--fg-2)', lineHeight:1.5 }}>
              {connectedCount >= DEVICE_TYPES.length
                ? 'Tudo pronto. Você pode iniciar a pedalada.'
                : connectedCount > 0
                  ? 'Sensores parcialmente conectados. Continue ou adicione mais.'
                  : 'Conecte ao menos um sensor para iniciar.'}
              {ergEnabled && (
                <span style={{ display:'inline-block', marginLeft:8, fontSize:10, fontFamily:"'JetBrains Mono'",
                  letterSpacing:'0.1em', textTransform:'uppercase', color:ACCENT }}>
                  · ERG ativo
                </span>
              )}
            </div>
          </div>

          <div className="footer-actions" style={{ justifyContent:'flex-end' }}>
            <button className="btn primary lg" onClick={() => router.push('/route')}>
              Voltar para início <Icons.Arrow size={14} c="#0A0A0A"/>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
