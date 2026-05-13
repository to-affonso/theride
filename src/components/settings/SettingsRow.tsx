'use client';

/**
 * Single editable row used across the Configurações screen.
 *
 * Layout:  [ Label .................. Value ]
 *
 * Click the row to switch into edit mode. The input is rendered inline,
 * right-aligned, and saves on blur or on Enter. Escape cancels.
 *
 * Numeric `unit` (e.g. "kg", "W", "bpm") renders after the input,
 * mono-styled, so values read naturally without crowding the field.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

type InputType = 'text' | 'number' | 'date';

export interface SettingsRowProps {
  label:        string;
  /** Display value when not editing. Can be a string or pre-formatted node. */
  display:      ReactNode;
  /** Raw value for the input when editing. */
  value:        string | number | null | undefined;
  /** Called when the user commits a change (blur / Enter). Pass the raw input value. */
  onCommit:     (raw: string) => void | Promise<void>;
  type?:        InputType;
  /** Trailing unit label (e.g. "kg"). Rendered next to the input. */
  unit?:        string;
  /** HTML input min/max/step. Forwarded raw. */
  min?:         number;
  max?:         number;
  step?:        number;
  /** Optional placeholder for the input. */
  placeholder?: string;
  /** Width of the input in px (defaults 140). */
  inputWidth?:  number;
}

export function SettingsRow({
  label,
  display,
  value,
  onCommit,
  type = 'text',
  unit,
  min,
  max,
  step,
  placeholder,
  inputWidth = 140,
}: SettingsRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<string>('');
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value == null ? '' : String(value));
      // Focus on next tick so the input is mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [editing, value]);

  function commit() {
    if (!editing) return;
    setEditing(false);
    onCommit(draft.trim());
  }
  function cancel() {
    setEditing(false);
  }

  return (
    <div
      className="settings-row"
      onClick={() => !editing && setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) setEditing(true); }}
    >
      <span className="settings-row-label">{label}</span>
      {editing ? (
        <span className="settings-row-value">
          <input
            ref={inputRef}
            className="settings-row-input"
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            style={{ width: inputWidth }}
            onClick={e => e.stopPropagation()}
          />
          {unit && <span className="settings-row-unit">{unit}</span>}
        </span>
      ) : (
        <span className="settings-row-value">{display}</span>
      )}
    </div>
  );
}
