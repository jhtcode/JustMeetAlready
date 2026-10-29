import { SchedulerEvent, Participant } from '../types';
import { getTimeZoneFriendlyName } from './timezone';

export interface AvailabilitySummaryItem {
  id: string; // unique key
  startUtcIso: string;
  endUtcIso: string;
  localDateFormatted: string; // e.g. "13th November 2026" or "Every Friday"
  localTimeFormatted: string; // e.g. "@ 2:00 PM – 3:30 PM" or "@ 2 PM"
  fullDisplayLabel: string; // e.g. "13th November 2026 @ 2:00 PM – 3:30 PM (Pacific Time)"
  availableCount: number;
  totalCount: number;
  fraction: number;
  availableNames: string[];
  unavailableNames: string[];
  slotsCount: number; // how many 15-minute slots in this block
}

/**
 * Returns ordinal string for a day of month, e.g. 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 13 -> "13th", 21 -> "21st"
 */
export function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * Formats time compactly: e.g. "2 PM" if minute is 0, or "2:15 PM"
 */
export function formatCompactTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === 'hour')?.value || '';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value || '';

  if (minute === '00') {
    return `${hour} ${dayPeriod}`;
  }
  return `${hour}:${minute} ${dayPeriod}`;
}

/**
 * Compute Group's availability date and time summary list, sorted by most available members.
 */
export function computeAvailabilitySummary(params: {
  event: SchedulerEvent;
  participants: Participant[];
  availability: Record<string, string[]>;
  viewerTimeZone: string;
  mergeContiguous?: boolean; // default true
}): AvailabilitySummaryItem[] {
  const { event, participants, availability, viewerTimeZone, mergeContiguous = true } = params;

  if (!event || !event.slots || event.slots.length === 0) {
    return [];
  }

  const totalCount = participants.length;

  // 1. Calculate availability for each individual 15-minute slot
  interface SlotStat {
    utcIso: string;
    startDate: Date;
    endDate: Date;
    availableIds: string[];
    availableNames: string[];
    unavailableNames: string[];
    count: number;
    localDateKey: string;
    dayFormatted: string;
  }

  const slotStats: SlotStat[] = [];

  for (const utcIso of event.slots) {
    const startDate = new Date(utcIso);
    const endDate = new Date(startDate.getTime() + 15 * 60 * 1000);

    const availableIds: string[] = [];
    const availableNames: string[] = [];
    const unavailableNames: string[] = [];

    for (const p of participants) {
      if (availability[p.id]?.includes(utcIso)) {
        availableIds.push(p.id);
        availableNames.push(p.name);
      } else {
        unavailableNames.push(p.name);
      }
    }

    const count = availableNames.length;
    // Only include slots where at least 1 person is available (if respondents exist)
    if (totalCount > 0 && count === 0) {
      continue;
    }

    // Format local date
    let localDateKey = '';
    let dayFormatted = '';

    if (event.mode === 'specific') {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: viewerTimeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).formatToParts(startDate);

      const y = parts.find((p) => p.type === 'year')?.value || '';
      const m = parts.find((p) => p.type === 'month')?.value || '';
      const dNum = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
      const ordinal = getOrdinalSuffix(dNum);

      localDateKey = `${y}-${m}-${dNum}`;
      dayFormatted = `${ordinal} ${m} ${y}`;
    } else {
      const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: viewerTimeZone,
        weekday: 'long',
      }).format(startDate);

      localDateKey = weekday;
      dayFormatted = `Every ${weekday}`;
    }

    slotStats.push({
      utcIso,
      startDate,
      endDate,
      availableIds: availableIds.sort(),
      availableNames: availableNames.sort(),
      unavailableNames: unavailableNames.sort(),
      count,
      localDateKey,
      dayFormatted,
    });
  }

  // 2. Sort chronologically first for contiguous grouping
  slotStats.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  // 3. Merge contiguous slots if mergeContiguous is enabled
  interface MergedBlock {
    startUtcIso: string;
    endUtcIso: string;
    startDate: Date;
    endDate: Date;
    dayFormatted: string;
    localDateKey: string;
    count: number;
    availableNames: string[];
    unavailableNames: string[];
    slotsCount: number;
  }

  const mergedBlocks: MergedBlock[] = [];

  if (mergeContiguous) {
    let current: MergedBlock | null = null;

    for (const stat of slotStats) {
      const sameParticipants =
        current &&
        current.localDateKey === stat.localDateKey &&
        current.count === stat.count &&
        current.availableNames.join('|') === stat.availableNames.join('|');

      const isConsecutive =
        current && current.endDate.getTime() === stat.startDate.getTime();

      if (current && sameParticipants && isConsecutive) {
        // Extend current block
        current.endDate = stat.endDate;
        current.endUtcIso = stat.endDate.toISOString();
        current.slotsCount += 1;
      } else {
        if (current) {
          mergedBlocks.push(current);
        }
        current = {
          startUtcIso: stat.utcIso,
          endUtcIso: stat.endDate.toISOString(),
          startDate: stat.startDate,
          endDate: stat.endDate,
          dayFormatted: stat.dayFormatted,
          localDateKey: stat.localDateKey,
          count: stat.count,
          availableNames: stat.availableNames,
          unavailableNames: stat.unavailableNames,
          slotsCount: 1,
        };
      }
    }
    if (current) {
      mergedBlocks.push(current);
    }
  } else {
    for (const stat of slotStats) {
      mergedBlocks.push({
        startUtcIso: stat.utcIso,
        endUtcIso: stat.endDate.toISOString(),
        startDate: stat.startDate,
        endDate: stat.endDate,
        dayFormatted: stat.dayFormatted,
        localDateKey: stat.localDateKey,
        count: stat.count,
        availableNames: stat.availableNames,
        unavailableNames: stat.unavailableNames,
        slotsCount: 1,
      });
    }
  }

  const tzFriendly = getTimeZoneFriendlyName(viewerTimeZone);

  // 4. Transform into final summary items
  const summaryItems: AvailabilitySummaryItem[] = mergedBlocks.map((block) => {
    const startTimeStr = formatCompactTime(block.startDate, viewerTimeZone);
    const endTimeStr = formatCompactTime(block.endDate, viewerTimeZone);

    const timeFormatted =
      block.slotsCount > 1
        ? `@ ${startTimeStr} – ${endTimeStr}`
        : `@ ${startTimeStr}`;

    const fullDisplayLabel = `${block.dayFormatted} ${timeFormatted} (${tzFriendly})`;

    return {
      id: `${block.startUtcIso}_${block.endUtcIso}`,
      startUtcIso: block.startUtcIso,
      endUtcIso: block.endUtcIso,
      localDateFormatted: block.dayFormatted,
      localTimeFormatted: timeFormatted,
      fullDisplayLabel,
      availableCount: block.count,
      totalCount,
      fraction: totalCount > 0 ? block.count / totalCount : 0,
      availableNames: block.availableNames,
      unavailableNames: block.unavailableNames,
      slotsCount: block.slotsCount,
    };
  });

  // 5. CRITICAL REQUIREMENT: Sort according to the most number of available members descending!
  summaryItems.sort((a, b) => {
    // 1st criteria: Highest availableCount
    if (b.availableCount !== a.availableCount) {
      return b.availableCount - a.availableCount;
    }
    // 2nd criteria: Chronological start time
    return new Date(a.startUtcIso).getTime() - new Date(b.startUtcIso).getTime();
  });

  return summaryItems;
}
