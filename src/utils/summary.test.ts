import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrdinalSuffix, computeAvailabilitySummary } from './summary';
import { SchedulerEvent, Participant } from '../types';

test('getOrdinalSuffix formats ordinal numbers correctly', () => {
  assert.equal(getOrdinalSuffix(1), '1st');
  assert.equal(getOrdinalSuffix(2), '2nd');
  assert.equal(getOrdinalSuffix(3), '3rd');
  assert.equal(getOrdinalSuffix(4), '4th');
  assert.equal(getOrdinalSuffix(6), '6th');
  assert.equal(getOrdinalSuffix(11), '11th');
  assert.equal(getOrdinalSuffix(12), '12th');
  assert.equal(getOrdinalSuffix(13), '13th');
  assert.equal(getOrdinalSuffix(21), '21st');
  assert.equal(getOrdinalSuffix(22), '22nd');
  assert.equal(getOrdinalSuffix(23), '23rd');
  assert.equal(getOrdinalSuffix(31), '31st');
});

test('computeAvailabilitySummary sorts list according to the most available members', () => {
  const event: SchedulerEvent = {
    id: 'test-event',
    name: 'Team Meeting',
    mode: 'specific',
    selectedDates: ['2026-11-06', '2026-11-13'],
    selectedWeekdays: [],
    noEarlierThan: 14,
    noLaterThan: 16,
    timeZone: 'America/Los_Angeles',
    createdAt: new Date().toISOString(),
    slots: [
      // Nov 6: 2 PM (22:00 UTC)
      '2026-11-06T22:00:00.000Z',
      '2026-11-06T22:15:00.000Z',
      // Nov 13: 2 PM (22:00 UTC)
      '2026-11-13T22:00:00.000Z',
      '2026-11-13T22:15:00.000Z',
    ],
  };

  const participants: Participant[] = [
    { id: 'p1', eventId: 'test-event', name: 'Alice', hasPassword: false, createdAt: '', updatedAt: '' },
    { id: 'p2', eventId: 'test-event', name: 'Bob', hasPassword: false, createdAt: '', updatedAt: '' },
    { id: 'p3', eventId: 'test-event', name: 'Charlie', hasPassword: false, createdAt: '', updatedAt: '' },
    { id: 'p4', eventId: 'test-event', name: 'David', hasPassword: false, createdAt: '', updatedAt: '' },
    { id: 'p5', eventId: 'test-event', name: 'Eve', hasPassword: false, createdAt: '', updatedAt: '' },
    { id: 'p6', eventId: 'test-event', name: 'Frank', hasPassword: false, createdAt: '', updatedAt: '' },
  ];

  // Nov 13 has 5 available (Alice, Bob, Charlie, David, Eve)
  // Nov 6 has 3 available (Alice, Bob, Charlie)
  const availability: Record<string, string[]> = {
    p1: ['2026-11-06T22:00:00.000Z', '2026-11-06T22:15:00.000Z', '2026-11-13T22:00:00.000Z', '2026-11-13T22:15:00.000Z'],
    p2: ['2026-11-06T22:00:00.000Z', '2026-11-06T22:15:00.000Z', '2026-11-13T22:00:00.000Z', '2026-11-13T22:15:00.000Z'],
    p3: ['2026-11-06T22:00:00.000Z', '2026-11-06T22:15:00.000Z', '2026-11-13T22:00:00.000Z', '2026-11-13T22:15:00.000Z'],
    p4: ['2026-11-13T22:00:00.000Z', '2026-11-13T22:15:00.000Z'],
    p5: ['2026-11-13T22:00:00.000Z', '2026-11-13T22:15:00.000Z'],
    p6: [],
  };

  const summary = computeAvailabilitySummary({
    event,
    participants,
    availability,
    viewerTimeZone: 'America/Los_Angeles',
    mergeContiguous: true,
  });

  assert.equal(summary.length, 2);

  // First item MUST be 13th November with 5/6 available!
  assert.equal(summary[0].availableCount, 5);
  assert.equal(summary[0].totalCount, 6);
  assert.match(summary[0].localDateFormatted, /13th November 2026/);
  assert.match(summary[0].localTimeFormatted, /@ 2 PM/);

  // Second item is 6th November with 3/6 available
  assert.equal(summary[1].availableCount, 3);
  assert.equal(summary[1].totalCount, 6);
  assert.match(summary[1].localDateFormatted, /6th November 2026/);
});
