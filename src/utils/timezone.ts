/**
 * Accurate IANA timezone and UTC conversion utilities.
 * Ensures zero hardcoded offsets, proper DST boundary handling,
 * and exact representation of 15-minute meeting blocks.
 */

export interface TimeZoneOption {
  value: string;
  label: string;
  region: string;
}

export const COMMON_TIME_ZONES: TimeZoneOption[] = [
  // US & Canada
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)', region: 'Americas' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)', region: 'Americas' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)', region: 'Americas' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)', region: 'Americas' },
  { value: 'America/Anchorage', label: 'Alaska Time', region: 'Americas' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', region: 'Americas' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)', region: 'Americas' },
  { value: 'America/Toronto', label: 'Eastern Time (Toronto)', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'Brasília Time (São Paulo)', region: 'Americas' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina Time (Buenos Aires)', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas' },
  
  // Europe & Africa
  { value: 'UTC', label: 'UTC (Universal Coordinated Time)', region: 'UTC / GMT' },
  { value: 'Europe/London', label: 'London / GMT / BST', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Central European Time (Paris, Berlin, Rome)', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Central European Time (Berlin)', region: 'Europe' },
  { value: 'Europe/Athens', label: 'Eastern European Time (Athens, Helsinki)', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow Time', region: 'Europe' },
  { value: 'Africa/Cairo', label: 'Cairo Time', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: 'South Africa Standard Time', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'West Africa Time (Lagos)', region: 'Africa' },

  // Asia & Middle East
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai)', region: 'Asia & Middle East' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST)', region: 'Asia & Middle East' },
  { value: 'Asia/Bangkok', label: 'Indochina Time (Bangkok)', region: 'Asia & Middle East' },
  { value: 'Asia/Jakarta', label: 'Western Indonesia Time (WIB / Jakarta)', region: 'Asia & Middle East' },
  { value: 'Asia/Makassar', label: 'Central Indonesia Time (WITA / Bali)', region: 'Asia & Middle East' },
  { value: 'Asia/Jayapura', label: 'Eastern Indonesia Time (WIT / Papua)', region: 'Asia & Middle East' },
  { value: 'Asia/Singapore', label: 'Singapore Time (SGT)', region: 'Asia & Middle East' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong Time (HKT)', region: 'Asia & Middle East' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (Beijing/Shanghai)', region: 'Asia & Middle East' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (Tokyo)', region: 'Asia & Middle East' },
  { value: 'Asia/Seoul', label: 'Korea Standard Time (Seoul)', region: 'Asia & Middle East' },
  
  // Australasia & Pacific
  { value: 'Australia/Perth', label: 'Australian Western Time (Perth)', region: 'Australia & Pacific' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (Sydney, Melbourne)', region: 'Australia & Pacific' },
  { value: 'Australia/Brisbane', label: 'Queensland (Brisbane, No DST)', region: 'Australia & Pacific' },
  { value: 'Pacific/Auckland', label: 'New Zealand Time (Auckland)', region: 'Australia & Pacific' },
];

/**
 * Returns a friendly name for any IANA timezone string.
 */
export function getTimeZoneFriendlyName(tz: string): string {
  const found = COMMON_TIME_ZONES.find((z) => z.value === tz);
  if (found) return found.label;
  
  // Dynamic format using Intl
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'long',
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    return tzPart ? `${tzPart} (${tz})` : tz;
  } catch {
    return tz;
  }
}

/**
 * Get current user's default browser time zone.
 */
export function getDefaultTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) return resolved;
  } catch {
    // fallback
  }
  return 'America/Los_Angeles';
}

/**
 * Convert a wall-clock date and time in an arbitrary IANA timezone to a canonical UTC ISO string.
 * Uses exact inverse offset calculations via Intl.DateTimeFormat.
 */
export function wallClockToUtc(
  year: number,
  month: number, // 1 to 12
  day: number,
  hour: number, // 0 to 23
  minute: number, // 0, 15, 30, 45
  timeZone: string
): string {
  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const getWallTimestamp = (timestamp: number) => {
    const parts = dtf.formatToParts(new Date(timestamp));
    let y = 0, m = 0, d = 0, h = 0, min = 0;
    for (const p of parts) {
      if (p.type === 'year') y = parseInt(p.value, 10);
      else if (p.type === 'month') m = parseInt(p.value, 10);
      else if (p.type === 'day') d = parseInt(p.value, 10);
      else if (p.type === 'hour') h = parseInt(p.value, 10);
      else if (p.type === 'minute') min = parseInt(p.value, 10);
    }
    if (h === 24) h = 0;
    return Date.UTC(y, m - 1, d, h, min, 0, 0);
  };

  const targetWall = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  
  // First pass
  const wall1 = getWallTimestamp(initialUtc);
  const diff1 = wall1 - targetWall;
  const pass1 = initialUtc - diff1;

  // Second pass for DST shift boundaries
  const wall2 = getWallTimestamp(pass1);
  const diff2 = wall2 - targetWall;
  const pass2 = pass1 - diff2;

  return new Date(pass2).toISOString();
}

/**
 * Canonical reference dates for "Days of the Week" mode.
 * Jan 4, 2026 is Sunday, Jan 5 is Monday, ..., Jan 10 is Saturday.
 */
export const WEEKDAY_REFERENCE_DATES = [
  '2026-01-04', // 0: Sunday
  '2026-01-05', // 1: Monday
  '2026-01-06', // 2: Tuesday
  '2026-01-07', // 3: Wednesday
  '2026-01-08', // 4: Thursday
  '2026-01-09', // 5: Friday
  '2026-01-10', // 6: Saturday
];

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEKDAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Generate full list of UTC slot ISO strings for an event based on its configuration.
 */
export function generateEventSlots(config: {
  mode: 'specific' | 'weekdays';
  selectedDates?: string[];
  selectedWeekdays?: number[];
  noEarlierThan: number;
  noLaterThan: number;
  timeZone: string;
}): string[] {
  const slots: string[] = [];
  const { mode, noEarlierThan, noLaterThan, timeZone } = config;

  // Determine dates to iterate over
  let dateStrings: string[] = [];
  if (mode === 'specific' && config.selectedDates && config.selectedDates.length > 0) {
    // Sort dates chronologically
    dateStrings = [...config.selectedDates].sort();
  } else if (mode === 'weekdays' && config.selectedWeekdays && config.selectedWeekdays.length > 0) {
    const sortedDays = [...config.selectedWeekdays].sort((a, b) => a - b);
    dateStrings = sortedDays.map((dayIdx) => WEEKDAY_REFERENCE_DATES[dayIdx]);
  }

  // Iterate over each date
  for (const dateStr of dateStrings) {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // From noEarlierThan hour to noLaterThan hour
    for (let h = noEarlierThan; h <= noLaterThan; h++) {
      for (const m of [0, 15, 30, 45]) {
        // If hour is noLaterThan, When2meet includes the full hour row
        const utcIso = wallClockToUtc(year, month, day, h, m, timeZone);
        slots.push(utcIso);
      }
    }
  }

  return slots;
}

/**
 * Parsed representation of a UTC slot in a viewer's timezone.
 */
export interface LocalSlotView {
  utcIso: string;
  localDateKey: string; // "2026-11-02"
  dayHeaderLabel: string; // "Mon Nov 2" or "Monday"
  weekdayName: string; // "Monday"
  localHour: number; // 0 to 23
  localMinute: number; // 0, 15, 30, 45
  displayTime: string; // e.g. "9:15 AM"
  displayHourLabel: string; // e.g. "9 AM"
  endDisplayTime: string; // e.g. "9:30 AM"
}

/**
 * Format a single UTC ISO slot in a target time zone.
 */
export function formatSlotInTimeZone(
  utcIso: string,
  timeZone: string,
  mode: 'specific' | 'weekdays'
): LocalSlotView {
  const date = new Date(utcIso);
  const endDate = new Date(date.getTime() + 15 * 60 * 1000);

  // Format date parts
  const dtfParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  let y = '', m = '', d = '', weekday = '', h = 0, min = 0;
  for (const p of dtfParts) {
    if (p.type === 'year') y = p.value;
    else if (p.type === 'month') m = p.value;
    else if (p.type === 'day') d = p.value;
    else if (p.type === 'weekday') weekday = p.value;
    else if (p.type === 'hour') h = parseInt(p.value, 10);
    else if (p.type === 'minute') min = parseInt(p.value, 10);
  }
  if (h === 24) h = 0;

  const localDateKey = `${y}-${m}-${d}`;

  // Month name formatting
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
  }).format(date);

  const fullWeekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(date);

  const dayNumber = parseInt(d, 10);

  // Format 12-hour display time
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const displayTime = timeFormatter.format(date);
  const endDisplayTime = timeFormatter.format(endDate);

  const hourLabelFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: true,
  });
  const displayHourLabel = hourLabelFormatter.format(date);

  const dayHeaderLabel =
    mode === 'specific'
      ? `${weekday} ${monthName} ${dayNumber}`
      : fullWeekday;

  return {
    utcIso,
    localDateKey,
    dayHeaderLabel,
    weekdayName: fullWeekday,
    localHour: h,
    localMinute: min,
    displayTime,
    displayHourLabel,
    endDisplayTime,
  };
}

/**
 * Format a human-readable range string for tooltip / inspection in any timezone.
 * e.g. "Monday, Nov 2, 7:00 PM – 7:15 PM"
 */
export function formatSlotRangeInTimeZone(
  utcIso: string,
  timeZone: string,
  mode: 'specific' | 'weekdays'
): string {
  const start = new Date(utcIso);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: mode === 'specific' ? 'short' : undefined,
    day: mode === 'specific' ? 'numeric' : undefined,
  }).format(start);

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const tzAbbr = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(start)
    .find((p) => p.type === 'timeZoneName')?.value || '';

  return `${dateFmt}, ${timeFmt.format(start)} – ${timeFmt.format(end)} ${tzAbbr}`.trim();
}

/**
 * Helper to get 12-hour label for an hour number (0 to 23).
 */
export function getHourLabel(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}
