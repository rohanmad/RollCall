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

create policy "Profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

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
