// SQLite persistence. One file, holds everything needed to replay a run from
// any checkpoint forward without re-running prior stages (challenge requirement).
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,            -- 'chat' | 'brief'
    thread_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'running'
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    run_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,          -- 'pass' | 'fail'
    ts TEXT NOT NULL,
    payload TEXT,                  -- JSON; the replayable artifact
    PRIMARY KEY (run_id, stage)
  );

  CREATE TABLE IF NOT EXISTS alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    context TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    ts TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    attributes TEXT               -- JSON
  );

  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    ts TEXT NOT NULL,
    relevance REAL,
    meta TEXT
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    used_tools TEXT,              -- JSON array
    ts TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS briefs (
    id TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    payload TEXT NOT NULL          -- JSON Brief
  );

  -- Phase 2: outbound engine
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    org TEXT,
    category TEXT,                 -- 'KOL' | 'cofounder' | 'institution'
    status TEXT,
    last_touch TEXT,
    next_action TEXT
  );

  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    contact_id TEXT,
    subject TEXT,
    body TEXT,
    confidence REAL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|sent
    created_at TEXT NOT NULL
  );

  -- Runtime settings (e.g. auto_send mode).
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Mined interests — topics/people/companies the user is actively engaging with,
  -- extracted from texts + chats, used to seed the next day's brief searches.
  CREATE TABLE IF NOT EXISTS interests (
    topic TEXT PRIMARY KEY,
    source TEXT NOT NULL,         -- 'text' | 'chat' | 'profile'
    weight REAL NOT NULL DEFAULT 1,
    last_seen TEXT NOT NULL
  );

  -- Personal todos / project reminders (NOT outreach — those live in contacts).
  -- Open todos resurface in the morning brief until marked done.
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    detail TEXT,
    tag TEXT,                     -- optional grouping label (e.g. 'project', 'errand')
    status TEXT NOT NULL DEFAULT 'open', -- open | done
    in_brief INTEGER NOT NULL DEFAULT 1, -- surface in the morning brief while open
    due_date TEXT,                -- optional YYYY-MM-DD; dated todos surface only on/around this day, not every day
    created_at TEXT NOT NULL,
    done_at TEXT
  );

  -- General memory: arbitrary facts the user tells Solo to remember (e.g.
  -- "my dad works at Dell", "I'm allergic to penicillin"). Recalled on demand
  -- and used to personalize. Subject = who/what it's about, for easy lookup.
  CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    subject TEXT,                 -- e.g. 'dad', 'me', 'sister' — lowercased
    fact TEXT NOT NULL,           -- the full statement
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Self-connected external API services. Solo can wire up a new keyed REST API
  -- from chat ("connect rocketreach, key is X") and then call it via call_api.
  -- The key is only ever sent to this service's own host (base_url).
  CREATE TABLE IF NOT EXISTS services (
    name TEXT PRIMARY KEY,        -- 'rocketreach'
    host TEXT NOT NULL,           -- 'api.rocketreach.co' (derived from base_url; the allowlist)
    base_url TEXT NOT NULL,       -- 'https://api.rocketreach.co/v2'
    auth_style TEXT NOT NULL,     -- 'header' | 'bearer' | 'query'
    auth_name TEXT,               -- header/param name (e.g. 'Api-Key')
    api_key TEXT NOT NULL,
    note TEXT,                    -- optional usage hint for the agent
    created_at TEXT NOT NULL
  );

  -- Outbound messages awaiting human approval (the only path to the outside world)
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,        -- 'imessage' | 'email'
    recipient TEXT NOT NULL,      -- handle / phone / email
    recipient_name TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|sent|rejected|failed
    error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, ts);
  CREATE INDEX IF NOT EXISTS idx_alarms_ts ON alarms(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject);
`);

// Idempotent migrations for the outreach pipeline (contacts table predates these).
for (const col of ["link TEXT", "note TEXT", "created_at TEXT"]) {
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN ${col}`);
  } catch {
    /* column already exists */
  }
}

// Idempotent migration: due_date on todos (table predates dated reminders).
try {
  db.exec(`ALTER TABLE todos ADD COLUMN due_date TEXT`);
} catch {
  /* column already exists */
}

export default db;
