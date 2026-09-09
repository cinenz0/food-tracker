-- Run in Supabase SQL Editor. No personal data or service-role key belongs in Git.
begin;
create table if not exists public.food_tracker_members (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.food_tracker_members enable row level security;
drop policy if exists member_self on public.food_tracker_members;
create policy member_self on public.food_tracker_members for select to authenticated using(user_id=auth.uid());
grant select on public.food_tracker_members to authenticated;
revoke all on public.food_tracker_members from anon;

create table if not exists public.food_tracker_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null check(key ~ '^(foods|recipes|targets|days|entries)/[A-Za-z0-9_-]{1,100}$'),
 value jsonb,
 version bigint not null default 1,
 primary key(user_id,key),
 check(value is null or (jsonb_typeof(value)='object' and octet_length(value::text)<65536))
);
alter table public.food_tracker_records enable row level security;
drop policy if exists own_records on public.food_tracker_records;
create policy own_records on public.food_tracker_records for select to authenticated using(
 user_id=auth.uid() and exists(select 1 from public.food_tracker_members where user_id=auth.uid())
);
grant select on public.food_tracker_records to authenticated;
revoke insert,update,delete on public.food_tracker_records from authenticated,anon;

create or replace function public.food_tracker_sync(changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c jsonb; current_row public.food_tracker_records; clashes jsonb:='[]'; records jsonb;
begin
 if uid is null or not exists(select 1 from public.food_tracker_members where user_id=uid) then raise exception 'Access denied' using errcode='42501'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>2000 then raise exception 'Invalid batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if (select count(*) from jsonb_array_elements(changes))<>(select count(distinct x->>'key') from jsonb_array_elements(changes) x) then raise exception 'Duplicate keys'; end if;
 for c in select * from jsonb_array_elements(changes) loop
  if (c->>'key') !~ '^(foods|recipes|targets|days|entries)/[A-Za-z0-9_-]{1,100}$' or not(c ? 'value') or not(c ? 'base_version') then raise exception 'Invalid change'; end if;
  select * into current_row from public.food_tracker_records where user_id=uid and key=c->>'key';
  if coalesce(current_row.version,0)<>(c->>'base_version')::bigint and coalesce(current_row.value,'null'::jsonb) is distinct from c->'value' then
   clashes:=clashes||jsonb_build_array(c->>'key');
  end if;
 end loop;
 if jsonb_array_length(clashes)=0 then
  for c in select * from jsonb_array_elements(changes) loop
   insert into public.food_tracker_records as r(user_id,key,value) values(uid,c->>'key',nullif(c->'value','null'::jsonb))
   on conflict(user_id,key) do update set value=excluded.value,version=r.version+1
   where r.value is distinct from excluded.value;
  end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'value',value,'version',version) order by key),'[]'::jsonb) into records from public.food_tracker_records where user_id=uid;
 return jsonb_build_object('applied',jsonb_array_length(clashes)=0,'conflicts',clashes,'records',records);
end $$;
revoke all on function public.food_tracker_sync(jsonb) from public,anon;
grant execute on function public.food_tracker_sync(jsonb) to authenticated;

create table if not exists public.food_tracker_ai_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null, used integer not null, last_at timestamptz not null
);
alter table public.food_tracker_ai_usage enable row level security;
revoke all on public.food_tracker_ai_usage from anon,authenticated;
create or replace function public.food_tracker_use_ai() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); usage public.food_tracker_ai_usage; today date:=(now() at time zone 'UTC')::date;
begin
 if uid is null or not exists(select 1 from public.food_tracker_members where user_id=uid) then raise exception 'Access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
 select * into usage from public.food_tracker_ai_usage where user_id=uid;
 if usage.last_at>now()-interval '5 seconds' or (usage.day=today and usage.used>=30) then return false; end if;
 insert into public.food_tracker_ai_usage values(uid,today,1,now()) on conflict(user_id) do update set
 used=case when food_tracker_ai_usage.day=today then food_tracker_ai_usage.used+1 else 1 end,day=today,last_at=now();
 return true;
end $$;
revoke all on function public.food_tracker_use_ai() from public,anon;
grant execute on function public.food_tracker_use_ai() to authenticated;
-- After creating your user in Authentication > Users, authorize that UUID:
-- insert into public.food_tracker_members(user_id) values ('YOUR_USER_UUID');

commit;
