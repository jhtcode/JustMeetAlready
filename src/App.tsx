/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CreateEvent } from './components/CreateEvent';
import { EventPage } from './components/EventPage';
import { SchedulerEvent } from './types';
import { Calendar, Plus, Sparkles, Clock } from 'lucide-react';

export default function App() {
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);

  // Sync state with URL params
  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const evtId = params.get('event');
      if (evtId) {
        setCurrentEventId(evtId);
      } else {
        // Also check path like /e/:id
        const match = window.location.pathname.match(/\/e\/([a-zA-Z0-9_-]+)/);
        if (match) {
          setCurrentEventId(match[1]);
        } else {
          setCurrentEventId(null);
        }
      }
    };

    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, []);

  const handleEventCreated = (event: SchedulerEvent) => {
    setCurrentEventId(event.id);
    const newUrl = `${window.location.pathname}?event=${event.id}`;
    window.history.pushState({ eventId: event.id }, '', newUrl);
  };

  const handleOpenDemo = () => {
    const demoId = 'mens-small-group-demo';
    setCurrentEventId(demoId);
    window.history.pushState({ eventId: demoId }, '', `?event=${demoId}`);
  };

  const handleCreateNew = () => {
    setCurrentEventId(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-gray-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-emerald-900 text-white border-b border-emerald-950 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-2.5 text-left font-bold text-lg hover:text-emerald-200 transition cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-inner">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="tracking-tight text-white">Group Scheduler</span>
            </div>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {currentEventId ? (
              <button
                type="button"
                onClick={handleCreateNew}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-xs font-semibold text-emerald-100 transition border border-emerald-700 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Event</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-xs font-semibold text-emerald-100 transition border border-emerald-700 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Open Example Event</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-12">
        {currentEventId ? (
          <EventPage eventId={currentEventId} onCreateNew={handleCreateNew} />
        ) : (
          <CreateEvent
            onEventCreated={handleEventCreated}
            onOpenDemo={handleOpenDemo}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        <p>
          Group Scheduler — When2meet-style shared grid scheduling with multi-timezone correctness and touch support.
        </p>
      </footer>
    </div>
  );
}
