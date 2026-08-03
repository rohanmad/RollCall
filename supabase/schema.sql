-- RollCall auth schema (run in Supabase SQL editor)
-- Auth users live in auth.users; app profile + uniqueness live here.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  username text not null,
  bio text,
  avatar_url text,
  onboarded boolean not null default false,
  photo_permission_asked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_unique unique (email),
  constraint profiles_username_unique unique (username),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_username_idx on public.profiles (username);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile row when a user signs up (username passed via user metadata)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    lower(new.email),
    lower(coalesce(new.raw_user_meta_data->>'username', ''))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Username availability check (callable while typing)
create or replace function public.is_username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles p
    where p.username = lower(candidate)
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Memories (shared timeline records)
-- App model maps snake_case → camelCase (ownerId, coverPhoto, likesCount, …)
-- ---------------------------------------------------------------------------

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  cover_photo text not null,
  photos text[] not null default '{}',
  location text,
  created_at timestamptz not null default now(),
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  constraint memories_title_nonempty check (char_length(trim(title)) > 0),
  constraint memories_photos_nonempty check (cardinality(photos) > 0),
  constraint memories_likes_nonneg check (likes_count >= 0),
  constraint memories_comments_nonneg check (comments_count >= 0)
);

create index if not exists memories_owner_id_idx on public.memories (owner_id);
create index if not exists memories_created_at_idx on public.memories (created_at desc);

alter table public.memories enable row level security;

-- Owners fully control their memories.
drop policy if exists "Owners can insert memories" on public.memories;
create policy "Owners can insert memories"
  on public.memories for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update memories" on public.memories;
create policy "Owners can update memories"
  on public.memories for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can delete memories" on public.memories;
create policy "Owners can delete memories"
  on public.memories for delete
  to authenticated
  using (auth.uid() = owner_id);

-- Readable by any signed-in user so friend feeds / notifications can query later.
drop policy if exists "Authenticated users can read memories" on public.memories;
create policy "Authenticated users can read memories"
  on public.memories for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Storage: memory photo binaries
-- Paths: {owner_id}/{memory_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('memory-photos', 'memory-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Owners can upload memory photos" on storage.objects;
create policy "Owners can upload memory photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners can update memory photos" on storage.objects;
create policy "Owners can update memory photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners can delete memory photos" on storage.objects;
create policy "Owners can delete memory photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public can read memory photos" on storage.objects;
create policy "Public can read memory photos"
  on storage.objects for select
  to public
  using (bucket_id = 'memory-photos');

-- ---------------------------------------------------------------------------
-- Friends: requests + undirected friendships
-- ---------------------------------------------------------------------------

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_no_self check (from_user_id <> to_user_id)
);

create index if not exists friend_requests_from_idx
  on public.friend_requests (from_user_id, status);
create index if not exists friend_requests_to_idx
  on public.friend_requests (to_user_id, status);

-- At most one pending request between a pair (either direction).
create unique index if not exists friend_requests_pending_pair_uidx
  on public.friend_requests (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id)
  )
  where status = 'pending';

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row execute function public.set_updated_at();

alter table public.friend_requests enable row level security;

drop policy if exists "Users read own friend requests" on public.friend_requests;
create policy "Users read own friend requests"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "Users send friend requests" on public.friend_requests;
create policy "Users send friend requests"
  on public.friend_requests for insert
  to authenticated
  with check (
    auth.uid() = from_user_id
    and status = 'pending'
  );

drop policy if exists "Users update own friend requests" on public.friend_requests;
create policy "Users update own friend requests"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id)
  with check (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Canonical undirected edge: user_a < user_b
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_unique unique (user_a, user_b)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

drop policy if exists "Users read own friendships" on public.friendships;
create policy "Users read own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Users create own friendships" on public.friendships;
create policy "Users create own friendships"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Users delete own friendships" on public.friendships;
create policy "Users delete own friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- ---------------------------------------------------------------------------
-- Engagement: likes + comments (counts maintained by triggers)
-- ---------------------------------------------------------------------------

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_unique_user_memory unique (memory_id, user_id)
);

create index if not exists likes_memory_id_idx on public.likes (memory_id);
create index if not exists likes_user_id_idx on public.likes (user_id);

alter table public.likes enable row level security;

drop policy if exists "Authenticated users can read likes" on public.likes;
create policy "Authenticated users can read likes"
  on public.likes for select
  to authenticated
  using (true);

drop policy if exists "Users can like memories" on public.likes;
create policy "Users can like memories"
  on public.likes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can unlike their likes" on public.likes;
create policy "Users can unlike their likes"
  on public.likes for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_nonempty check (char_length(trim(body)) > 0)
);

create index if not exists comments_memory_id_idx
  on public.comments (memory_id, created_at asc);
create index if not exists comments_author_id_idx on public.comments (author_id);

alter table public.comments enable row level security;

drop policy if exists "Authenticated users can read comments" on public.comments;
create policy "Authenticated users can read comments"
  on public.comments for select
  to authenticated
  using (true);

drop policy if exists "Users can comment on memories" on public.comments;
create policy "Users can comment on memories"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create or replace function public.bump_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.memories
      set likes_count = likes_count + 1
      where id = new.memory_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.memories
      set likes_count = greatest(likes_count - 1, 0)
      where id = old.memory_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists likes_bump_count on public.likes;
create trigger likes_bump_count
after insert or delete on public.likes
for each row execute function public.bump_likes_count();

create or replace function public.bump_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.memories
      set comments_count = comments_count + 1
      where id = new.memory_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.memories
      set comments_count = greatest(comments_count - 1, 0)
      where id = old.memory_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists comments_bump_count on public.comments;
create trigger comments_bump_count
after insert or delete on public.comments
for each row execute function public.bump_comments_count();

-- ---------------------------------------------------------------------------
-- Notifications (in-app; push-ready)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (
    type in (
      'friend_request',
      'friend_accepted',
      'friend_memory',
      'memory_liked',
      'memory_commented'
    )
  ),
  entity_id uuid,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_no_self check (recipient_id <> actor_id)
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists "Users create notifications as actor" on public.notifications;
create policy "Users create notifications as actor"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() = actor_id);

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = recipient_id);
