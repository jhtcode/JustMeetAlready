import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  COMMON_TIME_ZONES,
  getDefaultTimeZone,
  getTimeZoneFriendlyName,
} from '../utils/timezone';
import { SchedulerEvent, Participant } from '../types';
import { AvailabilityGrid } from './AvailabilityGrid';
import { AvailabilitySummaryList } from './AvailabilitySummaryList';
import {
  Globe,
  Share2,
  Lock,
  UserCheck,
  LogOut,
  ArrowDown,
  ArrowUp,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Eye,
  PlusCircle,
} from 'lucide-react';

interface EventPageProps {
  eventId: string;
  onCreateNew?: () => void;
}

export const EventPage: React.FC<EventPageProps> = ({ eventId, onCreateNew }) => {
  const [event, setEvent] = useState<SchedulerEvent | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [viewerTimeZone, setViewerTimeZone] = useState<string>(() => getDefaultTimeZone());

  // Sign-in state
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Participant highlight for group grid
  const [highlightedParticipantId, setHighlightedParticipantId] = useState<string | null>(null);

  // Link copy feedback
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Save indicator
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  // Refs for mobile jump scrolling
  const yourAvailabilityRef = useRef<HTMLDivElement>(null);
  const groupAvailabilityRef = useRef<HTMLDivElement>(null);

  // Fetch event data
  const fetchEventData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Event not found. Please verify the URL link.');
        }
        throw new Error('Could not load event data.');
      }
      const data = await res.json();
      setEvent(data.event);
      setParticipants(data.participants);
      setAvailability(data.availability);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load event.');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [eventId]);

  // Initial load
  useEffect(() => {
    fetchEventData(true);
  }, [fetchEventData]);

  // Live polling for group updates every 3 seconds (PRD 4.4)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchEventData(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [fetchEventData]);

  // Handle Sign In / Registration
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!nameInput.trim()) {
      setAuthError('Please enter your name.');
      return;
    }

    setIsSigningIn(true);
    try {
      const res = await fetch(`/api/events/${eventId}/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.trim(),
          password: passwordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in.');
      }

      setCurrentParticipant(data.participant);
      // Update local availability state with their existing painting
      if (data.participant.id) {
        setAvailability((prev) => ({
          ...prev,
          [data.participant.id]: data.availability || [],
        }));
      }

      // Re-fetch event to update participant list
      fetchEventData(false);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = () => {
    setCurrentParticipant(null);
    setNameInput('');
    setPasswordInput('');
    setAuthError(null);
  };

  // Immediate Save on painting drag release
  const handleSavePersonalAvailability = async (slots: string[]) => {
    if (!currentParticipant) return;

    setIsSaving(true);
    // Optimistic local update
    setAvailability((prev) => ({
      ...prev,
      [currentParticipant.id]: slots,
    }));

    try {
      const res = await fetch(`/api/events/${eventId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: currentParticipant.id,
          availableSlots: slots,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save availability.');
      }

      setLastSavedTime(new Date());
    } catch (err) {
      console.error('Error saving availability:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const scrollToGroup = () => {
    groupAvailabilityRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToYour = () => {
    yourAvailabilityRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Loading event schedule...</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Event Not Found</h2>
        <p className="text-gray-600 text-sm mb-6">{error || 'This event link may be invalid or expired.'}</p>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 py-2 bg-emerald-700 text-white font-medium rounded-lg hover:bg-emerald-800 transition"
          >
            Create a New Event
          </button>
        )}
      </div>
    );
  }

  const isOrganizerTz = viewerTimeZone === event.timeZone;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner: Event Title & Timezone Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {event.name}
              </h1>
              {onCreateNew && (
                <button
                  type="button"
                  onClick={onCreateNew}
                  className="hidden md:inline-flex items-center gap-1 text-xs text-emerald-800 font-semibold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-700" />
                  New Event
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Event created in{' '}
              <strong className="text-gray-700 font-semibold">
                {getTimeZoneFriendlyName(event.timeZone)}
              </strong>{' '}
              • {event.mode === 'specific' ? `${event.selectedDates.length} Specific Dates` : 'Weekly Recurring'}
            </p>
          </div>

          {/* Time Zone Selector with named label at all times (PRD Section 4.2 & 5) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 shrink-0">
              <Globe className="w-4 h-4 text-emerald-700" />
              <span>Your Time Zone:</span>
            </div>
            <select
              value={viewerTimeZone}
              onChange={(e) => setViewerTimeZone(e.target.value)}
              className="text-xs font-medium bg-white text-gray-900 border border-gray-300 rounded px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
            >
              {COMMON_TIME_ZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Days of the Week mode notice (PRD Section 5) */}
        {event.mode === 'weekdays' && !isOrganizerTz && (
          <div className="mt-3 text-xs bg-blue-50 text-blue-900 border border-blue-200 rounded-md p-2.5">
            <strong>Time Zone Notice:</strong> Weekday columns were defined in the organizer's time zone ({getTimeZoneFriendlyName(event.timeZone)}). In your local zone ({getTimeZoneFriendlyName(viewerTimeZone)}), slots and weekdays shift to your exact corresponding local days and hours.
          </div>
        )}

        {/* Share Link Banner (PRD Section 3 & 4.1) */}
        <div className="mt-4 pt-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Share this page:</strong> This URL is the event link. Paste it into your group chat so members can paint their free times.
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer shrink-0 ${
              copiedLink
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
            }`}
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Event Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Per-Event Sign In Box (PRD Section 4.3) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        {currentParticipant ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-emerald-950">
                  Signed in as {currentParticipant.name}
                  {currentParticipant.hasPassword && (
                    <span className="ml-2 text-xs font-normal text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded">
                      Password protected
                    </span>
                  )}
                </div>
                <div className="text-xs text-emerald-800">
                  {isSaving ? (
                    <span className="font-semibold animate-pulse text-amber-800">
                      Saving availability...
                    </span>
                  ) : lastSavedTime ? (
                    <span>Saved to event • Drag on "Your Availability" below to paint or erase</span>
                  ) : (
                    <span>Drag on "Your Availability" below to paint or erase</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 bg-white border border-gray-300 hover:bg-gray-100 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer self-start sm:self-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch Person / Sign Out</span>
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-700" />
                Sign in for this event only
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Name and password are only for this event; it is not an account. A different spelling creates a different person.
              </p>
            </div>

            {authError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="flex-1">
                <label htmlFor="participant-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  Your Name
                </label>
                <input
                  id="participant-name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-gray-900"
                  required
                />
              </div>

              <div className="flex-1">
                <label htmlFor="participant-password" className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <span>Password</span>
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="participant-password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Only if you wish to protect your answers"
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-gray-900"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="py-2 px-5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isSigningIn ? 'Signing In...' : 'Sign In / Join'}
              </button>
            </form>

            <div className="mt-2 text-[11px] text-gray-500 leading-normal">
              * If you enter a password, only people with this password can edit your answers. If left blank, anyone with the link can edit your responses.
            </div>
          </div>
        )}
      </div>

      {/* Mobile Jump Links between Grids (PRD Section 4.2) */}
      <div className="flex lg:hidden justify-between items-center bg-gray-100 p-2.5 rounded-lg text-xs font-semibold text-emerald-800">
        <button
          type="button"
          onClick={scrollToYour}
          className="flex items-center gap-1 hover:underline"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>Your Availability</span>
        </button>
        <span className="text-gray-400">|</span>
        <button
          type="button"
          onClick={scrollToGroup}
          className="flex items-center gap-1 hover:underline"
        >
          <span>Group's Availability</span>
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Two Grids: Side-by-side on desktop, Stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Your Availability */}
        <div ref={yourAvailabilityRef} id="your-availability">
          <AvailabilityGrid
            type="personal"
            event={event}
            viewerTimeZone={viewerTimeZone}
            participants={participants}
            availability={availability}
            currentParticipant={currentParticipant}
            onSavePersonalAvailability={handleSavePersonalAvailability}
          />
        </div>

        {/* Right: Group's Availability (Heatmap) */}
        <div ref={groupAvailabilityRef} id="group-availability">
          <AvailabilityGrid
            type="group"
            event={event}
            viewerTimeZone={viewerTimeZone}
            participants={participants}
            availability={availability}
            currentParticipant={currentParticipant}
            highlightedParticipantId={highlightedParticipantId}
            onSelectParticipant={setHighlightedParticipantId}
          />
        </div>
      </div>

      {/* Group Availability Summary List (Ranked by highest number of available members) */}
      <div id="availability-summary">
        <AvailabilitySummaryList
          event={event}
          participants={participants}
          availability={availability}
          viewerTimeZone={viewerTimeZone}
        />
      </div>

      {/* Participant List & Reading Aid (PRD Section 4.4 SHOULD) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <span>Group Participants ({participants.length})</span>
            </h3>
            <p className="text-xs text-gray-500">
              Click a name below to highlight that person's availability on the group grid.
            </p>
          </div>

          {highlightedParticipantId && (
            <button
              type="button"
              onClick={() => setHighlightedParticipantId(null)}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition self-start sm:self-auto cursor-pointer"
            >
              Clear highlight
            </button>
          )}
        </div>

        {participants.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No one has signed in yet. Be the first to type your name above!
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const isHighlighted = highlightedParticipantId === p.id;
              const hasPainted = availability[p.id] && availability[p.id].length > 0;
              const isCurrent = currentParticipant?.id === p.id;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setHighlightedParticipantId(isHighlighted ? null : p.id)
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border ${
                    isHighlighted
                      ? 'bg-amber-100 text-amber-900 border-amber-400 ring-2 ring-amber-400 font-bold'
                      : isCurrent
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      hasPainted ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  />
                  <span>{p.name}</span>
                  {p.hasPassword && <Lock className="w-3 h-3 text-gray-400" />}
                  {isHighlighted && <Eye className="w-3 h-3 text-amber-700" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Plain Privacy Statement (PRD Section 7) */}
      <div className="text-center text-xs text-gray-400 py-2">
        Names and availability are visible to anyone with this link. No email addresses or accounts are collected.
      </div>
    </div>
  );
};
