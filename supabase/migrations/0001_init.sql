-- NudgeMe datamodell. Multi-user med Row Level Security: varje användare ser
-- och ändrar bara sina egna rader. auth.users hanteras av Supabase Auth.

-- === Aktiviteter ===
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text default '',
  frequency char(1) not null check (frequency in ('A', 'B', 'C', 'D')),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists activities_user_idx on public.activities (user_id);

-- === Frekvenstak per användare (JSON: klass -> {count, windowDays}) ===
create table if not exists public.frequency_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null
);

-- === Veckoschema (JSON-array av dagar) ===
create table if not exists public.schedule (
  user_id uuid primary key references auth.users (id) on delete cascade,
  days jsonb not null
);

-- === Notisinställningar ===
create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null
);

-- === Motor-state: när nästa nudge ska genereras ===
create table if not exists public.engine_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  next_nudge_at timestamptz
);

-- === Nudge-historik (driver frekvenstak + historikvyn) ===
create table if not exists public.nudge_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null default 'sent'
    check (status in ('sent', 'acked', 'committed', 'done', 'ignored', 'snoozed')),
  acked_at timestamptz,
  done_at timestamptz,
  follow_up_asked_at timestamptz
);
create index if not exists nudge_user_sent_idx
  on public.nudge_history (user_id, sent_at desc);

-- === Push-prenumerationer (en per enhet) ===
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- === Row Level Security ===
alter table public.activities enable row level security;
alter table public.frequency_settings enable row level security;
alter table public.schedule enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.engine_state enable row level security;
alter table public.nudge_history enable row level security;
alter table public.push_subscriptions enable row level security;

-- Generisk "äger raden"-policy per tabell. auth.uid() = user_id.
do $$
declare
  t text;
begin
  foreach t in array array[
    'activities', 'frequency_settings', 'schedule', 'notification_prefs',
    'engine_state', 'nudge_history', 'push_subscriptions'
  ]
  loop
    execute format($f$
      create policy %1$I_owner on public.%1$I
        for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
