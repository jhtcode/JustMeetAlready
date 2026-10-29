import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wallClockToUtc,
  formatSlotInTimeZone,
  formatSlotRangeInTimeZone,
  generateEventSlots,
  getHourLabel,
} from './timezone';

test('wallClockToUtc accurately converts Pacific Time to UTC', () => {
  // Nov 2, 2026 at 7:00 PM (19:00) Pacific is PST (UTC-8)
  // Expected UTC: Nov 3, 2026 at 03:00:00.000Z
  const utcIso = wallClockToUtc(2026, 11, 2, 19, 0, 'America/Los_Angeles');
  assert.equal(utcIso, '2026-11-03T03:00:00.000Z');
});

test('Conversion to Asia/Jakarta (WIB) appears on Tuesday morning', () => {
  // Mon Nov 2, 2026 7:00 PM Pacific -> 2026-11-03T03:00:00.000Z
  const utcIso = wallClockToUtc(2026, 11, 2, 19, 0, 'America/Los_Angeles');
  
  // Format in Asia/Jakarta (UTC+7) -> Nov 3, 2026 at 10:00 AM (Tuesday)
  const wibView = formatSlotInTimeZone(utcIso, 'Asia/Jakarta', 'specific');
  assert.equal(wibView.localDateKey, '2026-11-03');
  assert.equal(wibView.localHour, 10);
  assert.equal(wibView.localMinute, 0);
  assert.equal(wibView.weekdayName, 'Tuesday');
});

test('generateEventSlots generates 15-minute cells for 14 days full day window', () => {
  // 14 days: Nov 2 to Nov 15
  const dates = [];
  for (let d = 2; d <= 15; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    dates.push(`2026-11-${dayStr}`);
  }
  assert.equal(dates.length, 14);

  // Full day window: 12:00 AM (0) through 11:00 PM (23) -> 24 hours * 4 cells = 96 cells per day
  const slots = generateEventSlots({
    mode: 'specific',
    selectedDates: dates,
    noEarlierThan: 0,
    noLaterThan: 23,
    timeZone: 'America/Los_Angeles',
  });

  assert.equal(slots.length, 14 * 24 * 4); // 1,344 cells total
  // First slot is 12:00 AM on Nov 2 in Los Angeles (08:00 UTC)
  assert.equal(slots[0], '2026-11-02T08:00:00.000Z');
});

test('generateEventSlots generates weekday recurring slots', () => {
  // Mon, Wed, Fri = [1, 3, 5]
  // 6:00 PM to 8:00 PM (18 to 20, 3 hours * 4 cells = 12 cells per day, 36 cells total)
  const slots = generateEventSlots({
    mode: 'weekdays',
    selectedWeekdays: [1, 3, 5],
    noEarlierThan: 18,
    noLaterThan: 20,
    timeZone: 'America/Los_Angeles',
  });

  assert.equal(slots.length, 3 * 3 * 4);
});

test('formatSlotRangeInTimeZone formats both viewer and organizer time strings', () => {
  const utcIso = '2026-11-03T03:00:00.000Z';
  const rangeStr = formatSlotRangeInTimeZone(utcIso, 'America/Los_Angeles', 'specific');
  assert.match(rangeStr, /Mon/);
  assert.match(rangeStr, /7:00 PM/);
});

test('getHourLabel maps 24h integers to 12h labels accurately', () => {
  assert.equal(getHourLabel(0), '12:00 AM');
  assert.equal(getHourLabel(9), '9:00 AM');
  assert.equal(getHourLabel(12), '12:00 PM');
  assert.equal(getHourLabel(17), '5:00 PM');
  assert.equal(getHourLabel(23), '11:00 PM');
});
