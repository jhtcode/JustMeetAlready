import React, { useState, useMemo } from 'react';
import {
  computeAvailabilitySummary,
  AvailabilitySummaryItem,
} from '../utils/summary';
import { getTimeZoneFriendlyName } from '../utils/timezone';
import { SchedulerEvent, Participant } from '../types';
import {
  BarChart3,
  Calendar,
  Clock,
  Users,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

interface AvailabilitySummaryListProps {
  event: SchedulerEvent;
  participants: Participant[];
  availability: Record<string, string[]>;
  viewerTimeZone: string;
  onSelectSlot?: (utcIso: string) => void;
}

export const AvailabilitySummaryList: React.FC<AvailabilitySummaryListProps> = ({
  event,
  participants,
  availability,
  viewerTimeZone,
  onSelectSlot,
}) => {
  const [mergeBlocks, setMergeBlocks] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filterThreshold, setFilterThreshold] = useState<'all' | 'majority' | 'top'>('all');

  const tzName = getTimeZoneFriendlyName(viewerTimeZone);

  // Compute the sorted summary list
  const allSummaryItems = useMemo(() => {
    return computeAvailabilitySummary({
      event,
      participants,
      availability,
      viewerTimeZone,
      mergeContiguous: mergeBlocks,
    });
  }, [event, participants, availability, viewerTimeZone, mergeBlocks]);

  const maxAvailableCount = useMemo(() => {
    if (allSummaryItems.length === 0) return 0;
    return allSummaryItems[0].availableCount;
  }, [allSummaryItems]);

  // Filtered items
  const summaryItems = useMemo(() => {
    if (filterThreshold === 'top') {
      return allSummaryItems.filter((item) => item.availableCount === maxAvailableCount);
    }
    if (filterThreshold === 'majority') {
      const half = Math.ceil(participants.length / 2);
      return allSummaryItems.filter((item) => item.availableCount >= half);
    }
    return allSummaryItems;
  }, [allSummaryItems, filterThreshold, maxAvailableCount, participants.length]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopySummary = () => {
    if (summaryItems.length === 0) return;

    const lines = [
      `Group Availability Summary for ${event.name} (${tzName}):`,
      ...summaryItems.map((item) => {
        const names = item.availableNames.join(', ');
        return `• ${item.localDateFormatted} ${item.localTimeFormatted}: ${item.availableCount}/${item.totalCount} available (${names})`;
      }),
    ];

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-700" />
            <span>Group Availability Date & Time Summary</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Sorted by most available members in your time zone:{' '}
            <strong className="text-gray-700 font-semibold">{tzName}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summaryItems.length > 0 && (
            <button
              type="button"
              onClick={handleCopySummary}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                copied
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Summary Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-500" />
                  <span>Copy Summary List</span>
                </>
              )}
            </button>
          )}

          {/* Merge contiguous blocks toggle */}
          <button
            type="button"
            onClick={() => setMergeBlocks(!mergeBlocks)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              mergeBlocks
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {mergeBlocks ? 'Merged blocks' : '15-min slots'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      {allSummaryItems.length > 0 && (
        <div className="px-5 py-2.5 bg-gray-50/60 border-b border-gray-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-gray-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Show:</span>
            <button
              type="button"
              onClick={() => setFilterThreshold('all')}
              className={`px-2 py-0.5 rounded cursor-pointer ${
                filterThreshold === 'all'
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              All with responses ({allSummaryItems.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterThreshold('top')}
              className={`px-2 py-0.5 rounded cursor-pointer ${
                filterThreshold === 'top'
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              Top availability ({maxAvailableCount}/{participants.length})
            </button>
          </div>

          <div className="text-[11px] text-gray-400 hidden sm:block">
            Ranked highest to lowest
          </div>
        </div>
      )}

      {/* Summary List */}
      <div className="divide-y divide-gray-100 max-h-[440px] overflow-y-auto">
        {summaryItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-600">No availability submitted yet</p>
            <p className="text-gray-400 mt-1">
              Participants can sign in and drag-paint their availability to generate the ranked
              time summary.
            </p>
          </div>
        ) : (
          summaryItems.map((item, index) => {
            const isTop = item.availableCount === maxAvailableCount && maxAvailableCount > 0;
            const isExpanded = expandedItems.has(item.id);

            return (
              <div
                key={item.id}
                className={`p-4 transition hover:bg-gray-50 ${
                  isTop ? 'bg-emerald-50/30' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Rank indicator */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        index === 0
                          ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-300'
                          : isTop
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {index + 1}
                    </div>

                    <div>
                      {/* Date and Time item as requested */}
                      <div className="text-sm font-bold text-gray-900 flex flex-wrap items-center gap-1.5">
                        <span className="text-gray-900">{item.localDateFormatted}</span>
                        <span className="text-emerald-800 font-extrabold">
                          {item.localTimeFormatted}
                        </span>
                        <span className="text-xs font-normal text-gray-500">
                          ({tzName})
                        </span>
                        {isTop && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                            Best match
                          </span>
                        )}
                      </div>

                      {/* Summary details & who can attend preview */}
                      <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium text-emerald-900">
                          {item.availableCount} of {item.totalCount} available
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-xs sm:max-w-md">
                          {item.availableNames.join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {/* Availability count badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        isTop
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                          : item.fraction >= 0.5
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-gray-100 text-gray-800 border-gray-300'
                      }`}
                    >
                      {item.availableCount} / {item.totalCount} available
                    </span>

                    {/* Expand/Collapse members details */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200 transition cursor-pointer"
                      aria-label="Toggle member details"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Member Details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pl-9">
                    <div>
                      <span className="font-semibold text-emerald-800 block mb-1">
                        Available ({item.availableNames.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {item.availableNames.map((name) => (
                          <span
                            key={name}
                            className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 font-medium"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-gray-500 block mb-1">
                        Unavailable ({item.unavailableNames.length}):
                      </span>
                      {item.unavailableNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.unavailableNames.map((name) => (
                            <span
                              key={name}
                              className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
