/**
 * Low-level FIT binary writer.
 *
 * A FIT file is:
 *   [14-byte header] [body: alternating definition + data messages] [2-byte CRC]
 *
 * Header layout (we always emit the 14-byte form):
 *   byte 0      : header size (14)
 *   byte 1      : protocol version (0x10 = v1.0 — sufficient, no developer fields)
 *   bytes 2..3  : profile version (uint16 LE) — 2100 = v21.00
 *   bytes 4..7  : data size in bytes (uint32 LE) — body length only
 *   bytes 8..11 : ".FIT" magic
 *   bytes 12..13: header CRC (uint16 LE) over bytes 0..11
 *
 * Body alternates:
 *   Definition message — declares the layout of a "local message id" (0..15)
 *   Data message       — values for the most recently defined local id
 *
 * All multi-byte fields are little-endian (architecture byte = 0).
 */

import { BaseType, BaseTypeId } from './types';

// ── CRC-16 (FIT) ──────────────────────────────────────────────────────────
// Lookup table over the low nibble; each byte is processed in two halves.

const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    let tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xF];
    tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
  }
  return crc & 0xFFFF;
}

// ── Field definition ──────────────────────────────────────────────────────

export interface FieldDef {
  /** FIT field number (per-message). */
  number:   number;
  /** Size in bytes (for STRING, this is the fixed declared length). */
  size:     number;
  baseType: BaseTypeId;
}

/** Value to write for a field. Strings are accepted for STRING fields; everything else is numeric. */
export type FieldValue = number | string | null | undefined;

// ── Encoder ───────────────────────────────────────────────────────────────

export class FitEncoder {
  private body: number[] = [];
  /** Track field layout per local message id so writeMessage knows how to encode values. */
  private locals = new Map<number, FieldDef[]>();

  /**
   * Emit a definition message for `localId` and remember its layout so
   * subsequent `writeMessage(localId, ...)` calls can serialize correctly.
   */
  defineMessage(localId: number, globalMsgNum: number, fields: FieldDef[]): void {
    if (localId < 0 || localId > 15) throw new Error(`localId must be 0..15, got ${localId}`);
    if (fields.length > 255) throw new Error(`too many fields (${fields.length})`);

    // Record header: 0x40 = definition message bit; lower 4 bits = local id.
    this.body.push(0x40 | localId);
    this.body.push(0);            // reserved
    this.body.push(0);            // architecture: 0 = little-endian
    this.body.push(globalMsgNum & 0xFF, (globalMsgNum >> 8) & 0xFF);
    this.body.push(fields.length);
    for (const f of fields) {
      this.body.push(f.number, f.size, f.baseType);
    }

    this.locals.set(localId, fields);
  }

  /**
   * Emit a data message for `localId`. `values` must align with the field
   * layout declared in the matching `defineMessage` call. `null`/`undefined`
   * are written as the FIT "invalid" sentinel for the field's base type.
   */
  writeMessage(localId: number, values: FieldValue[]): void {
    const fields = this.locals.get(localId);
    if (!fields) throw new Error(`writeMessage: localId ${localId} not defined`);
    if (values.length !== fields.length) {
      throw new Error(`writeMessage: expected ${fields.length} values, got ${values.length}`);
    }

    // Record header: data message = high bit clear; lower 4 bits = local id.
    this.body.push(localId & 0x0F);

    for (let i = 0; i < fields.length; i++) {
      encodeField(this.body, fields[i], values[i]);
    }
  }

  /** Finalize: prepend the 14-byte header (with data size + header CRC) and append the file CRC. */
  finish(): Uint8Array {
    const bodyLen = this.body.length;
    const total = 14 + bodyLen + 2;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);

    // Header
    out[0] = 14;
    out[1] = 0x10;                            // protocol v1.0
    view.setUint16(2, 2100, true);            // profile v21.00
    view.setUint32(4, bodyLen, true);
    out[8]  = 0x2E; // '.'
    out[9]  = 0x46; // 'F'
    out[10] = 0x49; // 'I'
    out[11] = 0x54; // 'T'
    const headerCrc = crc16(out.subarray(0, 12));
    view.setUint16(12, headerCrc, true);

    // Body
    for (let i = 0; i < bodyLen; i++) out[14 + i] = this.body[i];

    // Footer CRC over [header || body]
    const fileCrc = crc16(out.subarray(0, 14 + bodyLen));
    view.setUint16(14 + bodyLen, fileCrc, true);

    return out;
  }
}

// ── Field-level encoding ──────────────────────────────────────────────────

function encodeField(out: number[], field: FieldDef, value: FieldValue): void {
  const { baseType, size } = field;

  // Strings get padded to `size` with null bytes (or filled if null).
  if (baseType === BaseType.STRING) {
    const s = (value == null ? '' : String(value));
    const bytes = utf8Bytes(s).slice(0, size);
    for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
    for (let i = bytes.length; i < size; i++) out.push(0);
    return;
  }

  const invalid = baseType === BaseType.UINT8Z || baseType === BaseType.UINT16Z || baseType === BaseType.UINT32Z
    ? 0
    : INVALID_BY_TYPE[baseType];

  const v = (value == null || (typeof value === 'number' && !Number.isFinite(value)))
    ? invalid
    : (value as number);

  switch (baseType) {
    case BaseType.ENUM:
    case BaseType.UINT8:
    case BaseType.UINT8Z:
    case BaseType.BYTE:
      out.push(v & 0xFF);
      return;
    case BaseType.SINT8:
      out.push(v & 0xFF);
      return;
    case BaseType.UINT16:
    case BaseType.UINT16Z:
      out.push(v & 0xFF, (v >>> 8) & 0xFF);
      return;
    case BaseType.SINT16: {
      const u = v & 0xFFFF;
      out.push(u & 0xFF, (u >>> 8) & 0xFF);
      return;
    }
    case BaseType.UINT32:
    case BaseType.UINT32Z: {
      // Use unsigned semantics: v can be up to 0xFFFFFFFF.
      const u = v >>> 0;
      out.push(u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF);
      return;
    }
    case BaseType.SINT32: {
      const u = v | 0; // force int32
      out.push(u & 0xFF, (u >>> 8) & 0xFF, (u >>> 16) & 0xFF, (u >>> 24) & 0xFF);
      return;
    }
    case BaseType.FLOAT32: {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, v, true);
      const u = new Uint8Array(buf);
      out.push(u[0], u[1], u[2], u[3]);
      return;
    }
    case BaseType.FLOAT64: {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, v, true);
      const u = new Uint8Array(buf);
      out.push(u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7]);
      return;
    }
    default:
      throw new Error(`unsupported base type 0x${(baseType as number).toString(16)}`);
  }
}

const INVALID_BY_TYPE: Record<number, number> = {
  [BaseType.ENUM]:    0xFF,
  [BaseType.SINT8]:   0x7F,
  [BaseType.UINT8]:   0xFF,
  [BaseType.BYTE]:    0xFF,
  [BaseType.SINT16]:  0x7FFF,
  [BaseType.UINT16]:  0xFFFF,
  [BaseType.SINT32]:  0x7FFFFFFF,
  [BaseType.UINT32]:  0xFFFFFFFF,
  [BaseType.FLOAT32]: NaN,
  [BaseType.FLOAT64]: NaN,
};

function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  // Fallback for environments without TextEncoder (very unlikely in our target).
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return new Uint8Array(out);
}
