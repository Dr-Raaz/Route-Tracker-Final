create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check ((username collate "C") ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 60)
);

create unique index profiles_username_unique
  on public.profiles ((username collate "C"));

create or replace function public.normalize_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  trimmed_username text;
begin
  trimmed_username := pg_catalog.btrim(new.username, ' ');

  if (trimmed_username collate "C") !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception using
      errcode = '23514',
      message = 'Username must be 3 to 24 ASCII letters, numbers, or underscores.';
  end if;

  new.username := pg_catalog.lower(trimmed_username collate "C");
  new.display_name := nullif(pg_catalog.btrim(new.display_name, ' '), '');

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_normalize_fields
before insert or update on public.profiles
for each row execute function public.normalize_profile_fields();

-- Trigger execution uses the function binding created above. Clients do not
-- need direct EXECUTE privileges to insert or update profile rows.
revoke all on function public.normalize_profile_fields() from public, anon, authenticated;

-- This boolean-only helper lets policies confirm email verification without
-- granting clients access to auth.users or returning any auth user fields.
create or replace function public.is_verified_profile_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (select auth.uid())
      and auth_user.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_verified_profile_owner() from public, anon;
grant execute on function public.is_verified_profile_owner() to authenticated;

alter table public.profiles enable row level security;

create policy profiles_select_own_verified
  on public.profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.is_verified_profile_owner())
  );

create policy profiles_insert_own_verified
  on public.profiles
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_verified_profile_owner())
  );

create policy profiles_update_own_verified
  on public.profiles
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.is_verified_profile_owner())
  )
  with check (
    user_id = (select auth.uid())
    and (select public.is_verified_profile_owner())
  );

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (user_id, username, display_name) on table public.profiles to authenticated;
grant update (username, display_name) on table public.profiles to authenticated;
