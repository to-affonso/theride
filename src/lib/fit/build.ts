/**
 * Build a FIT binary file from a `Session` (+ optional laps + optional GPX route).
 *
 * Outputs a `.fit`-shaped Uint8Array plus the branded title and a slug-based
 * filename. The caller is responsible for triggering the download — see
 * `download.ts` for the browser-side helper.
 *
 * Decisions baked in:
 *   - manufacturer = 255 (development); we don't have a Garmin-issued id
 *   - sport = cycling, sub_sport = virtual_activity
 *   - GPS positions and altitude are included **only** when a route GPX is
 *     present; for trainer-only sessions we omit those record fields
 *   - The branded title "The Ride - [route|notes|Treino livre]" is written
 *     to `sport.name` and `workout.wkt_name` (Garmin Connect reads the latter
 *     as the activity title)
 */

import type { Session } from '@/types';
import type { GpxPoint } from '@/lib/gpx';
import { positionAt, totalElevationGain } from '@/lib/gpx';
import {
  ActivityType, Event, EventType, FileType, Intensity,
  LapTrigger, Manufacturer, MsgNum, SessionTrigger, Sport, SubSport,
  toFitTimestamp,
  toSemicircles,
} from './types';
import { FitEncoder } from './encoder';
import {
  ACTIVITY_FIELDS, EVENT_FIELDS, FILE_CREATOR_FIELDS, FILE_ID_FIELDS,
  LAP_FIELDS, Local, recordFields, SESSION_FIELDS, SPORT_FIELDS,
  WORKOUT_FIELDS,
} from './messages';

// ── Public types ──────────────────────────────────────────────────────────

export interface LapInput {
  /** 1-based — used as message_index. */
  index: number;
  /** Seconds elapsed from session start to lap start. */
  startOffsetS: number;
  durationS: number;
  distanceKm: number;
  avgPower: number;
  avgHr: number | null;
  avgCadence?: number | null;
  /** km/h — optional; falls back to distance/duration. */
  avgSpeedKmh?: number | null;
  totalAscentM?: number | null;
  trigger: 'manual' | 'auto';
}

export interface BuildFitOptions {
  session: Session;
  /** Closed laps (1-based index, ordered). If omitted/empty, a single lap covering the whole session is synthesized. */
  laps?: LapInput[];
}

export interface BuildFitResult {
  bytes: Uint8Array;
  /** "The Ride - …" — branded title placed inside the file. */
  title: string;
  /** Suggested filename, slug-based, with `.fit` extension. */
  filename: string;
}

// ── Title + filename ──────────────────────────────────────────────────────

const TITLE_PREFIX = 'The Ride - ';

function resolveDisplayName(session: Session): string {
  const routeName = session.routes?.name?.trim();
  if (routeName) return routeName;
  const notes = session.notes?.trim();
  if (notes) return notes;
  return 'Treino livre';
}

function buildTitle(session: Session): string {
  return TITLE_PREFIX + resolveDisplayName(session);
}

function slugify(s: string): string {
  // Strip combining diacritics (U+0300..U+036F) after NFD normalization.
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildFilename(session: Session, displayName: string): string {
  const date = new Date(session.started_at);
  const ymd = isNaN(date.getTime())
    ? 'unknown-date'
    : date.toISOString().slice(0, 10);
  const slug = slugify(displayName) || 'treino';
  return `the-ride-${slug}-${ymd}.fit`;
}

// ── Conversion helpers ────────────────────────────────────────────────────

const KMH_TO_MS = 1000 / 3600;

/** Encode a speed value (km/h) as enhanced_speed uint32 (scale 1000, m/s). */
function encodeSpeed(kmh: number | null | undefined): number | null {
  if (kmh == null || !isFinite(kmh) || kmh < 0) return null;
  return Math.round(kmh * KMH_TO_MS * 1000);
}

/** Encode meters as uint16 avg/max_speed (scale 1000, m/s). */
function encodeSpeed16(kmh: number | null | undefined): number | null {
  if (kmh == null || !isFinite(kmh) || kmh < 0) return null;
  return Math.min(0xFFFE, Math.round(kmh * KMH_TO_MS * 1000));
}

function encodeDistance(meters: number): number {
  return Math.max(0, Math.round(meters * 100)); // scale 100
}

function encodeAltitude(metres: number): number {
  // enhanced_altitude: uint32, scale 5, offset 500 → stored = (m + 500) * 5
  return Math.max(0, Math.round((metres + 500) * 5));
}

/** Round HR/cadence to uint8 with 0 → invalid (sensor absent). */
function encodeHr(bpm: number | null | undefined): number | null {
  if (bpm == null || !isFinite(bpm) || bpm <= 0) return null;
  return Math.min(254, Math.round(bpm));
}

function encodeCadence(rpm: number | null | undefined): number | null {
  if (rpm == null || !isFinite(rpm) || rpm < 0) return null;
  return Math.min(254, Math.round(rpm));
}

function encodePower(w: number | null | undefined): number | null {
  if (w == null || !isFinite(w) || w < 0) return null;
  return Math.min(65534, Math.round(w));
}

// ── Cumulative distance per second ────────────────────────────────────────

/**
 * Build a per-second cumulative distance array (metres) of length `durationS`.
 *
 * Preferred path: integrate `speed_series` (km/h @ 1Hz) → metres per second.
 * Fallback: linear interpolation against `total_distance_km` when no speed
 * was recorded (sensorless indoor session).
 */
function cumulativeDistanceMetres(session: Session): number[] {
  const n = Math.max(0, session.duration_s | 0);
  const out = new Array<number>(n);
  const speed = session.speed_series;

  if (speed && speed.length > 0) {
    let cum = 0;
    for (let i = 0; i < n; i++) {
      const kmh = speed[i] ?? 0;
      cum += Math.max(0, kmh) * KMH_TO_MS; // m for this second
      out[i] = cum;
    }
    return out;
  }

  // Linear fallback
  const totalM = Math.max(0, session.distance_km) * 1000;
  for (let i = 0; i < n; i++) {
    out[i] = n > 0 ? totalM * ((i + 1) / n) : 0;
  }
  return out;
}

// ── Aggregates over a slice of the session series ─────────────────────────

interface SliceAggs {
  maxPower: number;
  maxHr:    number;
  maxCadence: number;
  maxSpeedKmh: number;
}

function sliceAggregates(session: Session, fromS: number, toS: number): SliceAggs {
  const from = Math.max(0, fromS | 0);
  const to   = Math.min(session.duration_s | 0, toS | 0);
  let mp = 0, mh = 0, mc = 0, ms = 0;
  const p = session.power_series;
  const h = session.hr_series;
  const c = session.cadence_series;
  const s = session.speed_series;
  for (let i = from; i < to; i++) {
    if (p && p[i] > mp) mp = p[i];
    if (h && h[i] > mh) mh = h[i];
    if (c && c[i] && c[i] > mc) mc = c[i];
    if (s && s[i] && s[i] > ms) ms = s[i];
  }
  return { maxPower: mp, maxHr: mh, maxCadence: mc, maxSpeedKmh: ms };
}

// ── Total descent / ascent helpers ────────────────────────────────────────

function elevationStats(points: GpxPoint[] | null | undefined): { ascentM: number; descentM: number } {
  if (!points || points.length < 2) return { ascentM: 0, descentM: 0 };
  let asc = 0, desc = 0;
  for (let i = 1; i < points.length; i++) {
    const dh = points[i].ele - points[i - 1].ele;
    if (dh > 0) asc += dh; else desc -= dh;
  }
  return { ascentM: Math.round(asc), descentM: Math.round(desc) };
}

// ── Builder entry point ───────────────────────────────────────────────────

export function buildFitFile(opts: BuildFitOptions): BuildFitResult {
  const { session } = opts;
  const displayName = resolveDisplayName(session);
  const title = TITLE_PREFIX + displayName;

  const startUnixMs = Date.parse(session.started_at);
  const startFitTs  = toFitTimestamp(session.started_at);
  const durationS   = Math.max(1, session.duration_s | 0);
  const endFitTs    = startFitTs + durationS;

  const gpxPoints   = session.routes?.gpx_data?.points ?? null;
  const hasGps      = !!(gpxPoints && gpxPoints.length >= 2);
  const hasAltitude = hasGps;

  // Normalize laps — synthesize a single lap covering the whole session
  // when none provided. Index 0-based for message_index.
  const laps: LapInput[] =
    opts.laps && opts.laps.length > 0
      ? opts.laps.slice().sort((a, b) => a.startOffsetS - b.startOffsetS)
      : [{
          index: 1,
          startOffsetS: 0,
          durationS,
          distanceKm: session.distance_km,
          avgPower:   session.avg_power,
          avgHr:      session.avg_hr > 0 ? session.avg_hr : null,
          avgCadence: session.avg_cadence ?? null,
          avgSpeedKmh: session.duration_s > 0 ? (session.distance_km / (session.duration_s / 3600)) : null,
          trigger: 'manual',
        }];

  const cumDistM = cumulativeDistanceMetres(session);

  // Session-level total ascent/descent. Prefer GPX (we know it's a virtual
  // route and the recorded total_ascent_m field is 0 for indoor sessions).
  const sessionElevation = hasGps
    ? elevationStats(gpxPoints)
    : { ascentM: session.total_ascent_m ?? 0, descentM: 0 };

  // ── Wire up encoder ─────────────────────────────────────────────────
  const fit = new FitEncoder();

  // file_id
  fit.defineMessage(Local.FILE_ID, MsgNum.FILE_ID, FILE_ID_FIELDS);
  fit.writeMessage(Local.FILE_ID, [
    FileType.ACTIVITY,                   // type
    Manufacturer.DEVELOPMENT,            // manufacturer = 255
    0,                                   // product
    randomSerial(),                      // serial_number (uint32z)
    startFitTs,                          // time_created
    0,                                   // number
  ]);

  // file_creator
  fit.defineMessage(Local.FILE_CREATOR, MsgNum.FILE_CREATOR, FILE_CREATOR_FIELDS);
  fit.writeMessage(Local.FILE_CREATOR, [
    10,  // software_version: 0.10 (package.json 0.1.0 → 10)
    1,   // hardware_version: 1
  ]);

  // sport
  fit.defineMessage(Local.SPORT, MsgNum.SPORT, SPORT_FIELDS);
  fit.writeMessage(Local.SPORT, [
    Sport.CYCLING,
    SubSport.VIRTUAL_ACTIVITY,
    title,
  ]);

  // workout — primary carrier of the branded title for Garmin Connect.
  fit.defineMessage(Local.WORKOUT, MsgNum.WORKOUT, WORKOUT_FIELDS);
  fit.writeMessage(Local.WORKOUT, [
    Sport.CYCLING,
    SubSport.VIRTUAL_ACTIVITY,
    0,        // capabilities (none)
    0,        // num_valid_steps
    title,
  ]);

  // event: start
  fit.defineMessage(Local.EVENT, MsgNum.EVENT, EVENT_FIELDS);
  fit.writeMessage(Local.EVENT, [
    startFitTs,
    0,
    Event.TIMER,
    EventType.START,
    0,
  ]);

  // record — define once with the schema for this session
  fit.defineMessage(Local.RECORD, MsgNum.RECORD, recordFields({ includeGps: hasGps, includeAltitude: hasAltitude }));
  writeRecords(fit, session, cumDistM, gpxPoints, hasGps, hasAltitude, startFitTs, durationS);

  // event: stop_all
  fit.writeMessage(Local.EVENT, [
    endFitTs,
    0,
    Event.TIMER,
    EventType.STOP_ALL,
    0,
  ]);

  // laps
  fit.defineMessage(Local.LAP, MsgNum.LAP, LAP_FIELDS);
  for (let i = 0; i < laps.length; i++) {
    writeLap(fit, session, laps[i], i, startFitTs, hasGps, gpxPoints, cumDistM);
  }

  // session
  fit.defineMessage(Local.SESSION, MsgNum.SESSION, SESSION_FIELDS);
  writeSession(fit, session, startFitTs, endFitTs, durationS, laps.length, sessionElevation);

  // activity
  fit.defineMessage(Local.ACTIVITY, MsgNum.ACTIVITY, ACTIVITY_FIELDS);
  const localTs = computeLocalTimestamp(startUnixMs + durationS * 1000, endFitTs);
  fit.writeMessage(Local.ACTIVITY, [
    endFitTs,
    localTs,
    durationS * 1000,           // total_timer_time (scale 1000)
    1,                          // num_sessions
    ActivityType.MANUAL,
    Event.ACTIVITY,
    EventType.STOP,
  ]);

  return {
    bytes: fit.finish(),
    title,
    filename: buildFilename(session, displayName),
  };
}

// ── Record loop ───────────────────────────────────────────────────────────

function writeRecords(
  fit: FitEncoder,
  session: Session,
  cumDistM: number[],
  gpxPoints: GpxPoint[] | null,
  hasGps: boolean,
  hasAltitude: boolean,
  startFitTs: number,
  durationS: number,
): void {
  const p = session.power_series;
  const h = session.hr_series;
  const c = session.cadence_series;
  const s = session.speed_series;

  for (let i = 0; i < durationS; i++) {
    const ts       = startFitTs + i;
    const distM    = cumDistM[i] ?? 0;
    const distKm   = distM / 1000;
    const speedKmh = s?.[i] ?? null;

    let lat: number | null = null;
    let lon: number | null = null;
    let ele: number | null = null;
    if (hasGps && gpxPoints) {
      const pos = positionAt(gpxPoints, distKm);
      lat = toSemicircles(pos.lat);
      lon = toSemicircles(pos.lon);
      ele = encodeAltitude(pos.ele);
    }

    const values: (number | null)[] = [ts];
    if (hasGps) {
      values.push(lat, lon);
    }
    values.push(
      encodeDistance(distM),
      encodeSpeed(speedKmh),
    );
    if (hasAltitude) {
      values.push(ele);
    }
    values.push(
      encodePower(p?.[i]),
      encodeHr(h?.[i]),
      encodeCadence(c?.[i]),
    );

    fit.writeMessage(Local.RECORD, values);
  }
}

// ── Lap encoder ───────────────────────────────────────────────────────────

function writeLap(
  fit: FitEncoder,
  session: Session,
  lap: LapInput,
  messageIndex: number,
  startFitTs: number,
  hasGps: boolean,
  gpxPoints: GpxPoint[] | null,
  cumDistM: number[],
): void {
  const lapStartFitTs = startFitTs + lap.startOffsetS;
  const lapEndFitTs   = startFitTs + lap.startOffsetS + lap.durationS;
  const aggs = sliceAggregates(session, lap.startOffsetS, lap.startOffsetS + lap.durationS);

  // Lap ascent/descent from GPX if available. Take points whose distKm sits
  // within [lap_start_distance, lap_end_distance].
  let ascentM = 0, descentM = 0;
  if (hasGps && gpxPoints && gpxPoints.length >= 2) {
    const startDistKm = (cumDistM[lap.startOffsetS] ?? 0) / 1000;
    const endIdx = Math.min(cumDistM.length - 1, lap.startOffsetS + lap.durationS - 1);
    const endDistKm = (cumDistM[endIdx] ?? 0) / 1000;
    const slice = gpxPoints.filter(pt => pt.distKm >= startDistKm && pt.distKm <= endDistKm);
    if (slice.length >= 2) {
      const ev = elevationStats(slice);
      ascentM = ev.ascentM;
      descentM = ev.descentM;
    }
  }

  const lapDistanceM = lap.distanceKm * 1000;
  const lapTrigger = lap.trigger === 'auto' ? LapTrigger.DISTANCE : LapTrigger.MANUAL;
  const avgSpeedKmh = lap.avgSpeedKmh ?? (lap.durationS > 0 ? lap.distanceKm / (lap.durationS / 3600) : 0);

  fit.writeMessage(Local.LAP, [
    messageIndex,                              // message_index (0-based)
    lapEndFitTs,                               // timestamp
    lapStartFitTs,                             // start_time
    Math.round(lap.durationS * 1000),          // total_elapsed_time
    Math.round(lap.durationS * 1000),          // total_timer_time
    encodeDistance(lapDistanceM),              // total_distance
    encodeSpeed16(avgSpeedKmh),                // avg_speed
    encodeSpeed16(aggs.maxSpeedKmh),           // max_speed
    encodePower(lap.avgPower),                 // avg_power
    encodePower(aggs.maxPower),                // max_power
    Math.min(0xFFFE, ascentM),                 // total_ascent
    Math.min(0xFFFE, descentM),                // total_descent
    encodeHr(lap.avgHr),                       // avg_heart_rate
    encodeHr(aggs.maxHr),                      // max_heart_rate
    encodeCadence(lap.avgCadence ?? null),     // avg_cadence
    encodeCadence(aggs.maxCadence),            // max_cadence
    Event.LAP,                                 // event
    EventType.STOP,                            // event_type
    lapTrigger,                                // lap_trigger
    Sport.CYCLING,                             // sport
  ]);

  void Intensity; // keep enum reachable for future workout_step usage
}

// ── Session encoder ───────────────────────────────────────────────────────

function writeSession(
  fit: FitEncoder,
  session: Session,
  startFitTs: number,
  endFitTs: number,
  durationS: number,
  numLaps: number,
  elevation: { ascentM: number; descentM: number },
): void {
  const aggs = sliceAggregates(session, 0, durationS);
  const totalDistanceM = session.distance_km * 1000;
  const avgSpeedKmh = durationS > 0 ? session.distance_km / (durationS / 3600) : 0;

  fit.writeMessage(Local.SESSION, [
    0,                                         // message_index
    endFitTs,                                  // timestamp
    startFitTs,                                // start_time
    Math.round(durationS * 1000),              // total_elapsed_time
    Math.round(durationS * 1000),              // total_timer_time
    encodeDistance(totalDistanceM),            // total_distance
    Math.min(0xFFFE, Math.max(0, Math.round(session.calories || 0))), // total_calories
    encodeSpeed16(avgSpeedKmh),                // avg_speed
    encodeSpeed16(aggs.maxSpeedKmh),           // max_speed
    encodePower(session.avg_power),            // avg_power
    encodePower(session.max_power ?? aggs.maxPower), // max_power
    Math.min(0xFFFE, elevation.ascentM),       // total_ascent
    Math.min(0xFFFE, elevation.descentM),      // total_descent
    0,                                         // first_lap_index
    Math.min(0xFFFE, numLaps),                 // num_laps
    encodeHr(session.avg_hr),                  // avg_heart_rate
    encodeHr(session.max_hr ?? aggs.maxHr),    // max_heart_rate
    encodeCadence(session.avg_cadence ?? null),// avg_cadence
    encodeCadence(aggs.maxCadence),            // max_cadence
    Sport.CYCLING,                             // sport
    SubSport.VIRTUAL_ACTIVITY,                 // sub_sport
    Event.LAP,                                 // event
    EventType.STOP,                            // event_type
    SessionTrigger.ACTIVITY_END,               // trigger
  ]);
}

// ── Misc helpers ──────────────────────────────────────────────────────────

function computeLocalTimestamp(endUnixMs: number, endFitTs: number): number {
  const endDate = new Date(endUnixMs);
  if (isNaN(endDate.getTime())) return endFitTs;
  // getTimezoneOffset() returns minutes WEST of UTC. Local FIT ts = UTC ts + offsetSeconds.
  const offsetSec = -endDate.getTimezoneOffset() * 60;
  return (endFitTs + offsetSec) >>> 0;
}

function randomSerial(): number {
  // Stable-ish per-export id. We don't have a device serial — use
  // current ms (truncated to uint32) so two exports from the same
  // session look distinct.
  return (Date.now() & 0xFFFFFFFF) >>> 0;
}

// keep totalElevationGain reachable; useful when we later record per-lap ascent
void totalElevationGain;

// ── Adapters ──────────────────────────────────────────────────────────────

/** Convert in-memory laps (from `useBleStore`) to FIT-builder inputs. */
export function lapsFromInMemory(
  laps: Array<{ index: number; distanceKm: number; durationS: number; avgPower: number; avgHr: number | null; startedAt: number; kind: 'manual' | 'auto' }>,
  sessionStartIso: string,
): LapInput[] {
  const sessionStartMs = Date.parse(sessionStartIso);
  if (isNaN(sessionStartMs)) return [];
  return laps.map(l => ({
    index: l.index,
    startOffsetS: Math.max(0, Math.round((l.startedAt - sessionStartMs) / 1000)),
    durationS: Math.max(1, Math.round(l.durationS)),
    distanceKm: Math.max(0, l.distanceKm),
    avgPower: Math.max(0, l.avgPower),
    avgHr: l.avgHr,
    trigger: l.kind,
  }));
}

/** Convert persisted `session_laps` rows to FIT-builder inputs. */
export function lapsFromDbRows(
  rows: Array<{ lap_number: number; type: 'auto' | 'manual'; started_at_s: number; duration_s: number; distance_km: number; avg_power: number; avg_hr: number; avg_cadence: number; avg_speed: number | null; elevation_gain: number }>,
): LapInput[] {
  return rows
    .slice()
    .sort((a, b) => a.lap_number - b.lap_number)
    .map(r => ({
      index: r.lap_number,
      startOffsetS: Math.max(0, r.started_at_s),
      durationS: Math.max(1, r.duration_s),
      distanceKm: Math.max(0, r.distance_km),
      avgPower: Math.max(0, r.avg_power),
      avgHr: r.avg_hr > 0 ? r.avg_hr : null,
      avgCadence: r.avg_cadence > 0 ? r.avg_cadence : null,
      avgSpeedKmh: r.avg_speed ?? null,
      totalAscentM: r.elevation_gain,
      trigger: r.type,
    }));
}
