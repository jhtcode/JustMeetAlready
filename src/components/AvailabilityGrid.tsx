import React, { useState, useRef, useMemo } from 'react';
import {
  formatSlotInTimeZone,
  formatSlotRangeInTimeZone,
  getHourLabel,
  getTimeZoneFriendlyName,
  buildGridStructure,
  GridCellData,
} from '../utils/timezone';
import { SchedulerEvent, Participant } from '../types';
import { Check, Users, User, Info, HelpCircle } from 'lucide-react';

interface AvailabilityGridProps {
  type: 'personal' | 'group';
  event: SchedulerEvent;
  viewerTimeZone: string;
  participants: Participant[];
  availability: Record<string, string[]>; // participantId -> UTC ISO[]
  currentParticipant: Participant | null;
  onSavePersonalAvailability?: (slots: string[]) => void;
  highlightedParticipantId?: string | null;
  onSelectParticipant?: (participantId: string | null) => void;
}

type CellData = GridCellData;

export const AvailabilityGrid: React.FC<AvailabilityGridProps> = ({
  type,
  event,
  viewerTimeZone,
  participants,
  availability,
  currentParticipant,
  onSavePersonalAvailability,
  highlightedParticipantId,
  onSelectParticipant,
}) => {
  const isPersonal = type === 'personal';
  const isSignedIn = Boolean(currentParticipant);

  // Local state for personal availability during drag
  const currentPersonalSlots = useMemo(() => {
    if (!currentParticipant) return new Set<string>();
    return new Set(availability[currentParticipant.id] || []);
  }, [currentParticipant, availability]);

  const [activeSlots, setActiveSlots] = useState<Set<string>>(currentPersonalSlots);
  const [isDragging, setIsDragging] = useState(false);
  const dragActionRef = useRef<'add' | 'remove' | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const activeSlotsRef = useRef<Set<string>>(activeSlots);

  // Sync activeSlots when currentPersonalSlots changes outside drag
  React.useEffect(() => {
    if (!isDragging) {
      setActiveSlots(currentPersonalSlots);
      activeSlotsRef.current = currentPersonalSlots;
    }
  }, [currentPersonalSlots, isDragging]);

  // Group inspection tooltip state for hover / tap
  const [inspectedSlot, setInspectedSlot] = useState<string | null>(null);

  // Process all event slots into viewer timezone structure with overnight and blocked hours support
  const { dayColumns, hourRange, slotLookup } = useMemo(() => {
    return buildGridStructure({
      eventSlots: event.slots,
      viewerTimeZone,
      mode: event.mode,
      noEarlierThan: event.noEarlierThan,
      noLaterThan: event.noLaterThan,
    });
  }, [event.slots, viewerTimeZone, event.mode, event.noEarlierThan, event.noLaterThan]);


  // Count total participants who have responded
  const totalRespondents = useMemo(() => {
    return Object.keys(availability).filter(
      (pId) => availability[pId] && availability[pId].length > 0
    ).length;
  }, [availability]);

  // Heatmap shade generator for Group grid (0/N to N/N)
  const getHeatmapColor = (utcIso: string): { bg: string; text: string; count: number } => {
    if (totalRespondents === 0) {
      return { bg: '#ffffff', text: '#374151', count: 0 };
    }

    let availableCount = 0;
    for (const pId of Object.keys(availability)) {
      if (availability[pId]?.includes(utcIso)) {
        availableCount++;
      }
    }

    if (availableCount === 0) {
      return { bg: '#ffffff', text: '#374151', count: 0 };
    }

    // Fraction available from 0 to 1
    const fraction = availableCount / totalRespondents;

    // Green heatmap scale from light to dark green based on group availability
    let bg = '#dcfce7'; // 1/N
    let text = '#14532d';

    if (fraction === 1) {
      bg = '#15803d'; // 100% available - dark green
      text = '#ffffff';
    } else if (fraction >= 0.8) {
      bg = '#16a34a';
      text = '#ffffff';
    } else if (fraction >= 0.6) {
      bg = '#22c55e';
      text = '#ffffff';
    } else if (fraction >= 0.4) {
      bg = '#4ade80';
      text = '#14532d';
    } else if (fraction >= 0.2) {
      bg = '#86efac';
      text = '#14532d';
    } else {
      bg = '#bbf7d0';
      text = '#14532d';
    }

    return { bg, text, count: availableCount };
  };

  // Inspect slot details
  const inspectionDetails = useMemo(() => {
    if (!inspectedSlot) return null;

    const availableNames: string[] = [];
    const unavailableNames: string[] = [];

    for (const p of participants) {
      const isFree = availability[p.id]?.includes(inspectedSlot);
      if (isFree) {
        availableNames.push(p.name);
      } else {
        unavailableNames.push(p.name);
      }
    }

    const viewerTimeStr = formatSlotRangeInTimeZone(inspectedSlot, viewerTimeZone, event.mode);
    const organizerTimeStr = formatSlotRangeInTimeZone(inspectedSlot, event.timeZone, event.mode);

    return {
      utcIso: inspectedSlot,
      viewerTimeStr,
      organizerTimeStr,
      availableCount: availableNames.length,
      totalCount: participants.length,
      availableNames,
      unavailableNames,
    };
  }, [inspectedSlot, participants, availability, viewerTimeZone, event.timeZone, event.mode]);

  // Touch & Pointer Drag Painting Mechanics
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPersonal || !isSignedIn) return;

    const target = e.target as HTMLElement;
    const cell = target.closest('[data-slot-iso]') as HTMLElement | null;
    if (!cell) return;

    const slotIso = cell.getAttribute('data-slot-iso');
    if (!slotIso) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setIsDragging(true);

    const currentlyActive = activeSlotsRef.current.has(slotIso);
    const action = currentlyActive ? 'remove' : 'add';
    dragActionRef.current = action;

    const next = new Set(activeSlotsRef.current);
    if (action === 'add') {
      next.add(slotIso);
    } else {
      next.delete(slotIso);
    }
    activeSlotsRef.current = next;
    setActiveSlots(next);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPersonal || !isDragging || !dragActionRef.current || !isSignedIn) return;

    // Use elementFromPoint to hit-test under pointer (works seamlessly on mobile touch!)
    const elem = document.elementFromPoint(e.clientX, e.clientY);
    const cell = elem?.closest('[data-slot-iso]') as HTMLElement | null;
    if (!cell) return;

    const slotIso = cell.getAttribute('data-slot-iso');
    if (!slotIso) return;

    const action = dragActionRef.current;
    const currentSet = activeSlotsRef.current;
    const hasSlot = currentSet.has(slotIso);

    if (action === 'add' && !hasSlot) {
      const next = new Set(currentSet);
      next.add(slotIso);
      activeSlotsRef.current = next;
      setActiveSlots(next);
    } else if (action === 'remove' && hasSlot) {
      const next = new Set(currentSet);
      next.delete(slotIso);
      activeSlotsRef.current = next;
      setActiveSlots(next);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPersonal || !isDragging) return;

    setIsDragging(false);
    dragActionRef.current = null;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // Save immediately to backend! (No save button required)
    if (onSavePersonalAvailability) {
      onSavePersonalAvailability(Array.from(activeSlotsRef.current));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Title & Legend Bar */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {isPersonal ? (
              <>
                <User className="w-5 h-5 text-emerald-700" />
                <span>Your Availability</span>
              </>
            ) : (
              <>
                <Users className="w-5 h-5 text-emerald-700" />
                <span>Group's Availability</span>
              </>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isPersonal ? (
              isSignedIn ? (
                <span className="font-medium text-emerald-800">
                  Click and drag to toggle; saves immediately.
                </span>
              ) : (
                <span className="text-amber-800 font-medium">
                  Sign in with your name above to paint your availability.
                </span>
              )
            ) : (
              <span>
                Darker green indicates more people free. Hover or tap any cell for details.
              </span>
            )}
          </p>
        </div>

        {/* Legend */}
        {isPersonal ? (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-600 inline-block border border-emerald-700" />
              <span className="text-gray-700 font-medium">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-rose-100 inline-block border border-rose-300" />
              <span className="text-gray-700">Unavailable</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600 font-medium">0/{totalRespondents} Available</span>
            <div className="flex h-4 w-28 rounded overflow-hidden border border-gray-300">
              <div className="flex-1 bg-white" />
              <div className="flex-1 bg-emerald-100" />
              <div className="flex-1 bg-emerald-300" />
              <div className="flex-1 bg-emerald-500" />
              <div className="flex-1 bg-emerald-700" />
            </div>
            <span className="text-gray-900 font-bold">{totalRespondents}/{totalRespondents} Available</span>
          </div>
        )}
      </div>

      {/* Group Cell Inspector (Hover or Tap) */}
      {!isPersonal && (
        <div className="border-b border-gray-200 bg-emerald-50/50 px-5 py-3 min-h-[58px] flex items-center justify-between transition-all">
          {inspectionDetails ? (
            <div className="w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-emerald-100">
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    {inspectionDetails.viewerTimeStr}
                  </div>
                  <div className="text-xs text-gray-500">
                    Organizer zone: {inspectionDetails.organizerTimeStr}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {inspectionDetails.availableCount} / {inspectionDetails.totalCount} Available
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Available list */}
                <div>
                  <span className="font-semibold text-emerald-900 flex items-center gap-1 mb-1">
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    Available ({inspectionDetails.availableNames.length}):
                  </span>
                  {inspectionDetails.availableNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {inspectionDetails.availableNames.map((name) => (
                        <span
                          key={name}
                          className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 font-medium text-[11px]"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 italic text-[11px]">No one available</span>
                  )}
                </div>

                {/* Unavailable list */}
                <div>
                  <span className="font-semibold text-gray-700 flex items-center gap-1 mb-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                    Unavailable ({inspectionDetails.unavailableNames.length}):
                  </span>
                  {inspectionDetails.unavailableNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {inspectionDetails.unavailableNames.map((name) => (
                        <span
                          key={name}
                          className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 text-[11px]"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 italic text-[11px]">None</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-1 italic">
              <Info className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Hover or tap any cell on the grid below to inspect who is available.</span>
            </div>
          )}
        </div>
      )}

      {/* Grid container with touch-action: none for touch painting without scrolling */}
      <div
        ref={gridContainerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative flex-1 overflow-x-auto overflow-y-auto select-none p-4 max-h-[560px] ${
          isPersonal && !isSignedIn ? 'opacity-60 pointer-events-none' : ''
        }`}
        style={{
          touchAction: isPersonal && isSignedIn ? 'none' : 'auto',
          WebkitUserSelect: 'none',
        }}
      >
        <div className="min-w-fit inline-block">
          {/* Header Row: Days */}
          <div className="flex sticky top-0 bg-white z-10 border-b border-gray-300 pb-1">
            {/* Corner spacer for sticky time column */}
            <div className="w-20 shrink-0 sticky left-0 bg-white z-20 text-[11px] font-semibold text-gray-500 flex items-end justify-center pb-1">
              Time
            </div>

            {/* Day columns headers */}
            {dayColumns.map((day) => (
              <div
                key={day.key}
                className="w-24 shrink-0 px-1 text-center border-l border-gray-200"
              >
                <div className="text-xs font-bold text-gray-800 truncate">{day.label}</div>
                <div className="text-[10px] text-gray-500 truncate">{day.weekday}</div>
              </div>
            ))}
          </div>

          {/* Time rows with 15-minute subdivisions */}
          <div className="relative">
            {hourRange.map((hour) => (
              <div key={`row-${hour}`} className="flex border-b border-gray-200">
                {/* Hourly time label on the left (Sticky) */}
                <div className="w-20 shrink-0 sticky left-0 bg-white z-10 pr-2 text-right border-r border-gray-300 flex flex-col justify-start">
                  <span className="text-xs font-semibold text-gray-700 pt-0.5">
                    {getHourLabel(hour)}
                  </span>
                </div>

                {/* Day columns for this hour */}
                {dayColumns.map((day) => (
                  <div
                    key={`${day.key}-${hour}`}
                    className="w-24 shrink-0 border-l border-gray-200 flex flex-col"
                  >
                    {[0, 15, 30, 45].map((minute) => {
                      const lookupKey = `${day.key}_${hour}_${minute}`;
                      const cell = slotLookup.get(lookupKey);

                      if (!cell) {
                        return (
                          <div
                            key={lookupKey}
                            className="h-4 bg-gray-50 border-b border-dotted border-gray-200"
                          />
                        );
                      }

                      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
                      const ampm = hour < 12 ? 'AM' : 'PM';
                      const minStr = minute === 0 ? '00' : `${minute}`;
                      const timeLabel = `${hour12}:${minStr} ${ampm}`;

                      // Check cell state
                      if (isPersonal) {
                        const isAvailable = activeSlots.has(cell.utcIso);
                        return (
                          <div
                            key={cell.utcIso}
                            data-slot-iso={cell.utcIso}
                            role="button"
                            tabIndex={0}
                            aria-label={`${cell.dayHeaderLabel} at ${timeLabel} - ${
                              isAvailable ? 'Available' : 'Unavailable'
                            }`}
                            className={`h-4 border-b border-gray-200 cursor-pointer transition-colors ${
                              isAvailable
                                ? 'bg-emerald-500 hover:bg-emerald-600'
                                : 'bg-rose-50/70 hover:bg-rose-100'
                            }`}
                          />
                        );
                      } else {
                        // Group heatmap cell
                        const { bg, count } = getHeatmapColor(cell.utcIso);
                        const isHighlighted =
                          highlightedParticipantId &&
                          availability[highlightedParticipantId]?.includes(cell.utcIso);
                        const isInspected = inspectedSlot === cell.utcIso;

                        return (
                          <div
                            key={cell.utcIso}
                            data-slot-iso={cell.utcIso}
                            onClick={() => setInspectedSlot(cell.utcIso)}
                            onMouseEnter={() => setInspectedSlot(cell.utcIso)}
                            role="button"
                            tabIndex={0}
                            aria-label={`${cell.dayHeaderLabel} at ${timeLabel} - ${count} of ${totalRespondents} available`}
                            style={{ backgroundColor: bg }}
                            className={`h-4 border-b border-gray-200 cursor-pointer transition-all ${
                              isInspected
                                ? 'ring-2 ring-indigo-600 z-10'
                                : isHighlighted
                                ? 'ring-2 ring-amber-500 z-10 shadow-sm'
                                : 'hover:brightness-95'
                            }`}
                          />
                        );
                      }
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Signed-out prompt banner inside personal grid */}
      {isPersonal && !isSignedIn && (
        <div className="p-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Please type your name in the sign-in section above to start painting.</span>
          </div>
        </div>
      )}

    </div>
  );
};
