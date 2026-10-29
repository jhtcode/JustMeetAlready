export type EventMode = 'specific' | 'weekdays';

export interface SchedulerEvent {
  id: string;
  name: string;
  mode: EventMode;
  selectedDates: string[]; // ['2026-11-02', ...] for specific dates
  selectedWeekdays: number[]; // [1, 3, 5] for Mon, Wed, Fri (0 = Sunday, 6 = Saturday)
  noEarlierThan: number; // 0 to 23
  noLaterThan: number; // 0 to 23 (e.g. 23 for 11:00 PM)
  timeZone: string; // IANA string e.g. 'America/Los_Angeles'
  createdAt: string; // ISO string
  slots: string[]; // List of canonical UTC slot ISO strings
}

export interface Participant {
  id: string;
  eventId: string;
  name: string;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventData {
  event: SchedulerEvent;
  participants: Participant[];
  availability: Record<string, string[]>; // participantId -> array of UTC slot ISO strings
}

export interface GridSlotInfo {
  utcIso: string;
  localDateKey: string; // YYYY-MM-DD in viewer timezone
  localDayLabel: string; // "Mon Nov 2" or "Monday"
  localHour: number; // 0-23
  localMinute: number; // 0, 15, 30, 45
  localTimeFormatted: string; // "9:15 AM"
  organizerTimeFormatted: string; // "9:15 AM PST"
}
