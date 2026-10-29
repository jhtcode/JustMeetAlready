import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { generateEventSlots } from './src/utils/timezone';
import { SchedulerEvent, Participant } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface EventRecord {
  event: SchedulerEvent;
  participants: (Participant & { passwordHash?: string })[];
  availability: Record<string, string[]>; // participantId -> UTC ISO strings
}

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'scheduler_data.json');

// In-memory store
const eventStore: Map<string, EventRecord> = new Map();

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      for (const [id, record] of Object.entries(parsed)) {
        eventStore.set(id, record as EventRecord);
      }
    }
  } catch (err) {
    console.warn('Could not load data from file, starting with fresh store:', err);
  }

  // Seed default demonstration event if empty
  if (eventStore.size === 0) {
    seedDefaultEvent();
  }
}

function persistStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj: Record<string, EventRecord> = {};
    for (const [id, rec] of eventStore.entries()) {
      obj[id] = rec;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist event store to disk:', err);
  }
}

function seedDefaultEvent() {
  const seedId = 'mens-small-group-demo';
  const dates: string[] = [];
  for (let d = 2; d <= 15; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    dates.push(`2026-11-${dayStr}`);
  }

  const creationTz = 'America/Los_Angeles';
  const slots = generateEventSlots({
    mode: 'specific',
    selectedDates: dates,
    noEarlierThan: 0,
    noLaterThan: 23,
    timeZone: creationTz,
  });

  const event: SchedulerEvent = {
    id: seedId,
    name: "Men's Small Group Online",
    mode: 'specific',
    selectedDates: dates,
    selectedWeekdays: [],
    noEarlierThan: 0,
    noLaterThan: 23,
    timeZone: creationTz,
    createdAt: new Date().toISOString(),
    slots,
  };

  // Seed 3 participants to demonstrate When2meet heatmap
  const p1Id = 'p_alice';
  const p2Id = 'p_budi';
  const p3Id = 'p_charlie';

  const participants: (Participant & { passwordHash?: string })[] = [
    {
      id: p1Id,
      eventId: seedId,
      name: 'Alice (US Pacific)',
      hasPassword: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: p2Id,
      eventId: seedId,
      name: 'Budi (Indonesia WIB)',
      hasPassword: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: p3Id,
      eventId: seedId,
      name: 'Charlie (US Central)',
      hasPassword: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Pick some overlapping slots (e.g., Nov 6 & Nov 7, 7:00 PM - 8:30 PM Pacific)
  const overlapSlots = slots.filter((slot) => {
    // Pacific 7:00 PM - 8:30 PM on Nov 6 or Nov 7
    // UTC: Nov 7 or Nov 8 03:00 - 04:30
    return (
      slot.startsWith('2026-11-07T03:') ||
      slot.startsWith('2026-11-07T04:00') ||
      slot.startsWith('2026-11-07T04:15') ||
      slot.startsWith('2026-11-08T03:') ||
      slot.startsWith('2026-11-08T04:00')
    );
  });

  const aliceExtra = slots.filter((slot) => slot.startsWith('2026-11-07T02:'));
  const budiExtra = slots.filter((slot) => slot.startsWith('2026-11-07T04:30') || slot.startsWith('2026-11-07T04:45'));

  const availability: Record<string, string[]> = {
    [p1Id]: [...overlapSlots, ...aliceExtra],
    [p2Id]: [...overlapSlots, ...budiExtra],
    [p3Id]: [...overlapSlots],
  };

  eventStore.set(seedId, {
    event,
    participants,
    availability,
  });

  persistStore();
}

function hashPassword(pwd: string): string {
  return crypto.createHash('sha256').update(pwd.trim()).digest('hex');
}

async function startServer() {
  loadStore();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Create event
  app.post('/api/events', (req, res) => {
    try {
      const {
        name,
        mode,
        selectedDates,
        selectedWeekdays,
        noEarlierThan,
        noLaterThan,
        timeZone,
      } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Event name is required.' });
      }

      if (mode !== 'specific' && mode !== 'weekdays') {
        return res.status(400).json({ error: 'Invalid mode.' });
      }

      if (mode === 'specific' && (!selectedDates || selectedDates.length === 0)) {
        return res.status(400).json({ error: 'At least one date must be selected.' });
      }

      if (mode === 'weekdays' && (!selectedWeekdays || selectedWeekdays.length === 0)) {
        return res.status(400).json({ error: 'At least one weekday must be selected.' });
      }

      const id = crypto.randomBytes(5).toString('hex'); // Unguessable 10-char token

      const slots = generateEventSlots({
        mode,
        selectedDates,
        selectedWeekdays,
        noEarlierThan: Number(noEarlierThan) || 0,
        noLaterThan: Number(noLaterThan) || 23,
        timeZone: timeZone || 'America/Los_Angeles',
      });

      const newEvent: SchedulerEvent = {
        id,
        name: name.trim(),
        mode,
        selectedDates: selectedDates || [],
        selectedWeekdays: selectedWeekdays || [],
        noEarlierThan: Number(noEarlierThan) || 0,
        noLaterThan: Number(noLaterThan) || 23,
        timeZone: timeZone || 'America/Los_Angeles',
        createdAt: new Date().toISOString(),
        slots,
      };

      const record: EventRecord = {
        event: newEvent,
        participants: [],
        availability: {},
      };

      eventStore.set(id, record);
      persistStore();

      res.status(201).json({ success: true, event: newEvent });
    } catch (err: any) {
      console.error('Error creating event:', err);
      res.status(500).json({ error: err.message || 'Server error creating event.' });
    }
  });

  // Get event and all responses
  app.get('/api/events/:id', (req, res) => {
    const record = eventStore.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Strip password hashes from participants list for safety
    const safeParticipants: Participant[] = record.participants.map((p) => ({
      id: p.id,
      eventId: p.eventId,
      name: p.name,
      hasPassword: p.hasPassword,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    res.json({
      event: record.event,
      participants: safeParticipants,
      availability: record.availability,
    });
  });

  // Sign in / register participant for event
  app.post('/api/events/:id/signin', (req, res) => {
    const record = eventStore.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const { name, password } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Please enter a name.' });
    }

    const trimmedName = name.trim();
    const existing = record.participants.find(
      (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      // Name already exists
      if (existing.hasPassword) {
        // Must provide matching password
        if (!password || hashPassword(password) !== existing.passwordHash) {
          return res.status(401).json({
            error: `"${existing.name}" is password-protected. Incorrect or missing password.`,
          });
        }
      }

      // Successful sign in of existing user
      return res.json({
        success: true,
        participant: {
          id: existing.id,
          eventId: existing.eventId,
          name: existing.name,
          hasPassword: existing.hasPassword,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
        availability: record.availability[existing.id] || [],
      });
    }

    // New participant
    const hasPassword = Boolean(password && password.trim());
    const newParticipant: Participant & { passwordHash?: string } = {
      id: 'p_' + crypto.randomBytes(6).toString('hex'),
      eventId: record.event.id,
      name: trimmedName,
      hasPassword,
      passwordHash: hasPassword ? hashPassword(password!) : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    record.participants.push(newParticipant);
    record.availability[newParticipant.id] = [];
    persistStore();

    res.status(201).json({
      success: true,
      participant: {
        id: newParticipant.id,
        eventId: newParticipant.eventId,
        name: newParticipant.name,
        hasPassword: newParticipant.hasPassword,
        createdAt: newParticipant.createdAt,
        updatedAt: newParticipant.updatedAt,
      },
      availability: [],
    });
  });

  // Save participant availability
  app.post('/api/events/:id/availability', (req, res) => {
    const record = eventStore.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const { participantId, availableSlots } = req.body;
    if (!participantId || !Array.isArray(availableSlots)) {
      return res.status(400).json({ error: 'Invalid availability payload.' });
    }

    const participant = record.participants.find((p) => p.id === participantId);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found.' });
    }

    // Validate that slots belong to the event's defined slots
    const validSlotSet = new Set(record.event.slots);
    const cleanedSlots = availableSlots.filter((slot: string) => validSlotSet.has(slot));

    record.availability[participantId] = cleanedSlots;
    participant.updatedAt = new Date().toISOString();
    persistStore();

    res.json({ success: true, count: cleanedSlots.length });
  });

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
