import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wallClockToUtc,
  formatSlotInTimeZone,
  formatSlotRangeInTimeZone,
  generateEventSlots,
  getHourLabel,
  getHourSequence,
  buildGridStructure,
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

test('generateEventSlots generates overnight slots across midnight', () => {
  // 9:00 PM (21) to 2:00 AM (2) overnight
  const slots = generateEventSlots({
    mode: 'specific',
    selectedDates: ['2026-11-06'],
    noEarlierThan: 21,
    noLaterThan: 2,
    timeZone: 'America/Los_Angeles',
  });

  // Hours: 21, 22, 23 (3 hours) + 0, 1, 2 (3 hours) = 6 hours * 4 cells = 24 cells
  assert.equal(slots.length, 24);
  assert.equal(slots[0], wallClockToUtc(2026, 11, 6, 21, 0, 'America/Los_Angeles'));
  assert.equal(slots[slots.length - 1], wallClockToUtc(2026, 11, 7, 2, 45, 'America/Los_Angeles'));
});

test('getHourSequence blocks hours between 2 AM and 9 AM when scheduling 9 AM to 2 AM', () => {
  // 9 AM (9) to 2 AM (2)
  const seq = getHourSequence(9, 2);
  // Expected: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2 (18 hours)
  assert.equal(seq.length, 18);
  assert.equal(seq[0], 9);
  assert.equal(seq[14], 23);
  assert.equal(seq[15], 0);
  assert.equal(seq[17], 2);

  // Blocked hours: 3, 4, 5, 6, 7, 8 (2 AM to 9 AM) MUST NOT be present
  for (const blockedHour of [3, 4, 5, 6, 7, 8]) {
    assert.equal(seq.includes(blockedHour), false);
  }
});

test('getHourLabel maps 24h integers to 12h labels accurately', () => {
  assert.equal(getHourLabel(0), '12:00 AM');
  assert.equal(getHourLabel(9), '9:00 AM');
  assert.equal(getHourLabel(12), '12:00 PM');
  assert.equal(getHourLabel(17), '5:00 PM');
  assert.equal(getHourLabel(23), '11:00 PM');
});

test('buildGridStructure groups late-night slots under session day column and blocks 2 AM to 9 AM', () => {
  const slots = generateEventSlots({
    mode: 'specific',
    selectedDates: ['2026-11-13'],
    noEarlierThan: 9,
    noLaterThan: 2,
    timeZone: 'America/Los_Angeles',
  });

  const grid = buildGridStructure({
    eventSlots: slots,
    viewerTimeZone: 'America/Los_Angeles',
    mode: 'specific',
    noEarlierThan: 9,
    noLaterThan: 2,
  });

  // Exactly 1 day column: Friday Nov 13 (late night 12 AM - 2 AM stays under Friday)
  assert.equal(grid.dayColumns.length, 1);
  assert.equal(grid.dayColumns[0].key, '2026-11-13');

  // Hour range runs 9 AM to 11 PM, then 12 AM to 2 AM (18 hours total)
  assert.equal(grid.hourRange.length, 18);
  assert.equal(grid.hourRange[0], 9);
  assert.equal(grid.hourRange[14], 23);
  assert.equal(grid.hourRange[15], 0);
  assert.equal(grid.hourRange[17], 2);

  // Blocked hours 3..8 are NOT present
  for (const blocked of [3, 4, 5, 6, 7, 8]) {
    assert.equal(grid.hourRange.includes(blocked), false);
  }

  // All 72 slots (18 hours * 4 cells) are present in slotLookup under Friday's column
  assert.equal(slots.length, 72);
  for (const utcIso of slots) {
    let found = false;
    for (const cell of grid.slotLookup.values()) {
      if (cell.utcIso === utcIso) {
        found = true;
        assert.equal(cell.localDateKey, '2026-11-13');
        break;
      }
    }
    assert.equal(found, true, `Slot ${utcIso} must be found in slotLookup under Friday 2026-11-13`);
  }
});

