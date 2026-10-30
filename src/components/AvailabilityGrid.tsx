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
import {
  Check,
  Users,
  User,
  Info,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Paintbrush,
  Hand,
} from 'lucide-react';

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

  // Mobile & Touch interaction mode: 'paint' (drag to paint with auto-scroll) vs 'pan' (touch scroll & tap to toggle)
  const [touchMode, setTouchMode] = useState<'paint' | 'pan'>('paint');

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

  // Edge auto-scrolling engine for continuous scrolling during drag-painting
  const autoScrollState = useRef<{
    rafId: number | null;
    vx: number;
    vy: number;
    lastX: number;
    lastY: number;
  }>({
    rafId: null,
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
  });

  const stopAutoScroll = () => {
    if (autoScrollState.current.rafId !== null) {
      cancelAnimationFrame(autoScrollState.current.rafId);
      autoScrollState.current.rafId = null;
    }
    autoScrollState.current.vx = 0;
    autoScrollState.current.vy = 0;
  };

  const applyDragToSlot = (slotIso: string, action: 'add' | 'remove') => {
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

  const startAutoScroll = () => {
    if (autoScrollState.current.rafId !== null) return;

    const scrollLoop = () => {
      const { vx, vy, lastX, lastY } = autoScrollState.current;
      const container = gridContainerRef.current;

      if (container && (vx !== 0 || vy !== 0)) {
        container.scrollLeft += vx;
        container.scrollTop += vy;

        // Hit-test element under pointer as grid scrolls under finger
        if (dragActionRef.current && isSignedIn) {
          const elem = document.elementFromPoint(lastX, lastY);
          const cell = elem?.closest('[data-slot-iso]') as HTMLElement | null;
          const slotIso = cell?.getAttribute('data-slot-iso');
          if (slotIso) {
            applyDragToSlot(slotIso, dragActionRef.current);
          }
        }
      }

      if (autoScrollState.current.vx !== 0 || autoScrollState.current.vy !== 0) {
        autoScrollState.current.rafId = requestAnimationFrame(scrollLoop);
      } else {
        autoScrollState.current.rafId = null;
      }
    };

    autoScrollState.current.rafId = requestAnimationFrame(scrollLoop);
  };

  const updateAutoScrollSpeed = (clientX: number, clientY: number) => {
    const container = gridContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    autoScrollState.current.lastX = clientX;
    autoScrollState.current.lastY = clientY;

    // Sticky time column is ~80px wide on the left
    const leftEdge = rect.left + 80;
    const rightEdge = rect.right;
    const topEdge = rect.top + 35;
    const bottomEdge = rect.bottom;

    const EDGE_MARGIN = 55;
    const MAX_SPEED = 14;

    let vx = 0;
    let vy = 0;

    // Check right edge
    if (clientX > rightEdge - EDGE_MARGIN && clientX <= rightEdge + 40) {
      const intensity = Math.min(1, (clientX - (rightEdge - EDGE_MARGIN)) / EDGE_MARGIN);
      vx = Math.max(3, Math.round(intensity * MAX_SPEED));
    }
    // Check left edge (past sticky time column)
    else if (clientX < leftEdge + EDGE_MARGIN && clientX >= rect.left - 20) {
      const intensity = Math.min(1, (leftEdge + EDGE_MARGIN - clientX) / EDGE_MARGIN);
      vx = -Math.max(3, Math.round(intensity * MAX_SPEED));
    }

    // Check bottom edge
    if (clientY > bottomEdge - EDGE_MARGIN && clientY <= bottomEdge + 30) {
      const intensity = Math.min(1, (clientY - (bottomEdge - EDGE_MARGIN)) / EDGE_MARGIN);
      vy = Math.max(3, Math.round(intensity * MAX_SPEED));
    }
    // Check top edge
    else if (clientY < topEdge + EDGE_MARGIN && clientY >= rect.top - 20) {
      const intensity = Math.min(1, (topEdge + EDGE_MARGIN - clientY) / EDGE_MARGIN);
      vy = -Math.max(3, Math.round(intensity * MAX_SPEED));
    }

    autoScrollState.current.vx = vx;
    autoScrollState.current.vy = vy;

    if (vx !== 0 || vy !== 0) {
      startAutoScroll();
    } else {
      stopAutoScroll();
    }
  };

  // Day navigation controls
  const scrollDays = (direction: -1 | 1) => {
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollBy({
        left: direction * 192, // Scroll by 2 day columns
        behavior: 'smooth',
      });
    }
  };

  const scrollToDayIndex = (index: number) => {
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollTo({
        left: index * 96,
        behavior: 'smooth',
      });
    }
  };

  // Helper to extract slots for a day column
  const getDaySlots = (dayKey: string): string[] => {
    const result: string[] = [];
    for (const [key, cell] of slotLookup.entries()) {
      if (key.startsWith(`${dayKey}_`)) {
        result.push(cell.utcIso);
      }
    }
    return result;
  };

  // Bulk Day and Grid Actions
  const handleFillDay = (dayKey: string) => {
    if (!isPersonal || !isSignedIn) return;
    const daySlots = getDaySlots(dayKey);
    const next = new Set(activeSlotsRef.current);
    daySlots.forEach((s) => next.add(s));
    activeSlotsRef.current = next;
    setActiveSlots(next);
    if (onSavePersonalAvailability) {
      onSavePersonalAvailability(Array.from(next));
    }
  };

  const handleClearDay = (dayKey: string) => {
    if (!isPersonal || !isSignedIn) return;
    const daySlots = getDaySlots(dayKey);
    const next = new Set(activeSlotsRef.current);
    daySlots.forEach((s) => next.delete(s));
    activeSlotsRef.current = next;
    setActiveSlots(next);
    if (onSavePersonalAvailability) {
      onSavePersonalAvailability(Array.from(next));
    }
  };

  const handleSelectAll = () => {
    if (!isPersonal || !isSignedIn) return;
    const next = new Set(event.slots);
    activeSlotsRef.current = next;
    setActiveSlots(next);
    if (onSavePersonalAvailability) {
      onSavePersonalAvailability(Array.from(next));
    }
  };

  const handleClearAll = () => {
    if (!isPersonal || !isSignedIn) return;
    const next = new Set<string>();
    activeSlotsRef.current = next;
    setActiveSlots(next);
    if (onSavePersonalAvailability) {
      onSavePersonalAvailability([]);
    }
  };

  // Tap-to-toggle single slot (especially used in 'pan' mode)
  const handleCellClick = (slotIso: string) => {
    if (!isPersonal || !isSignedIn) return;
    const currentSet = activeSlotsRef.current;
    const next = new Set(currentSet);
    if (next.has(slotIso)) {
      next.delete(slotIso);
    } else {
      next.add(slotIso);
    }
    activeSlotsRef.current = next;
    setActiveSlots(next);
    if (onSavePersonalAvailability) {
      onSavePersonalAvailability(Array.from(next));
    }
  };


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

    // In pan / scroll mode on mobile, allow normal touch navigation (swiping left/right across days)
    if (touchMode === 'pan') {
      return;
    }

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

    applyDragToSlot(slotIso, action);
    updateAutoScrollSpeed(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPersonal || !isDragging || !dragActionRef.current || !isSignedIn) return;

    updateAutoScrollSpeed(e.clientX, e.clientY);

    // Use elementFromPoint to hit-test under pointer (works seamlessly on mobile touch!)
    const elem = document.elementFromPoint(e.clientX, e.clientY);
    const cell = elem?.closest('[data-slot-iso]') as HTMLElement | null;
    if (!cell) return;

    const slotIso = cell.getAttribute('data-slot-iso');
    if (!slotIso) return;

    applyDragToSlot(slotIso, dragActionRef.current);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    stopAutoScroll();
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

      {/* Day Navigation & Mobile Mode Bar */}
      <div className="bg-gray-50/90 border-b border-gray-200 px-3 py-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
        {/* Day scroll chevrons & day chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
          <button
            type="button"
            onClick={() => scrollDays(-1)}
            className="p-1.5 rounded-lg bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 shadow-2xs flex items-center gap-0.5 shrink-0 cursor-pointer transition active:scale-95"
            title="Scroll to previous days"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px] font-medium pr-1">Prev Day</span>
          </button>

          <div className="flex items-center gap-1 overflow-x-auto">
            {dayColumns.map((day, idx) => (
              <button
                key={day.key}
                type="button"
                onClick={() => scrollToDayIndex(idx)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white hover:bg-emerald-50 hover:text-emerald-800 border border-gray-200 text-gray-700 shrink-0 transition active:scale-95 cursor-pointer shadow-2xs"
              >
                {day.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => scrollDays(1)}
            className="p-1.5 rounded-lg bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 shadow-2xs flex items-center gap-0.5 shrink-0 cursor-pointer transition active:scale-95"
            title="Scroll to next days"
            aria-label="Next day"
          >
            <span className="hidden sm:inline text-[11px] font-medium pl-1">Next Day</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Personal Mode Quick Controls: Mode Switch & Bulk Actions */}
        {isPersonal && isSignedIn && (
          <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-200">
            {/* Touch Mode Segmented Toggle */}
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-200/70 text-[11px] font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => setTouchMode('paint')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                  touchMode === 'paint'
                    ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
                title="Drag finger to paint availability across slots"
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Drag to Paint</span>
              </button>
              <button
                type="button"
                onClick={() => setTouchMode('pan')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                  touchMode === 'pan'
                    ? 'bg-emerald-700 text-white shadow-2xs font-bold'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
                title="Swipe with your finger to scroll horizontally across days, tap any slot to toggle"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Swipe & Tap</span>
              </button>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2 py-1 rounded-md bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-semibold transition cursor-pointer shadow-2xs"
                title="Mark all event slots available"
              >
                All Free
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2 py-1 rounded-md bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium transition cursor-pointer shadow-2xs"
                title="Clear all availability"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Hint Banner */}
      {isPersonal && isSignedIn && (
        <div className="bg-emerald-50/70 border-b border-emerald-100 px-3 py-1.5 flex items-center justify-between text-[11px] text-emerald-900">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>
              {touchMode === 'pan' ? (
                <strong>Swipe & Tap mode:</strong>
              ) : (
                <strong>Drag to Paint mode:</strong>
              )}{' '}
              {touchMode === 'pan'
                ? 'Swipe across days freely with your finger. Tap any slot to toggle.'
                : 'Drag across hours to paint. Drag near edges or use Day arrows ‹ › to scroll to next days.'}
            </span>
          </div>
        </div>
      )}

      {/* Grid container */}
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
          touchAction: isPersonal && isSignedIn && touchMode === 'paint' ? 'none' : 'auto',
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
                className="w-24 shrink-0 px-1 py-1 text-center border-l border-gray-200 flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-gray-800 truncate">{day.label}</div>
                  <div className="text-[10px] text-gray-500 truncate">{day.weekday}</div>
                </div>
                {isPersonal && isSignedIn && (
                  <div className="flex items-center justify-center gap-1 mt-1 pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleFillDay(day.key)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100/80 hover:bg-emerald-200 text-emerald-900 font-semibold cursor-pointer transition active:scale-95"
                      title={`Mark all hours on ${day.label} as available`}
                    >
                      Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearDay(day.key)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium cursor-pointer transition active:scale-95"
                      title={`Clear all hours on ${day.label}`}
                    >
                      Clear
                    </button>
                  </div>
                )}
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
                            onClick={() => handleCellClick(cell.utcIso)}
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
