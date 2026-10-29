import React, { useState } from 'react';
import {
  COMMON_TIME_ZONES,
  getDefaultTimeZone,
  getHourLabel,
  WEEKDAY_NAMES,
} from '../utils/timezone';
import { EventMode, SchedulerEvent } from '../types';
import { Calendar, Clock, Globe, ArrowRight, ShieldAlert, Sparkles, Check, AlertCircle } from 'lucide-react';

interface CreateEventProps {
  onEventCreated: (event: SchedulerEvent) => void;
  onOpenDemo?: () => void;
}

export const CreateEvent: React.FC<CreateEventProps> = ({
  onEventCreated,
  onOpenDemo,
}) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<EventMode>('specific');
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    // Default to 14 days starting next Monday, Nov 2-15 or next 14 days
    const dates: string[] = [];
    const base = new Date();
    base.setDate(base.getDate() + 1); // start tomorrow
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  });
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [noEarlierThan, setNoEarlierThan] = useState<number>(9); // 9:00 AM
  const [noLaterThan, setNoLaterThan] = useState<number>(17); // 5:00 PM
  const [timeZone, setTimeZone] = useState<string>(() => getDefaultTimeZone());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Month navigation for date picker
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);

  // Helper for calendar month generation
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handleToggleDate = (dateStr: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    );
  };

  const handleSelectPresetDates = (type: 'nov2_15' | 'next14' | 'next7' | 'clear') => {
    if (type === 'clear') {
      setSelectedDates([]);
      return;
    }
    if (type === 'nov2_15') {
      const dates: string[] = [];
      for (let d = 2; d <= 15; d++) {
        const dd = d < 10 ? `0${d}` : `${d}`;
        dates.push(`2026-11-${dd}`);
      }
      setSelectedDates(dates);
      setCalendarMonth(new Date(2026, 10, 1)); // Nov 2026
      return;
    }
    const count = type === 'next14' ? 14 : 7;
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i + 1);
      dates.push(d.toISOString().slice(0, 10));
    }
    setSelectedDates(dates);
    if (dates.length > 0) {
      setCalendarMonth(new Date(dates[0].slice(0, 7) + '-01'));
    }
  };

  const handleToggleWeekday = (dayIdx: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide an event name.');
      return;
    }

    if (mode === 'specific' && selectedDates.length === 0) {
      setError('Please select at least one date on the calendar.');
      return;
    }

    if (mode === 'weekdays' && selectedWeekdays.length === 0) {
      setError('Please select at least one weekday.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          mode,
          selectedDates,
          selectedWeekdays,
          noEarlierThan,
          noLaterThan,
          timeZone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create event');
      }

      onEventCreated(data.event);
    } catch (err: any) {
      setError(err.message || 'Something went wrong creating the event.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        {/* Header banner */}
        <div className="bg-emerald-700 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Create a New Event</h1>
              <p className="text-emerald-100 text-sm mt-1">
                Fast shared grid group scheduling: drag-paint free times, see the group heatmap, and find the best meeting times.
              </p>
            </div>
            {onOpenDemo && (
              <button
                type="button"
                onClick={onOpenDemo}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-xs font-medium text-emerald-100 transition shadow-sm border border-emerald-600 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                View Demo Event
              </button>
            )}
          </div>
        </div>

        {/* Warning banner per PRD Section 2.1 */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>No accounts, no dashboard.</strong> The URL generated after creation{' '}
            <em>is</em> the event. Losing the link means losing access—be sure to copy and bookmark it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* 1. Event Name */}
          <div>
            <label
              htmlFor="event-name"
              className="block text-sm font-semibold text-gray-800 mb-1.5"
            >
              Event name
            </label>
            <input
              id="event-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Men's Small Group Online"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-gray-900 placeholder-gray-400 text-base"
              required
            />
          </div>

          {/* 2. Date Mode Selector */}
          <div>
            <span className="block text-sm font-semibold text-gray-800 mb-2">
              Dates to consider
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => setMode('specific')}
                className={`py-2 text-sm font-medium rounded-md transition ${
                  mode === 'specific'
                    ? 'bg-white text-emerald-800 shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Specific Dates
              </button>
              <button
                type="button"
                onClick={() => setMode('weekdays')}
                className={`py-2 text-sm font-medium rounded-md transition ${
                  mode === 'weekdays'
                    ? 'bg-white text-emerald-800 shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Days of the Week
              </button>
            </div>

            {mode === 'specific' ? (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                {/* Presets & Navigation */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Calendar className="w-4 h-4 text-emerald-700" />
                    <span>Click dates to select or unselect:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelectPresetDates('nov2_15')}
                      className="px-2 py-1 text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded font-medium transition"
                    >
                      Nov 2–15 (14 days)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPresetDates('next14')}
                      className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 rounded transition"
                    >
                      Next 14 days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPresetDates('clear')}
                      className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Month header & navigation */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth(new Date(year, month - 1, 1))
                    }
                    className="p-1 text-gray-500 hover:text-gray-900 rounded"
                    aria-label="Previous month"
                  >
                    &larr; Prev
                  </button>
                  <span className="font-semibold text-sm text-gray-800">
                    {calendarMonth.toLocaleString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth(new Date(year, month + 1, 1))
                    }
                    className="p-1 text-gray-500 hover:text-gray-900 rounded"
                    aria-label="Next month"
                  >
                    Next &rarr;
                  </button>
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <div key={d} className="font-semibold text-gray-500 py-1">
                      {d}
                    </div>
                  ))}

                  {/* Empty cells before month start */}
                  {Array.from({ length: firstDayOfWeek }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}

                  {/* Days */}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dayNum = i + 1;
                    const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                    const mStr = month + 1 < 10 ? `0${month + 1}` : `${month + 1}`;
                    const fullDateStr = `${year}-${mStr}-${dayStr}`;
                    const isSelected = selectedDates.includes(fullDateStr);

                    return (
                      <button
                        key={fullDateStr}
                        type="button"
                        onClick={() => handleToggleDate(fullDateStr)}
                        className={`h-9 w-full rounded-md flex items-center justify-center font-medium transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold shadow-sm ring-2 ring-emerald-700'
                            : 'bg-white hover:bg-emerald-50 text-gray-800 border border-gray-200'
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-xs text-emerald-800 font-medium">
                  {selectedDates.length} {selectedDates.length === 1 ? 'date' : 'dates'} selected
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Select days for a recurring weekly meeting:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedWeekdays([1, 2, 3, 4, 5])}
                      className="text-emerald-700 hover:underline"
                    >
                      Mon–Fri
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6])}
                      className="text-emerald-700 hover:underline"
                    >
                      All Days
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WEEKDAY_NAMES.map((wName, idx) => {
                    const isSelected = selectedWeekdays.includes(idx);
                    return (
                      <button
                        key={wName}
                        type="button"
                        onClick={() => handleToggleWeekday(idx)}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium text-left flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-700 text-white font-semibold'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span>{wName}</span>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3 & 4: No earlier than & No later than */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="no-earlier-than"
                className="block text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4 text-emerald-700" />
                No earlier than
              </label>
              <select
                id="no-earlier-than"
                value={noEarlierThan}
                onChange={(e) => setNoEarlierThan(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none text-sm"
              >
                {hourOptions.map((h) => (
                  <option key={`earlier-${h}`} value={h}>
                    {getHourLabel(h, true)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="no-later-than"
                className="block text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4 text-emerald-700" />
                No later than
              </label>
              <select
                id="no-later-than"
                value={noLaterThan}
                onChange={(e) => setNoLaterThan(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none text-sm"
              >
                {hourOptions.map((h) => (
                  <option key={`later-${h}`} value={h}>
                    {getHourLabel(h, true)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Smart AM vs PM / Overnight & Blocked Hours Guidance */}
          {noEarlierThan > noLaterThan && (
            <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-lg text-xs space-y-2">
              <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Active Schedule: {getHourLabel(noEarlierThan)} – {getHourLabel(noLaterThan)} late night
                </span>
              </div>
              <p className="text-emerald-900 leading-relaxed">
                This schedule allows meetings from <strong>{getHourLabel(noEarlierThan)}</strong> through late night <strong>{getHourLabel(noLaterThan)}</strong>.
                The hours between <strong>{getHourLabel(noLaterThan)} and {getHourLabel(noEarlierThan)}</strong> are automatically <strong>blocked</strong> from scheduling and omitted from the calendar grid.
              </p>
              {noLaterThan < 12 && noEarlierThan <= noLaterThan + 12 && (
                <div className="pt-1 border-t border-emerald-200/80">
                  <p className="text-[11px] text-gray-600 mb-1.5">
                    Did you mean afternoon on the same calendar day instead of late night?
                  </p>
                  <button
                    type="button"
                    onClick={() => setNoLaterThan(noLaterThan + 12)}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold rounded text-xs shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Switch "No later than" to {getHourLabel(noLaterThan + 12)} (afternoon)</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500">
            Supports a full 24-hour window: 12:00 AM through 11:00 PM. Each hour contains four
            15-minute paintable blocks.
          </p>

          {/* 5: Time Zone */}
          <div>
            <label
              htmlFor="time-zone"
              className="block text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5"
            >
              <Globe className="w-4 h-4 text-emerald-700" />
              Time zone
            </label>
            <select
              id="time-zone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none text-sm"
            >
              {COMMON_TIME_ZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label} ({tz.value})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Pre-filled from your browser. Participants in other zones will see times accurately
              converted to their own local time.
            </p>
          </div>

          {/* 6: Create Event Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold rounded-lg shadow transition flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50"
            >
              <span>{submitting ? 'Creating Event...' : 'Create Event'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
