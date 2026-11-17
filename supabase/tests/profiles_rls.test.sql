begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(21);

-- Seed Auth users and one unverified profile as the local database owner.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'profile-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'profile-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'profile-unverified@example.test', '', null, '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, username, display_name)
values ('10000000-0000-4000-8000-000000000003', 'unverified_user', 'Unverified');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled for profiles'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

insert into public.profiles (user_id, username, display_name)
values ('10000000-0000-4000-8000-000000000001', '  RouteUser  ', 'Route User');

select is(
  (select username from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'routeuser',
  'Profile usernames are trimmed and lowercased before storage'
);

select throws_ok(
  $$update public.profiles set created_at = now() where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Authenticated users cannot update created_at'
);

select throws_ok(
  $$update public.profiles set updated_at = now() where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Authenticated users cannot update updated_at'
);

update public.profiles
set display_name = 'Owner edit'
where user_id = '10000000-0000-4000-8000-000000000001';

select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'Owner edit',
  'A verified user can update their own profile'
);

select throws_ok(
  $$update public.profiles set user_id = '10000000-0000-4000-8000-000000000002' where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Authenticated users cannot change the profile owner ID'
);

select throws_ok(
  $$delete from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Authenticated users cannot delete profiles'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select is_empty(
  $$select user_id from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'$$,
  'A user cannot read another user profile'
);

select is_empty(
  $$update public.profiles set display_name = 'Cross-user edit' where user_id = '10000000-0000-4000-8000-000000000001' returning user_id$$,
  'A user cannot update another user profile'
);

select throws_ok(
  $$delete from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'A user cannot delete another user profile'
);

select throws_ok(
  $$insert into public.profiles (user_id, username) values ('10000000-0000-4000-8000-000000000001', 'impostor_name')$$,
  '42501', null,
  'A user cannot insert a profile for another account'
);

select throws_ok(
  $$insert into public.profiles (user_id, username) values ('10000000-0000-4000-8000-000000000002', ' ROUTEUSER ')$$,
  '23505', null,
  'The database unique index rejects duplicate normalized usernames'
);

select throws_ok(
  $$insert into public.profiles (user_id, username) values ('10000000-0000-4000-8000-000000000002', 'not valid')$$,
  '23514', null,
  'The database rejects usernames outside the allowed format'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  'Owner edit',
  'A cross-user update did not change the owner profile'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';

select is_empty(
  $$select user_id from public.profiles where user_id = '10000000-0000-4000-8000-000000000003'$$,
  'An unverified user cannot read a profile'
);

select is_empty(
  $$update public.profiles set display_name = 'Unverified edit' where user_id = '10000000-0000-4000-8000-000000000003' returning user_id$$,
  'An unverified user cannot update a profile'
);

reset role;

select is(
  (select display_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000003'),
  'Unverified',
  'An unverified update did not modify the existing profile'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';

select throws_ok(
  $$insert into public.profiles (user_id, username) values ('10000000-0000-4000-8000-000000000003', 'unverified_new')$$,
  '42501', null,
  'An unverified user cannot create a profile'
);

set local role anon;

select throws_ok(
  $$select user_id from public.profiles$$,
  '42501', null,
  'Anonymous users cannot read profiles'
);

select throws_ok(
  $$insert into public.profiles (user_id, username) values ('10000000-0000-4000-8000-000000000001', 'anonymous_new')$$,
  '42501', null,
  'Anonymous users cannot insert profiles'
);

select throws_ok(
  $$update public.profiles set display_name = 'Anonymous edit' where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'Anonymous users cannot update profiles'
);

reset role;

select * from finish();
rollback;
