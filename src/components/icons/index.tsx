interface IconProps { size?: number; c?: string; }

function Trainer({ size = 20, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14" r="6"/>
      <path d="M12 14V6m-3 0h6"/>
      <path d="M5 20h14"/>
    </svg>
  );
}

function Cadence({ size = 20, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 4v3m0 10v3m8-8h-3m-10 0H4"/>
      <path d="M12 12l4-2.5"/>
    </svg>
  );
}

function Speed({ size = 20, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18a9 9 0 1118 0"/>
      <path d="M12 18l4-5"/>
      <circle cx="12" cy="18" r="1.2" fill={c}/>
    </svg>
  );
}

function Heart({ size = 20, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 8.6a5 5 0 00-8.8-3.2A5 5 0 003.2 8.6c0 5.6 8.8 10.4 8.8 10.4s8.8-4.8 8.8-10.4z"/>
    </svg>
  );
}

function Power({ size = 20, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"/>
    </svg>
  );
}

function Bluetooth({ size = 14, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7l10 10-5 5V2l5 5L7 17"/>
    </svg>
  );
}

function Pin({ size = 14, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/>
      <circle cx="12" cy="9" r="2.2"/>
    </svg>
  );
}

function Play({ size = 18, c = 'currentColor' }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={c}><path d="M7 5l13 7-13 7z"/></svg>;
}

function Pause({ size = 18, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={c}>
      <rect x="6" y="5" width="4.5" height="14" rx="1"/>
      <rect x="13.5" y="5" width="4.5" height="14" rx="1"/>
    </svg>
  );
}

function Stop({ size = 14, c = 'currentColor' }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={c}><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>;
}

function Plus({ size = 14, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

function Search({ size = 14, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>
    </svg>
  );
}

function Arrow({ size = 14, c = 'currentColor', dir = 'right' }: IconProps & { dir?: 'right' | 'left' | 'up' | 'down' }) {
  const rot = { right: 0, left: 180, up: -90, down: 90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  );
}

function Settings({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>
    </svg>
  );
}

function Pencil({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 2.5a2.121 2.121 0 013 3L7 17l-4 1 1-4 11.5-11.5z"/>
    </svg>
  );
}

function Check({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function Upload({ size = 14, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function Symbol() {
  return (
    <svg width="32" height="19" viewBox="0 0 41 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40.2611 0L26.9811 9.38947V0H26.8127L13.5327 9.38947V0H13.3684L0 9.64211V24H0.202097L13.5327 14.7958V24H13.7348L26.9811 14.7958V24H27.1791L40.4295 14.6316V0H40.2611Z" fill="white"/>
    </svg>
  );
}

function Trophy({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/>
      <path d="M7 6H4v2a3 3 0 0 0 3 3"/>
      <path d="M17 6h3v2a3 3 0 0 1-3 3"/>
      <path d="M12 14v3"/>
      <path d="M9 21h6"/>
      <path d="M10 17h4"/>
    </svg>
  );
}

function Info({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 16v-4"/>
      <circle cx="12" cy="8.5" r="0.6" fill={c}/>
    </svg>
  );
}

function Alert({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5L2.5 20.5h19L12 3.5Z"/>
      <path d="M12 10v4.5"/>
      <circle cx="12" cy="17.5" r="0.6" fill={c}/>
    </svg>
  );
}

function CheckCircle({ size = 16, c = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M8 12.5l2.5 2.5L16 9.5"/>
    </svg>
  );
}

export const Icons = {
  Trainer, Cadence, Speed, Heart, Power,
  Bluetooth, Pin, Play, Pause, Stop,
  Plus, Search, Arrow, Settings, Symbol,
  Pencil, Check, Upload,
  Trophy, Info, Alert, CheckCircle,
};
