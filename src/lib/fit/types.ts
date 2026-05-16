/**
 * FIT protocol constants and enums.
 *
 * Subset of the canonical Garmin FIT SDK profile (~21.x) we need to write
 * a valid activity file. See ../../../public/* (or fit_file_spec.md) for
 * the field-level reference.
 *
 * All multi-byte values in a FIT file are little-endian (we always emit
 * `architecture = 0`).
 */

// ── FIT base types ────────────────────────────────────────────────────────
// The "endian-aware" base types have the high bit (0x80) set; that's a
// hint to readers — actual endianness is declared once per definition
// message in the architecture byte.

export const BaseType = {
  ENUM:     0x00,  // uint8
  SINT8:    0x01,
  UINT8:    0x02,
  STRING:   0x07,
  UINT8Z:   0x0A,
  BYTE:     0x0D,
  SINT16:   0x83,
  UINT16:   0x84,
  SINT32:   0x85,
  UINT32:   0x86,
  FLOAT32:  0x88,
  FLOAT64:  0x89,
  UINT16Z:  0x8B,
  UINT32Z:  0x8C,
} as const;

export type BaseTypeId = (typeof BaseType)[keyof typeof BaseType];

/** Per-base-type invalid sentinel — what FIT readers treat as "no value". */
export const INVALID: Record<BaseTypeId, number> = {
  [BaseType.ENUM]:    0xFF,
  [BaseType.SINT8]:   0x7F,
  [BaseType.UINT8]:   0xFF,
  [BaseType.STRING]:  0x00,
  [BaseType.UINT8Z]:  0x00,
  [BaseType.BYTE]:    0xFF,
  [BaseType.SINT16]:  0x7FFF,
  [BaseType.UINT16]:  0xFFFF,
  [BaseType.SINT32]:  0x7FFFFFFF,
  // uint32 invalid is 0xFFFFFFFF — represented here as a JS number which
  // can safely hold this magnitude (max safe integer is 2^53-1).
  [BaseType.UINT32]:  0xFFFFFFFF,
  [BaseType.FLOAT32]: NaN,
  [BaseType.FLOAT64]: NaN,
  [BaseType.UINT16Z]: 0x0000,
  [BaseType.UINT32Z]: 0x00000000,
};

// ── Global message numbers (mesg_num) ─────────────────────────────────────

export const MsgNum = {
  FILE_ID:      0,
  FILE_CREATOR: 49,
  DEVICE_INFO:  23,
  SPORT:        12,
  WORKOUT:      26,
  EVENT:        21,
  RECORD:       20,
  LAP:          19,
  SESSION:      18,
  ACTIVITY:     34,
} as const;

// ── Profile enums we emit ─────────────────────────────────────────────────

/** file_id.type — only `activity` matters for us. */
export const FileType = {
  ACTIVITY: 4,
} as const;

/** file_id.manufacturer — 255 = development / non-Garmin platforms. */
export const Manufacturer = {
  GARMIN:      1,
  DEVELOPMENT: 255,
} as const;

export const Sport = {
  GENERIC: 0,
  CYCLING: 2,
} as const;

export const SubSport = {
  GENERIC:          0,
  ROAD:             6,
  INDOOR_CYCLING:  28,
  VIRTUAL_ACTIVITY: 58,
} as const;

export const Event = {
  TIMER:    0,
  LAP:      9,
  ACTIVITY: 26,
} as const;

export const EventType = {
  START:    0,
  STOP:     1,
  STOP_ALL: 4,
} as const;

export const LapTrigger = {
  MANUAL:           0,
  TIME:             1,
  DISTANCE:         2,
  POSITION_START:   3,
  POSITION_LAP:     4,
  POSITION_WAYPOINT:5,
  POSITION_MARKER:  6,
  SESSION_END:      7,
} as const;

export const SessionTrigger = {
  ACTIVITY_END: 0,
  MANUAL:       1,
} as const;

export const ActivityType = {
  MANUAL:           0,
  AUTO_MULTI_SPORT: 1,
} as const;

export const Intensity = {
  ACTIVE:   0,
  REST:     1,
  WARMUP:   2,
  COOLDOWN: 3,
} as const;

// ── Time helpers ──────────────────────────────────────────────────────────

/** FIT epoch = 1989-12-31 00:00:00 UTC, expressed as unix seconds. */
export const FIT_EPOCH_OFFSET_S = 631065600;

/** Convert any Date-ish input to a FIT timestamp (uint32 seconds). */
export function toFitTimestamp(input: Date | string | number): number {
  const unixMs = typeof input === 'number'
    ? input
    : (input instanceof Date ? input.getTime() : Date.parse(input));
  return Math.floor(unixMs / 1000) - FIT_EPOCH_OFFSET_S;
}

/** Convert decimal degrees to FIT semicircles (sint32). */
export function toSemicircles(degrees: number): number {
  return Math.round(degrees * (2 ** 31 / 180));
}
