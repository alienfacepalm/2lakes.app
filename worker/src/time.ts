/**
 * King County lake buoy timestamps are plain local text such as `11/9/2026 3:02:00 PM`
 * with no timezone. Checked against 7,021 readings saved over April to November 2026,
 * the clock is a fixed UTC-8 all year (no daylight saving), so:
 *
 *   UTC time = King County label + 8 hours
 *
 * Never run the label through `new Date(label)`: that reads it in whatever timezone the
 * running code happens to use, which is how the legacy data ended up with the same
 * reading stored under two different times.
 */
export const KC_UTC_OFFSET_HOURS = 8;

const KC_LABEL = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/;

/** UTC epoch milliseconds for a King County label, or null if it is not a valid label. */
export function kingCountyLabelToUtcMs(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = KC_LABEL.exec(label.trim());
  if (!m) return null;

  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const meridiem = m[7]?.toLowerCase();

  if (month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null; // e.g. Feb 31

  return wall + KC_UTC_OFFSET_HOURS * 3_600_000;
}

/** Canonical ISO 8601 UTC string (with milliseconds) for a King County label. */
export function kingCountyLabelToUtcIso(label: string | null | undefined): string | null {
  const ms = kingCountyLabelToUtcMs(label);
  return ms === null ? null : new Date(ms).toISOString();
}
