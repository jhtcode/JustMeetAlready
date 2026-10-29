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

  const isOvernight = noEarlierThan > noLaterThan;

  // Iterate over each date
  for (const dateStr of dateStrings) {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (!isOvernight) {
      // Standard same-day window (e.g. 9:00 AM to 5:00 PM)
      for (let h = noEarlierThan; h <= noLaterThan; h++) {
        for (const m of [0, 15, 30, 45]) {
          const utcIso = wallClockToUtc(year, month, day, h, m, timeZone);
          slots.push(utcIso);
        }
      }
    } else {
      // Overnight window spanning into next morning (e.g. 9:00 PM to 2:00 AM, or 9:00 AM to 2:00 AM next day)
      // Part 1: from noEarlierThan through 23:45 on current date
      for (let h = noEarlierThan; h <= 23; h++) {
        for (const m of [0, 15, 30, 45]) {
          const utcIso = wallClockToUtc(year, month, day, h, m, timeZone);
          slots.push(utcIso);
        }
      }
      // Part 2: from 00:00 through noLaterThan:45 on following calendar day
      const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
      const nextY = nextDate.getUTCFullYear();
      const nextM = nextDate.getUTCMonth() + 1;
      const nextD = nextDate.getUTCDate();
      for (let h = 0; h <= noLaterThan; h++) {
        for (const m of [0, 15, 30, 45]) {
          const utcIso = wallClockToUtc(nextY, nextM, nextD, h, m, timeZone);
          slots.push(utcIso);
        }
      }
    }
  }

  // Deduplicate and return in chronological order
  return Array.from(new Set(slots)).sort();
}

/**
 * Returns the ordered list of hours for an event's schedule window.
 * When noEarlierThan > noLaterThan (e.g. 9 AM to 2 AM), the schedule runs from
 * 9:00 AM through 11:00 PM, then continues past midnight to 2:00 AM late night.
 * The hours between noLaterThan and noEarlierThan (e.g. 2 AM to 9 AM) are blocked/excluded.
 */
export function getHourSequence(noEarlierThan: number, noLaterThan: number): number[] {
  if (noEarlierThan <= noLaterThan) {
    const hours: number[] = [];
    for (let h = noEarlierThan; h <= noLaterThan; h++) {
      hours.push(h);
    }
    return hours;
  }

  // Overnight / late-night window: e.g. 9 (9 AM) to 2 (2 AM)
  // Sequence: 9, 10, ..., 23, 0, 1, 2
  // Hours between 2 AM and 9 AM (3, 4, 5, 6, 7, 8) are excluded/blocked
  const hours: number[] = [];
  for (let h = noEarlierThan; h <= 23; h++) {
    hours.push(h);
  }
  for (let h = 0; h <= noLaterThan; h++) {
    hours.push(h);
  }
  return hours;
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
 * Optionally appends descriptive time-of-day hints (e.g. morning, afternoon, evening).
 */
export function getHourLabel(hour: number, withHint = false): string {
  let baseTime = '';
  if (hour === 0) baseTime = '12:00 AM';
  else if (hour === 12) baseTime = '12:00 PM';
  else if (hour < 12) baseTime = `${hour}:00 AM`;
  else baseTime = `${hour - 12}:00 PM`;

  if (!withHint) {
    return baseTime;
  }

  if (hour === 0) return '12:00 AM (midnight)';
  if (hour === 12) return '12:00 PM (noon)';
  if (hour >= 1 && hour <= 4) return `${baseTime} (late night / early morning)`;
  if (hour >= 5 && hour <= 11) return `${baseTime} (morning)`;
  if (hour >= 13 && hour <= 17) return `${baseTime} (afternoon)`;
  if (hour >= 18 && hour <= 23) return `${baseTime} (evening / night)`;
  return baseTime;
}

/**
 * Returns previous calendar date key (YYYY-MM-DD).
 */
export function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((v) => parseInt(v, 10));
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

export interface GridColumn {
  key: string;
  label: string;
  weekday: string;
}

export interface GridCellData {
  utcIso: string;
  localHour: number;
  localMinute: number;
  localDateKey: string;
  dayHeaderLabel: string;
}

export interface GridStructure {
  dayColumns: GridColumn[];
  hourRange: number[];
  slotLookup: Map<string, GridCellData>;
}

/**
 * Builds the visual calendar grid structure (day columns, hour rows, slot lookup).
 * Seamlessly handles overnight schedules (e.g. 9 AM to 2 AM) by:
 * 1. Excluding blocked hours (e.g. 2 AM to 9 AM) so they do not take up vertical space.
 * 2. Grouping post-midnight slots (e.g. 12 AM - 2 AM) under the session's day column.
 */
export function buildGridStructure(params: {
  eventSlots: string[];
  viewerTimeZone: string;
  mode: 'specific' | 'weekdays';
  noEarlierThan: number;
  noLaterThan: number;
}): GridStructure {
  const { eventSlots, viewerTimeZone, mode, noEarlierThan, noLaterThan } = params;
  if (!eventSlots || eventSlots.length === 0) {
    return { dayColumns: [], hourRange: [], slotLookup: new Map() };
  }

  const isOvernight = noEarlierThan > noLaterThan;

  // Format all slots in viewer's time zone
  const views = eventSlots.map((utcIso) => ({
    utcIso,
    view: formatSlotInTimeZone(utcIso, viewerTimeZone, mode),
  }));

  // Collect present hours in viewer time zone
  const presentHoursSet = new Set<number>();
  for (const item of views) {
    presentHoursSet.add(item.view.localHour);
  }

  let hourRange: number[] = [];
  let startHour = noEarlierThan;

  if (isOvernight) {
    // If wrapping across midnight in viewer's time zone:
    if (presentHoursSet.has(0) && presentHoursSet.has(23) && presentHoursSet.size < 24) {
      // Find start of active window: an hour h in presentHours where h-1 is NOT present
      let detectedStart = -1;
      for (const h of presentHoursSet) {
        const prevH = (h - 1 + 24) % 24;
        if (!presentHoursSet.has(prevH)) {
          detectedStart = h;
          break;
        }
      }
      if (detectedStart !== -1) {
        startHour = detectedStart;
      }
      const seq: number[] = [];
      let curr = startHour;
      while (presentHoursSet.has(curr) && seq.length < 24) {
        seq.push(curr);
        curr = (curr + 1) % 24;
      }
      hourRange = seq;
    } else {
      // Shifted or un-wrapped in viewer time zone
      const sortedHours = Array.from(presentHoursSet).sort((a, b) => a - b);
      if (sortedHours.length > 0) {
        const minH = sortedHours[0];
        const maxH = sortedHours[sortedHours.length - 1];
        startHour = minH;
        for (let h = minH; h <= maxH; h++) {
          if (presentHoursSet.has(h)) hourRange.push(h);
        }
      }
    }
  } else {
    // Standard daytime window: minH to maxH
    const sortedHours = Array.from(presentHoursSet).sort((a, b) => a - b);
    if (sortedHours.length > 0) {
      const minH = sortedHours[0];
      const maxH = sortedHours[sortedHours.length - 1];
      startHour = minH;
      for (let h = minH; h <= maxH; h++) {
        hourRange.push(h);
      }
    }
  }

  const daysMap = new Map<string, GridColumn>();
  const slotLookup = new Map<string, GridCellData>();

  for (const { utcIso, view } of views) {
    let sessionDateKey = view.localDateKey;
    let sessionDayHeaderLabel = view.dayHeaderLabel;
    let sessionWeekday = view.weekdayName;

    // For overnight schedules, slots in the early morning (hours after midnight before startHour)
    // belong to the evening session of the previous calendar day
    if (isOvernight && view.localHour < startHour) {
      sessionDateKey = getPreviousDateKey(view.localDateKey);

      const [y, m, d] = sessionDateKey.split('-').map((v) => parseInt(v, 10));
      const refDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(refDate);
      const weekdayLong = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(refDate);
      const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(refDate);

      sessionDayHeaderLabel = mode === 'specific' ? `${weekdayShort} ${monthShort} ${d}` : weekdayLong;
      sessionWeekday = weekdayLong;
    }

    if (!daysMap.has(sessionDateKey)) {
      daysMap.set(sessionDateKey, {
        key: sessionDateKey,
        label: sessionDayHeaderLabel,
        weekday: sessionWeekday,
      });
    }

    const lookupKey = `${sessionDateKey}_${view.localHour}_${view.localMinute}`;
    slotLookup.set(lookupKey, {
      utcIso,
      localHour: view.localHour,
      localMinute: view.localMinute,
      localDateKey: sessionDateKey,
      dayHeaderLabel: daysMap.get(sessionDateKey)?.label || sessionDayHeaderLabel,
    });
  }

  const dayColumns = Array.from(daysMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  return {
    dayColumns,
    hourRange,
    slotLookup,
  };
}

