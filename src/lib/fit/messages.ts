/**
 * Per-message field layouts (FieldDef[]) for the FIT messages we emit.
 *
 * Each constant declares the field number, byte size and base type, in the
 * exact order that `FitEncoder.writeMessage(localId, values[])` expects the
 * matching values. Adding a field here means adding a corresponding entry
 * to every `writeMessage` call for that local id.
 */

import { BaseType } from './types';
import type { FieldDef } from './encoder';

/** Local message ids assigned to each global message we emit. 0..15. */
export const Local = {
  FILE_ID:      0,
  FILE_CREATOR: 1,
  SPORT:        2,
  WORKOUT:      3,
  EVENT:        4,
  RECORD:       5,
  LAP:          6,
  SESSION:      7,
  ACTIVITY:     8,
} as const;

// ── file_id ───────────────────────────────────────────────────────────────
export const FILE_ID_FIELDS: FieldDef[] = [
  { number: 0, size: 1, baseType: BaseType.ENUM    }, // type
  { number: 1, size: 2, baseType: BaseType.UINT16  }, // manufacturer
  { number: 2, size: 2, baseType: BaseType.UINT16  }, // product
  { number: 3, size: 4, baseType: BaseType.UINT32Z }, // serial_number
  { number: 4, size: 4, baseType: BaseType.UINT32  }, // time_created
  { number: 5, size: 2, baseType: BaseType.UINT16  }, // number
];

// ── file_creator ──────────────────────────────────────────────────────────
export const FILE_CREATOR_FIELDS: FieldDef[] = [
  { number: 0, size: 2, baseType: BaseType.UINT16 }, // software_version
  { number: 1, size: 1, baseType: BaseType.UINT8  }, // hardware_version
];

// ── sport ─────────────────────────────────────────────────────────────────
// `name` is a fixed-length string at definition time. 32 bytes accommodates
// "The Ride - " + a reasonable route name.
export const SPORT_NAME_SIZE = 64;
export const SPORT_FIELDS: FieldDef[] = [
  { number: 0, size: 1, baseType: BaseType.ENUM   }, // sport
  { number: 1, size: 1, baseType: BaseType.ENUM   }, // sub_sport
  { number: 3, size: SPORT_NAME_SIZE, baseType: BaseType.STRING }, // name
];

// ── workout ───────────────────────────────────────────────────────────────
// We emit a workout message just to surface the branded title in
// Garmin Connect (which renders `wkt_name` as the activity title).
// `num_valid_steps = 0` — no detailed plan in the file.
export const WORKOUT_NAME_SIZE = 64;
export const WORKOUT_FIELDS: FieldDef[] = [
  { number:  4, size: 1, baseType: BaseType.ENUM    }, // sport
  { number: 11, size: 1, baseType: BaseType.ENUM    }, // sub_sport
  { number:  5, size: 4, baseType: BaseType.UINT32Z }, // capabilities (bitmask)
  { number:  6, size: 2, baseType: BaseType.UINT16  }, // num_valid_steps
  { number:  8, size: WORKOUT_NAME_SIZE, baseType: BaseType.STRING }, // wkt_name
];

// ── event ─────────────────────────────────────────────────────────────────
export const EVENT_FIELDS: FieldDef[] = [
  { number: 253, size: 4, baseType: BaseType.UINT32 }, // timestamp
  { number:   3, size: 4, baseType: BaseType.UINT32 }, // data
  { number:   0, size: 1, baseType: BaseType.ENUM   }, // event
  { number:   1, size: 1, baseType: BaseType.ENUM   }, // event_type
  { number:   4, size: 1, baseType: BaseType.UINT8  }, // event_group
];

// ── record ────────────────────────────────────────────────────────────────
// The record definition is configured per-session: we always include
// timestamp/HR/cadence/power/speed/distance; GPS+altitude are added only
// when the session has a route's GPX track to interpolate against.

export interface RecordSchemaOpts {
  includeGps:      boolean;
  includeAltitude: boolean;
}

export function recordFields(opts: RecordSchemaOpts): FieldDef[] {
  const f: FieldDef[] = [
    { number: 253, size: 4, baseType: BaseType.UINT32 }, // timestamp
  ];
  if (opts.includeGps) {
    f.push({ number: 0, size: 4, baseType: BaseType.SINT32 }); // position_lat (semicircles)
    f.push({ number: 1, size: 4, baseType: BaseType.SINT32 }); // position_long
  }
  f.push({ number:  5, size: 4, baseType: BaseType.UINT32 }); // distance (uint32, scale 100, m)
  f.push({ number: 73, size: 4, baseType: BaseType.UINT32 }); // enhanced_speed (uint32, scale 1000, m/s)
  if (opts.includeAltitude) {
    f.push({ number: 78, size: 4, baseType: BaseType.UINT32 }); // enhanced_altitude (uint32, scale 5, offset 500, m)
  }
  f.push({ number:  7, size: 2, baseType: BaseType.UINT16 }); // power (W)
  f.push({ number:  3, size: 1, baseType: BaseType.UINT8  }); // heart_rate
  f.push({ number:  4, size: 1, baseType: BaseType.UINT8  }); // cadence
  return f;
}

// ── lap ───────────────────────────────────────────────────────────────────
export const LAP_FIELDS: FieldDef[] = [
  { number: 254, size: 2, baseType: BaseType.UINT16 }, // message_index
  { number: 253, size: 4, baseType: BaseType.UINT32 }, // timestamp (lap end)
  { number:   2, size: 4, baseType: BaseType.UINT32 }, // start_time
  { number:   7, size: 4, baseType: BaseType.UINT32 }, // total_elapsed_time (scale 1000, s)
  { number:   8, size: 4, baseType: BaseType.UINT32 }, // total_timer_time (scale 1000, s)
  { number:   9, size: 4, baseType: BaseType.UINT32 }, // total_distance (scale 100, m)
  { number:  13, size: 2, baseType: BaseType.UINT16 }, // avg_speed (scale 1000, m/s)
  { number:  14, size: 2, baseType: BaseType.UINT16 }, // max_speed (scale 1000, m/s)
  { number:  19, size: 2, baseType: BaseType.UINT16 }, // avg_power (W)
  { number:  20, size: 2, baseType: BaseType.UINT16 }, // max_power (W)
  { number:  21, size: 2, baseType: BaseType.UINT16 }, // total_ascent (m)
  { number:  22, size: 2, baseType: BaseType.UINT16 }, // total_descent (m)
  { number:  15, size: 1, baseType: BaseType.UINT8  }, // avg_heart_rate
  { number:  16, size: 1, baseType: BaseType.UINT8  }, // max_heart_rate
  { number:  17, size: 1, baseType: BaseType.UINT8  }, // avg_cadence
  { number:  18, size: 1, baseType: BaseType.UINT8  }, // max_cadence
  { number:   0, size: 1, baseType: BaseType.ENUM   }, // event
  { number:   1, size: 1, baseType: BaseType.ENUM   }, // event_type
  { number:  24, size: 1, baseType: BaseType.ENUM   }, // lap_trigger
  { number:  25, size: 1, baseType: BaseType.ENUM   }, // sport
];

// ── session ───────────────────────────────────────────────────────────────
export const SESSION_FIELDS: FieldDef[] = [
  { number: 254, size: 2, baseType: BaseType.UINT16 }, // message_index
  { number: 253, size: 4, baseType: BaseType.UINT32 }, // timestamp (session end)
  { number:   2, size: 4, baseType: BaseType.UINT32 }, // start_time
  { number:   7, size: 4, baseType: BaseType.UINT32 }, // total_elapsed_time
  { number:   8, size: 4, baseType: BaseType.UINT32 }, // total_timer_time
  { number:   9, size: 4, baseType: BaseType.UINT32 }, // total_distance (scale 100, m)
  { number:  11, size: 2, baseType: BaseType.UINT16 }, // total_calories (kcal)
  { number:  14, size: 2, baseType: BaseType.UINT16 }, // avg_speed
  { number:  15, size: 2, baseType: BaseType.UINT16 }, // max_speed
  { number:  20, size: 2, baseType: BaseType.UINT16 }, // avg_power
  { number:  21, size: 2, baseType: BaseType.UINT16 }, // max_power
  { number:  22, size: 2, baseType: BaseType.UINT16 }, // total_ascent
  { number:  23, size: 2, baseType: BaseType.UINT16 }, // total_descent
  { number:  25, size: 2, baseType: BaseType.UINT16 }, // first_lap_index
  { number:  26, size: 2, baseType: BaseType.UINT16 }, // num_laps
  { number:  16, size: 1, baseType: BaseType.UINT8  }, // avg_heart_rate
  { number:  17, size: 1, baseType: BaseType.UINT8  }, // max_heart_rate
  { number:  18, size: 1, baseType: BaseType.UINT8  }, // avg_cadence
  { number:  19, size: 1, baseType: BaseType.UINT8  }, // max_cadence
  { number:   5, size: 1, baseType: BaseType.ENUM   }, // sport
  { number:   6, size: 1, baseType: BaseType.ENUM   }, // sub_sport
  { number:   0, size: 1, baseType: BaseType.ENUM   }, // event
  { number:   1, size: 1, baseType: BaseType.ENUM   }, // event_type
  { number:  28, size: 1, baseType: BaseType.ENUM   }, // trigger
];

// ── activity ──────────────────────────────────────────────────────────────
export const ACTIVITY_FIELDS: FieldDef[] = [
  { number: 253, size: 4, baseType: BaseType.UINT32 }, // timestamp
  { number:   5, size: 4, baseType: BaseType.UINT32 }, // local_timestamp
  { number:   0, size: 4, baseType: BaseType.UINT32 }, // total_timer_time
  { number:   1, size: 2, baseType: BaseType.UINT16 }, // num_sessions
  { number:   2, size: 1, baseType: BaseType.ENUM   }, // type
  { number:   3, size: 1, baseType: BaseType.ENUM   }, // event
  { number:   4, size: 1, baseType: BaseType.ENUM   }, // event_type
];
