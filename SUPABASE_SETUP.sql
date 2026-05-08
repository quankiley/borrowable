-- Borrowable — Supabase schema
-- Run this in your Supabase project: SQL editor → paste → Run.

-- Profile table (linked 1:1 to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- Borrowed items
create table if not exists public.borrowed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  borrowed_from text not null,
  description text not null,
  brand text,
  color text,
  place text,
  borrow_date date not null default current_date,
  due_date date not null,
  status text not null default 'borrowed' check (status in ('borrowed','returning','returned')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists borrowed_items_user_id_idx on public.borrowed_items(user_id);
create index if not exists borrowed_items_borrowed_from_idx on public.borrowed_items(borrowed_from);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_borrowed_items_updated_at on public.borrowed_items;
create trigger set_borrowed_items_updated_at
  before update on public.borrowed_items
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup, picking the name out of user_metadata
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.borrowed_items enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "items: read own" on public.borrowed_items;
create policy "items: read own"
  on public.borrowed_items for select
  using (auth.uid() = user_id);

drop policy if exists "items: insert own" on public.borrowed_items;
create policy "items: insert own"
  on public.borrowed_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "items: update own" on public.borrowed_items;
create policy "items: update own"
  on public.borrowed_items for update
  using (auth.uid() = user_id);

drop policy if exists "items: delete own" on public.borrowed_items;
create policy "items: delete own"
  on public.borrowed_items for delete
  using (auth.uid() = user_id);
