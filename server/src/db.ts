import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// SQLite-databas för NudgeMe. Speglar domänmodellen. Per-användar-inställningar
// (frekvenstak, schema, notisval, motor-state) lagras som JSON i en enkel
// nyckel/värde-tabell; aktiviteter, nudges och push-prenumerationer som rader.

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.NUDGEME_DB ?? join(here, "..", "data", "nudgeme.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
create table if not exists users (
  id text primary key,
  username text unique not null,
  password_hash text not null,
  created_at text not null
);

create table if not exists activities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  title text not null,
  frequency text not null check (frequency in ('A','B','C','D')),
  tags text not null default '[]',
  image_url text,
  active integer not null default 1,
  created_at text not null
);
create index if not exists activities_user_idx on activities(user_id);

-- Per-användar-JSON: 'frequency' | 'schedule' | 'notifPrefs' | 'engine'
create table if not exists kv (
  user_id text not null references users(id) on delete cascade,
  key text not null,
  value text not null,
  primary key (user_id, key)
);

create table if not exists nudges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  activity_id text not null,
  sent_at text not null,
  status text not null default 'sent'
    check (status in ('sent','acked','committed','done','ignored','snoozed')),
  acked_at text,
  done_at text,
  follow_up_asked_at text
);
create index if not exists nudges_user_idx on nudges(user_id, sent_at desc);

create table if not exists push_subscriptions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  endpoint text unique not null,
  keys text not null,
  created_at text not null
);
`);

// Migrering: lägg till roll + tvingat lösenordsbyte på befintliga databaser.
function columnExists(table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}
if (!columnExists("users", "role")) {
  db.exec("alter table users add column role text not null default 'user'");
}
if (!columnExists("users", "must_change_password")) {
  db.exec("alter table users add column must_change_password integer not null default 0");
}
// Ge testkontot adminbehörighet.
db.prepare("update users set role = 'admin' where username = 'test'").run();
