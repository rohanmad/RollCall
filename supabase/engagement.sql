-- Additive migration: likes + comments (run in SQL editor if memories already exist)
-- Safe to re-run alongside the full schema.sql engagement section.

-- ---------------------------------------------------------------------------
-- Likes
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

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Count triggers on memories.likes_count / comments_count
-- security definer so non-owners can bump counts via like/comment.
-- ---------------------------------------------------------------------------

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
