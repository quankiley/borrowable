-- Borrowable — friends + lender migration
-- Run this in your Supabase SQL editor on top of your existing schema.
-- Safe to run more than once (uses if-not-exists / drop-if-exists patterns).

-- ─── 1. Add email column to profiles + backfill ──────────────────────
alter table public.profiles add column if not exists email text;

update public.profiles p
  set email = u.email
  from auth.users u
  where p.id = u.id and p.email is null;

create index if not exists profiles_email_idx on public.profiles(lower(email));

-- ─── 2. Update signup trigger to capture email too ──────────────────
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$ language plpgsql;

-- ─── 3. Add lender_id to items so the lender can see them ───────────
alter table public.borrowed_items
  add column if not exists lender_id uuid references auth.users(id) on delete set null;

create index if not exists borrowed_items_lender_id_idx on public.borrowed_items(lender_id);

-- ─── 4. Friendships table (symmetric — both directions stored) ─────
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_user_id_idx on public.friendships(user_id);
create index if not exists friendships_friend_id_idx on public.friendships(friend_id);

alter table public.friendships enable row level security;

drop policy if exists "friendships: read mine" on public.friendships;
create policy "friendships: read mine"
  on public.friendships for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friendships: insert mine" on public.friendships;
create policy "friendships: insert mine"
  on public.friendships for insert
  with check (auth.uid() = user_id);

drop policy if exists "friendships: delete mine" on public.friendships;
create policy "friendships: delete mine"
  on public.friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- ─── 5. Profile RLS: allow reading profiles you're connected to ─────
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: read connected" on public.profiles;
create policy "profiles: read connected"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = profiles.id)
         or (f.friend_id = auth.uid() and f.user_id = profiles.id)
    )
    or exists (
      select 1 from public.borrowed_items i
      where (i.lender_id = auth.uid() and i.user_id = profiles.id)
         or (i.user_id = auth.uid() and i.lender_id = profiles.id)
    )
  );

-- ─── 6. Items RLS: lender can read + update status ──────────────────
drop policy if exists "items: read own" on public.borrowed_items;
drop policy if exists "items: read borrower or lender" on public.borrowed_items;
create policy "items: read borrower or lender"
  on public.borrowed_items for select
  using (auth.uid() = user_id or auth.uid() = lender_id);

drop policy if exists "items: update own" on public.borrowed_items;
drop policy if exists "items: update borrower or lender" on public.borrowed_items;
create policy "items: update borrower or lender"
  on public.borrowed_items for update
  using (auth.uid() = user_id or auth.uid() = lender_id);

-- (insert + delete remain borrower-only, already in place from setup)

-- ─── 7. RPC: add a friend by email (creates symmetric friendship) ──
create or replace function public.add_friend_by_email(friend_email text)
returns table(id uuid, name text, email text)
security definer
set search_path = public
language plpgsql
as $$
declare
  fid uuid;
  fname text;
  femail text;
begin
  if friend_email is null or trim(friend_email) = '' then
    raise exception 'Email required';
  end if;

  select u.id, u.email
    into fid, femail
    from auth.users u
    where lower(u.email) = lower(trim(friend_email))
    limit 1;

  if fid is null then
    raise exception 'No user found with that email. Make sure they signed up for Borrowable first.';
  end if;
  if fid = auth.uid() then
    raise exception 'You can''t add yourself as a friend.';
  end if;

  insert into public.friendships (user_id, friend_id)
    values (auth.uid(), fid)
    on conflict (user_id, friend_id) do nothing;
  insert into public.friendships (user_id, friend_id)
    values (fid, auth.uid())
    on conflict (user_id, friend_id) do nothing;

  select p.name into fname from public.profiles p where p.id = fid;
  return query select fid, coalesce(fname, split_part(femail, '@', 1)), femail;
end;
$$;

grant execute on function public.add_friend_by_email(text) to authenticated;

-- ─── 8. RPC: remove a friend (symmetric) ────────────────────────────
create or replace function public.remove_friend(target_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = target_id)
     or (user_id = target_id and friend_id = auth.uid());
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;
