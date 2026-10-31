export const LIMITS = {
  maxDates: 31,
  maxSlots: 3200, // 31 dates x 96 slots, plus headroom for DST edge cases
  maxEventName: 100,
  maxParticipantName: 50,
  maxPassword: 128,
  maxParticipants: 100,
} as const;

/** Event and participant ids: safe for URLs and Firestore document ids. */
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CreateEventInput {
  name: string;
  mode: 'specific' | 'weekdays';
  selectedDates: string[];
  selectedWeekdays: number[];
  noEarlierThan: number;
  noLaterThan: number;
  timeZone: string;
}

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseHour(v: unknown, fallback: number, label: string): Result<number> {
  if (v === undefined || v === null || v === '') return { ok: true, value: fallback };
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 23) {
    return { ok: false, error: `${label} must be a whole hour between 0 and 23.` };
  }
  return { ok: true, value: n };
}

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
}

export function parseCreateEvent(body: unknown): Result<CreateEventInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;

  const name = cleanName(b.name);
  if (!name) return { ok: false, error: 'Event name is required.' };
  if (name.length > LIMITS.maxEventName) {
    return { ok: false, error: `Event name must be ${LIMITS.maxEventName} characters or fewer.` };
  }

  if (b.mode !== 'specific' && b.mode !== 'weekdays') {
    return { ok: false, error: 'Invalid mode.' };
  }

  let timeZone = 'America/Los_Angeles';
  if (b.timeZone !== undefined && b.timeZone !== null && b.timeZone !== '') {
    if (!isValidTimeZone(b.timeZone)) return { ok: false, error: 'Invalid time zone.' };
    timeZone = b.timeZone;
  }

  const earliest = parseHour(b.noEarlierThan, 0, 'Earliest hour');
  if (!earliest.ok) return earliest;
  const latest = parseHour(b.noLaterThan, 23, 'Latest hour');
  if (!latest.ok) return latest;

  let selectedDates: string[] = [];
  let selectedWeekdays: number[] = [];

  if (b.mode === 'specific') {
    if (!Array.isArray(b.selectedDates) || b.selectedDates.length === 0) {
      return { ok: false, error: 'At least one date must be selected.' };
    }
    if (b.selectedDates.length > LIMITS.maxDates * 2) {
      return { ok: false, error: `Please select at most ${LIMITS.maxDates} dates.` };
    }
    for (const d of b.selectedDates) {
      if (typeof d !== 'string' || !isRealDate(d)) {
        return { ok: false, error: 'Dates must be valid and formatted YYYY-MM-DD.' };
      }
    }
    selectedDates = Array.from(new Set(b.selectedDates as string[])).sort();
    if (selectedDates.length > LIMITS.maxDates) {
      return { ok: false, error: `Please select at most ${LIMITS.maxDates} dates.` };
    }
  } else {
    if (!Array.isArray(b.selectedWeekdays) || b.selectedWeekdays.length === 0) {
      return { ok: false, error: 'At least one weekday must be selected.' };
    }
    if (b.selectedWeekdays.length > 14) return { ok: false, error: 'Invalid weekdays.' };
    for (const w of b.selectedWeekdays) {
      if (!Number.isInteger(w) || w < 0 || w > 6) {
        return { ok: false, error: 'Weekdays must be whole numbers from 0 to 6.' };
      }
    }
    selectedWeekdays = Array.from(new Set(b.selectedWeekdays as number[])).sort((x, y) => x - y);
  }

  return {
    ok: true,
    value: {
      name,
      mode: b.mode,
      selectedDates,
      selectedWeekdays,
      noEarlierThan: earliest.value,
      noLaterThan: latest.value,
      timeZone,
    },
  };
}

export interface SigninInput {
  name: string;
  password: string; // '' means no password
}

export function parseSignin(body: unknown): Result<SigninInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const name = cleanName(b.name);
  if (!name) return { ok: false, error: 'Please enter a name.' };
  if (name.length > LIMITS.maxParticipantName) {
    return { ok: false, error: `Name must be ${LIMITS.maxParticipantName} characters or fewer.` };
  }
  let password = '';
  if (b.password !== undefined && b.password !== null) {
    if (typeof b.password !== 'string') return { ok: false, error: 'Invalid password.' };
    password = b.password.trim();
    if (password.length > LIMITS.maxPassword) {
      return { ok: false, error: `Password must be ${LIMITS.maxPassword} characters or fewer.` };
    }
  }
  return { ok: true, value: { name, password } };
}
