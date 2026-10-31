/**
 * API router for the Cloudflare Worker version.
 *
 * This mirrors server/app.ts from the hardened Node build route for route,
 * status code for status code, so the unchanged React frontend works
 * without modification (apart from the session-token change in EventPage,
 * which the hardened build also made). Express is gone: routing is a
 * plain Request -> Response function, which is all a Worker needs.
 *
 * Differences from the Node build, and why they are safe:
 * - Rate limits are per-isolate in-memory (best effort). Cloudflare's edge
 *   already absorbs floods, and the security-critical lockout — repeated
 *   wrong passwords — is persisted in D1, so it cannot be dodged by
 *   landing on a fresh isolate.
 * - Event/bundle caching is also per-isolate with a 2 s TTL, same as the
 *   Node build. It only cuts D1 reads from the frontend's 3 s polling;
 *   it never serves stale writes, because availability writes delete the
 *   cached bundle for that event.
 * - Passwords use PBKDF2 (see worker/security.ts), not scrypt.
 */
import { generateEventSlots, wallClockToUtc } from '../src/utils/timezone';
import type { Participant, SchedulerEvent } from '../src/types';
import type { ParticipantRecord, Store } from './store';
import { hashPassword, hashToken, newEventId, newSessionToken, verifyPassword } from './security';
import { ID_RE, LIMITS, parseCreateEvent, parseSignin } from '../server/validate';

export const DEMO_ID = 'mens-small-group-demo';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2000;
const CACHE_MAX_ENTRIES = 500;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

interface Bundle {
  event: SchedulerEvent;
  participants: Participant[];
  availability: Record<string, string[]>;
}

const toPublic = (p: ParticipantRecord): Participant => ({
  id: p.id,
  eventId: p.eventId,
  name: p.name,
  hasPassword: p.hasPassword,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const nameKeyOf = (name: string) => name.toLowerCase();

async function participantIdFor(eventId: string, nameKey: string): Promise<string> {
  return 'p_' + (await hashToken(`${eventId}\n${nameKey}`)).slice(0, 16);
}

/** Best-effort per-isolate rate limiter. Returns true if allowed. */
class RateLimiter {
  private entries = new Map<string, { count: number; resetAt: number }>();

  allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    if (this.entries.size > 5000) this.entries.clear();
    const e = this.entries.get(key);
    if (!e || e.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    e.count += 1;
    return e.count <= limit;
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    },
  });
}

async function parseBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 100 * 1024) return { __tooLarge: true };
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __badJson: true };
  }
}

export function createApiHandler(store: Store) {
  const eventCache = new Map<string, SchedulerEvent>(); // events are immutable
  const bundleCache = new Map<string, { at: number; data: Bundle }>();
  const createLimiter = new RateLimiter();
  const signinLimiter = new RateLimiter();
  const saveLimiter = new RateLimiter();
  const readLimiter = new RateLimiter();

  async function getEvent(id: string): Promise<SchedulerEvent | null> {
    const hit = eventCache.get(id);
    if (hit) return hit;
    const event = await store.getEvent(id);
    if (event) {
      if (eventCache.size >= CACHE_MAX_ENTRIES) eventCache.clear();
      eventCache.set(id, event);
    }
    return event;
  }

  async function loadBundle(id: string): Promise<Bundle | null> {
    const hit = bundleCache.get(id);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
    const event = await getEvent(id);
    if (!event) return null;
    const records = await store.listParticipants(id);
    records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const data: Bundle = {
      event,
      participants: records.map(toPublic),
      availability: Object.fromEntries(records.map((r) => [r.id, r.availability ?? []])),
    };
    if (bundleCache.size >= CACHE_MAX_ENTRIES) bundleCache.clear();
    bundleCache.set(id, { at: Date.now(), data });
    return data;
  }

  async function seedDemoIfNeeded() {
    const existing = await store.getEvent(DEMO_ID);
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = existing?.selectedDates?.[existing.selectedDates.length - 1];
    if (existing && lastDate && lastDate >= today) return;
    if (existing) await store.deleteEvent(DEMO_ID);

    const base = new Date();
    const dates = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1 + i))
        .toISOString()
        .slice(0, 10)
    );
    const timeZone = 'America/Los_Angeles';
    const slots = generateEventSlots({
      mode: 'specific',
      selectedDates: dates,
      noEarlierThan: 0,
      noLaterThan: 23,
      timeZone,
    });
    const event: SchedulerEvent = {
      id: DEMO_ID,
      name: "Men's Small Group Online",
      mode: 'specific',
      selectedDates: dates,
      selectedWeekdays: [],
      noEarlierThan: 0,
      noLaterThan: 23,
      timeZone,
      createdAt: new Date().toISOString(),
      slots,
    };
    const pacific = (date: string, h: number, m: number) => {
      const [y, mo, d] = date.split('-').map(Number);
      return wallClockToUtc(y, mo, d, h, m, timeZone);
    };
    const range = (date: string, fromH: number, fromM: number, count: number) =>
      Array.from({ length: count }, (_, i) => {
        const total = fromH * 60 + fromM + i * 15;
        return pacific(date, Math.floor(total / 60), total % 60);
      });
    const overlap = [dates[4], dates[5]].flatMap((d) => range(d, 19, 0, 6));
    const aliceExtra = range(dates[4], 18, 0, 4);
    const budiExtra = range(dates[4], 20, 30, 2);

    await store.putEvent(event);
    const now = new Date().toISOString();
    const seed = async (name: string, availability: string[]): Promise<ParticipantRecord> => {
      const nameKey = nameKeyOf(name);
      return {
        id: await participantIdFor(DEMO_ID, nameKey),
        eventId: DEMO_ID,
        name,
        nameKey,
        hasPassword: false,
        sessions: [],
        availability: availability.filter((s) => slots.includes(s)),
        createdAt: now,
        updatedAt: now,
      };
    };
    await store.putParticipant(await seed('Alice (US Pacific)', [...overlap, ...aliceExtra]));
    await store.putParticipant(await seed('Budi (Indonesia WIB)', [...overlap, ...budiExtra]));
    await store.putParticipant(await seed('Charlie (US Central)', [...overlap]));
    eventCache.delete(DEMO_ID);
    bundleCache.delete(DEMO_ID);
  }

  let demoCheck: { at: number; p: Promise<void> } | null = null;
  async function ensureDemoFresh() {
    if (demoCheck && Date.now() - demoCheck.at < 60_000) return demoCheck.p;
    const p = seedDemoIfNeeded();
    demoCheck = { at: Date.now(), p };
    try {
      await p;
    } catch (err) {
      demoCheck = null;
      throw err;
    }
  }

  return async function handleApi(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const ip = clientIp(request);

      if (path === '/api/health' && request.method === 'GET') {
        return json({ ok: true });
      }

      if (path === '/api/events' && request.method === 'POST') {
        if (!createLimiter.allow(ip, 15, 60 * 60 * 1000)) {
          return json({ error: 'Too many events created. Try again later.' }, 429);
        }
        const body = await parseBody(request);
        if ((body as { __tooLarge?: boolean })?.__tooLarge) {
          return json({ error: 'Request too large.' }, 413);
        }
        const parsed = parseCreateEvent(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const v = parsed.value;
        const slots = generateEventSlots({
          mode: v.mode,
          selectedDates: v.selectedDates,
          selectedWeekdays: v.selectedWeekdays,
          noEarlierThan: v.noEarlierThan,
          noLaterThan: v.noLaterThan,
          timeZone: v.timeZone,
        });
        if (slots.length === 0 || slots.length > LIMITS.maxSlots) {
          return json({ error: 'That schedule is too large or empty.' }, 400);
        }
        const event: SchedulerEvent = {
          id: newEventId(),
          name: v.name,
          mode: v.mode,
          selectedDates: v.selectedDates,
          selectedWeekdays: v.selectedWeekdays,
          noEarlierThan: v.noEarlierThan,
          noLaterThan: v.noLaterThan,
          timeZone: v.timeZone,
          createdAt: new Date().toISOString(),
          slots,
        };
        await store.putEvent(event);
        return json({ success: true, event }, 201);
      }

      const eventMatch = /^\/api\/events\/([^/]+)$/.exec(path);
      const signinMatch = /^\/api\/events\/([^/]+)\/signin$/.exec(path);
      const availMatch = /^\/api\/events\/([^/]+)\/availability$/.exec(path);

      if (eventMatch && request.method === 'GET') {
        const id = decodeURIComponent(eventMatch[1]);
        if (!ID_RE.test(id)) return json({ error: 'Event not found.' }, 404);
        if (!readLimiter.allow(ip, 600, 60 * 1000)) {
          return json({ error: 'Too many requests. Slow down.' }, 429);
        }
        if (id === DEMO_ID) await ensureDemoFresh();
        const bundle = await loadBundle(id);
        if (!bundle) return json({ error: 'Event not found.' }, 404);
        return json(bundle);
      }

      if (signinMatch && request.method === 'POST') {
        const eventId = decodeURIComponent(signinMatch[1]);
        if (!ID_RE.test(eventId)) return json({ error: 'Event not found.' }, 404);
        if (!signinLimiter.allow(ip, 30, 15 * 60 * 1000)) {
          return json({ error: 'Too many sign-in attempts. Try again later.' }, 429);
        }
        if (eventId === DEMO_ID) await ensureDemoFresh();
        const event = await getEvent(eventId);
        if (!event) return json({ error: 'Event not found.' }, 404);

        const body = await parseBody(request);
        if ((body as { __tooLarge?: boolean })?.__tooLarge) {
          return json({ error: 'Request too large.' }, 413);
        }
        const parsed = parseSignin(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const { name, password } = parsed.value;
        const nameKey = nameKeyOf(name);
        const pid = await participantIdFor(eventId, nameKey);
        const failKey = `${eventId}:${nameKey}`;
        const failure = await store.getFailure(failKey);
        if (failure && failure.resetAt > Date.now() && failure.count >= MAX_FAILURES) {
          return json({ error: 'Too many failed attempts. Try again in a few minutes.' }, 429);
        }

        let record = await store.getParticipant(eventId, pid);
        const isExisting = Boolean(record);

        if (record) {
          if (record.hasPassword) {
            const ok = await verifyPassword(password, record.passwordHash);
            if (!ok) {
              await store.recordFailure(failKey, FAILURE_WINDOW_MS, Date.now());
              return json({
                error: `"${record.name}" is password-protected. Incorrect or missing password.`,
              }, 401);
            }
            await store.clearFailure(failKey);
          }
        } else {
          if ((await store.countParticipants(eventId)) >= LIMITS.maxParticipants) {
            return json({ error: 'This event has reached its participant limit.' }, 403);
          }
          const now = new Date().toISOString();
          const hasPassword = password.length > 0;
          const fresh: ParticipantRecord = {
            id: pid,
            eventId,
            name,
            nameKey,
            hasPassword,
            passwordHash: hasPassword ? await hashPassword(password) : undefined,
            sessions: [],
            availability: [],
            createdAt: now,
            updatedAt: now,
          };
          if (!(await store.createParticipant(fresh))) {
            return json({ error: 'That name was just taken. Please try again.' }, 409);
          }
          record = fresh;
          bundleCache.delete(eventId);
        }

        const token = newSessionToken();
        await store.addSession(
          eventId,
          record.id,
          { h: await hashToken(token), exp: Date.now() + SESSION_TTL_MS },
          Date.now()
        );
        return json({
          success: true,
          participant: toPublic(record),
          availability: record.availability ?? [],
          token,
        }, isExisting ? 200 : 201);
      }

      if (availMatch && request.method === 'POST') {
        const eventId = decodeURIComponent(availMatch[1]);
        if (!ID_RE.test(eventId)) return json({ error: 'Event not found.' }, 404);
        if (!saveLimiter.allow(ip, 240, 60 * 1000)) {
          return json({ error: 'Too many requests. Slow down.' }, 429);
        }
        const body = await parseBody(request);
        if ((body as { __tooLarge?: boolean })?.__tooLarge) {
          return json({ error: 'Request too large.' }, 413);
        }
        const b = (body ?? {}) as Record<string, unknown>;
        const { participantId, availableSlots } = b;
        if (
          typeof participantId !== 'string' ||
          !ID_RE.test(participantId) ||
          !Array.isArray(availableSlots)
        ) {
          return json({ error: 'Invalid availability payload.' }, 400);
        }
        const match = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '');
        const record = match ? await store.getParticipant(eventId, participantId) : null;
        const tokenHash = match ? await hashToken(match[1]) : '';
        const authorized =
          record?.sessions?.some((s) => s.h === tokenHash && s.exp > Date.now()) ?? false;
        if (!record || !authorized) {
          return json({ error: 'Please sign in again.' }, 401);
        }
        const event = await getEvent(eventId);
        if (!event) return json({ error: 'Event not found.' }, 404);
        if (availableSlots.length > event.slots.length) {
          return json({ error: 'Too many slots.' }, 400);
        }
        const valid = new Set(event.slots);
        const cleaned = Array.from(
          new Set(
            availableSlots.filter((s): s is string => typeof s === 'string' && valid.has(s))
          )
        );
        await store.setAvailability(eventId, record.id, cleaned, new Date().toISOString());
        bundleCache.delete(eventId);
        return json({ success: true, count: cleaned.length });
      }

      if (path.startsWith('/api/')) {
        return json({ error: 'Not found.' }, 404);
      }
      return json({ error: 'Not found.' }, 404);
    } catch (err) {
      console.error('Unhandled error:', err);
      return json({ error: 'Server error.' }, 500);
    }
  };
}
