/**
 * D1 persistence for JustMeetAlready.
 *
 * This is the whole reason the Cloudflare version does not lose data:
 * D1 is a managed SQLite database that lives outside any Worker isolate,
 * so a restart, a redeploy, or a cold start cannot wipe it. The old
 * deployment stored events in a JSON file on the server's own disk, which
 * is exactly what disappeared.
 *
 * Schema (see migrations/0001_init.sql):
 *   events(id TEXT PRIMARY KEY, data TEXT)              -> SchedulerEvent, JSON
 *   participants(event_id, id, data, PRIMARY KEY(event_id, id))
 *   signin_failures(key TEXT PRIMARY KEY, count, reset_at)
 *
 * Keeping each event / participant as one JSON blob is deliberate: it is
 * the same shape as the SQLite store in the Fly patch, so the API behaviour
 * above this layer does not change, and a row read/write is one D1 row.
 */
import type { SchedulerEvent } from '../src/types';
import type { D1Database } from './d1';

export interface SessionToken {
  h: string; // sha256 of the bearer token
  exp: number; // epoch ms
}

export interface ParticipantRecord {
  id: string;
  eventId: string;
  name: string;
  nameKey: string;
  hasPassword: boolean;
  passwordHash?: string;
  sessions: SessionToken[];
  availability: string[]; // UTC ISO slot strings
  createdAt: string;
  updatedAt: string;
}

export interface FailureRecord {
  count: number;
  resetAt: number;
}

export interface Store {
  readonly kind: string;
  init(): Promise<void>;
  getEvent(id: string): Promise<SchedulerEvent | null>;
  putEvent(event: SchedulerEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>; // event and all its participants
  listParticipants(eventId: string): Promise<ParticipantRecord[]>;
  countParticipants(eventId: string): Promise<number>;
  getParticipant(eventId: string, id: string): Promise<ParticipantRecord | null>;
  /** Creates only if the id is free. Returns false if it already exists. */
  createParticipant(rec: ParticipantRecord): Promise<boolean>;
  putParticipant(rec: ParticipantRecord): Promise<void>; // create or overwrite
  addSession(eventId: string, id: string, session: SessionToken, now: number): Promise<void>;
  setAvailability(
    eventId: string,
    id: string,
    slots: string[],
    updatedAt: string
  ): Promise<boolean>;
  // Sign-in lockout. This MUST live in D1, not in memory: Worker isolates
  // are per-request, so an in-memory counter would reset on every isolate
  // and an attacker could retry forever by landing on a fresh isolate.
  getFailure(key: string): Promise<FailureRecord | null>;
  recordFailure(key: string, windowMs: number, now: number): Promise<void>;
  clearFailure(key: string): Promise<void>;
}

export const MAX_SESSIONS_PER_PARTICIPANT = 5;

export function pruneSessions(
  current: SessionToken[] | undefined,
  added: SessionToken,
  now: number
): SessionToken[] {
  const live = (current ?? []).filter((s) => s.exp > now);
  live.push(added);
  return live.slice(-MAX_SESSIONS_PER_PARTICIPANT);
}

export class D1Store implements Store {
  readonly kind = 'd1';

  constructor(private readonly db: D1Database) {}

  async init(): Promise<void> {
    // Idempotent: the wrangler migration creates the same tables, but
    // running CREATE TABLE IF NOT EXISTS here means a deploy that forgot
    // `wrangler d1 migrations apply` still works instead of 500ing.
    await this.db.batch([
      this.db.prepare(
        'CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, data TEXT NOT NULL)'
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS participants (
           event_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
           PRIMARY KEY (event_id, id))`
      ),
      this.db.prepare(
        `CREATE TABLE IF NOT EXISTS signin_failures (
           key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`
      ),
    ]);
    // Fails fast if D1 is not bound / reachable, like the Firestore init did.
    await this.db.prepare('SELECT 1').first();
  }

  async getEvent(id: string): Promise<SchedulerEvent | null> {
    const row = await this.db
      .prepare('SELECT data FROM events WHERE id = ?')
      .bind(id)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as SchedulerEvent) : null;
  }

  async putEvent(event: SchedulerEvent): Promise<void> {
    await this.db
      .prepare('INSERT INTO events (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .bind(event.id, JSON.stringify(event))
      .run();
  }

  async deleteEvent(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM participants WHERE event_id = ?').bind(id),
      this.db.prepare('DELETE FROM events WHERE id = ?').bind(id),
    ]);
  }

  async listParticipants(eventId: string): Promise<ParticipantRecord[]> {
    const res = await this.db
      .prepare('SELECT data FROM participants WHERE event_id = ? ORDER BY rowid')
      .bind(eventId)
      .all<{ data: string }>();
    return res.results.map((r) => JSON.parse(r.data) as ParticipantRecord);
  }

  async countParticipants(eventId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS c FROM participants WHERE event_id = ?')
      .bind(eventId)
      .first<{ c: number }>();
    return row?.c ?? 0;
  }

  async getParticipant(eventId: string, id: string): Promise<ParticipantRecord | null> {
    const row = await this.db
      .prepare('SELECT data FROM participants WHERE event_id = ? AND id = ?')
      .bind(eventId, id)
      .first<{ data: string }>();
    return row ? (JSON.parse(row.data) as ParticipantRecord) : null;
  }

  async createParticipant(rec: ParticipantRecord): Promise<boolean> {
    const res = await this.db
      .prepare('INSERT INTO participants (event_id, id, data) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .bind(rec.eventId, rec.id, JSON.stringify(rec))
      .run();
    return res.meta.changes === 1;
  }

  async putParticipant(rec: ParticipantRecord): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO participants (event_id, id, data) VALUES (?, ?, ?) ON CONFLICT(event_id, id) DO UPDATE SET data = excluded.data'
      )
      .bind(rec.eventId, rec.id, JSON.stringify(rec))
      .run();
  }

  async addSession(eventId: string, id: string, session: SessionToken, now: number): Promise<void> {
    const rec = await this.getParticipant(eventId, id);
    if (!rec) return;
    rec.sessions = pruneSessions(rec.sessions, session, now);
    await this.db
      .prepare('UPDATE participants SET data = ? WHERE event_id = ? AND id = ?')
      .bind(JSON.stringify(rec), eventId, id)
      .run();
  }

  async setAvailability(
    eventId: string,
    id: string,
    slots: string[],
    updatedAt: string
  ): Promise<boolean> {
    const rec = await this.getParticipant(eventId, id);
    if (!rec) return false;
    rec.availability = slots;
    rec.updatedAt = updatedAt;
    await this.db
      .prepare('UPDATE participants SET data = ? WHERE event_id = ? AND id = ?')
      .bind(JSON.stringify(rec), eventId, id)
      .run();
    return true;
  }

  async getFailure(key: string): Promise<FailureRecord | null> {
    const row = await this.db
      .prepare('SELECT count, reset_at FROM signin_failures WHERE key = ?')
      .bind(key)
      .first<{ count: number; reset_at: number }>();
    return row ? { count: row.count, resetAt: row.reset_at } : null;
  }

  async recordFailure(key: string, windowMs: number, now: number): Promise<void> {
    const existing = await this.getFailure(key);
    if (!existing || existing.resetAt <= now) {
      await this.db
        .prepare(
          'INSERT INTO signin_failures (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at'
        )
        .bind(key, now + windowMs)
        .run();
    } else {
      await this.db
        .prepare('UPDATE signin_failures SET count = count + 1 WHERE key = ?')
        .bind(key)
        .run();
    }
  }

  async clearFailure(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM signin_failures WHERE key = ?').bind(key).run();
  }
}
