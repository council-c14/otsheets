-- ============================================================================
-- Paste this whole file into Supabase Dashboard > SQL Editor > New query,
-- then click Run. This creates the tables and the real access control
-- (Row Level Security policies) -- the part that actually enforces who can
-- read/write what, on Supabase's own servers, regardless of what this
-- app's JavaScript does.
--
-- Model:
--   profiles          one row per account: username, role, attendance_access
--   overtime_records  one row per account, holding that person's own
--                      overtime sheet as jsonb. Only that person can read/write it.
--   attendance_sheet   one shared row (id = 'shared') for the council
--                      attendance roster. Only the superadmin, or a user the
--                      superadmin has flagged attendance_access = true, can
--                      read or write it.
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'user',
  attendance_access boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.overtime_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now()
);

create table if not exists public.attendance_sheet (
  id text primary key default 'shared',
  data jsonb not null default '{}'::jsonb,
  saved_by text,
  saved_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.overtime_records enable row level security;
alter table public.attendance_sheet enable row level security;

-- security definer: this function runs with elevated rights internally, so
-- checking "am I superadmin" doesn't get tangled up in the very policy
-- that's asking the question.
create or replace function public.is_superadmin()
returns boolean language sql security definer stable as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.has_attendance_access()
returns boolean language sql security definer stable as $$
  select public.is_superadmin()
    or coalesce((select attendance_access from public.profiles where id = auth.uid()), false);
$$;

-- profiles: you can always read your own row; the superadmin can read everyone's
-- (needed to list users on the admin panel).
drop policy if exists "read own or admin reads all" on public.profiles;
create policy "read own or admin reads all" on public.profiles
  for select using (auth.uid() = id or public.is_superadmin());

-- a user creates their own profile once, on signup, and can never grant
-- themselves role or attendance_access -- only a plain "user" row for
-- their own id is allowed.
drop policy if exists "self insert as plain user" on public.profiles;
create policy "self insert as plain user" on public.profiles
  for insert with check (auth.uid() = id and role = 'user' and attendance_access = false);

-- only the superadmin may change role or attendance_access on anyone's
-- profile (including their own, e.g. to demote themselves).
drop policy if exists "admin can update any profile" on public.profiles;
create policy "admin can update any profile" on public.profiles
  for update using (public.is_superadmin());

-- overtime records: private to their own owner, full stop.
drop policy if exists "own overtime only" on public.overtime_records;
create policy "own overtime only" on public.overtime_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- attendance sheet: superadmin, or anyone flagged attendance_access.
drop policy if exists "attendance access controls all" on public.attendance_sheet;
create policy "attendance access controls all" on public.attendance_sheet
  for all using (public.has_attendance_access()) with check (public.has_attendance_access());

-- lets everyone-with-access see each other's edits live, not just on reload.
alter publication supabase_realtime add table public.attendance_sheet;
