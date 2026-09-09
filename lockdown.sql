-- Lert Lert reservation system — security lockdown migration
-- Safe to run even if parts of this were run before (uses IF NOT EXISTS / DROP IF EXISTS guards).
-- This REPLACES the old wide-open app_data table — any test data in it will be lost, which is fine.

drop table if exists app_data cascade;

-- ============================================================
-- Reservations: real table, not a JSON blob
-- ============================================================
create table if not exists reservations (
  id text primary key,
  code text not null,
  name text not null,
  phone text not null,
  email text not null,
  pax int not null,
  date date not null,
  session text not null,
  slot int not null,
  tables jsonb not null default '[]'::jsonb,
  status text not null default 'confirmed',
  seated_at bigint,
  created_at bigint not null,
  pending jsonb
);
alter table reservations enable row level security;

drop view if exists reservations_public;
create view reservations_public as
  select id, date, session, slot, tables, pax, status
  from reservations;
grant select on reservations_public to anon;

drop policy if exists "staff full access on reservations" on reservations;
create policy "staff full access on reservations"
  on reservations for all
  to authenticated
  using (true) with check (true);

create or replace function create_reservation(
  p_id text, p_code text, p_name text, p_phone text, p_email text,
  p_pax int, p_date date, p_session text, p_slot int, p_tables jsonb
) returns void
language sql security definer as $$
  insert into reservations(id, code, name, phone, email, pax, date, session, slot, tables, status, created_at)
  values (p_id, p_code, p_name, p_phone, p_email, p_pax, p_date, p_session, p_slot, p_tables, 'confirmed', (extract(epoch from now())*1000)::bigint);
$$;
grant execute on function create_reservation(text,text,text,text,text,int,date,text,int,jsonb) to anon;

create or replace function find_my_reservations(p_phone text, p_email text) returns setof reservations
language sql security definer as $$
  select * from reservations
  where regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    and lower(email) = lower(p_email)
    and status = 'confirmed';
$$;
grant execute on function find_my_reservations(text,text) to anon;

create or replace function update_my_reservation(
  p_id text, p_phone text, p_email text,
  p_date date, p_session text, p_slot int, p_pax int, p_tables jsonb, p_pending jsonb
) returns void
language plpgsql security definer as $$
begin
  update reservations
  set date = p_date, session = p_session, slot = p_slot, pax = p_pax, tables = p_tables, pending = p_pending
  where id = p_id
    and regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    and lower(email) = lower(p_email)
    and status = 'confirmed';
end;
$$;
grant execute on function update_my_reservation(text,text,text,date,text,int,int,jsonb,jsonb) to anon;

create or replace function cancel_my_reservation(p_id text, p_phone text, p_email text) returns void
language plpgsql security definer as $$
begin
  update reservations set status = 'cancelled'
  where id = p_id
    and regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    and lower(email) = lower(p_email)
    and status = 'confirmed';
end;
$$;
grant execute on function cancel_my_reservation(text,text,text) to anon;

-- ============================================================
-- Shared config (table layout, settings, closures)
-- Anyone can read, only signed-in staff can write
-- ============================================================
create table if not exists app_config (
  key text primary key,
  value text
);
alter table app_config enable row level security;
drop policy if exists "anyone can read config" on app_config;
create policy "anyone can read config" on app_config
  for select to anon, authenticated using (true);
drop policy if exists "staff can insert config" on app_config;
create policy "staff can insert config" on app_config
  for insert to authenticated with check (true);
drop policy if exists "staff can update config" on app_config;
create policy "staff can update config" on app_config
  for update to authenticated using (true) with check (true);

-- ============================================================
-- Customer notes: staff-only, both directions
-- ============================================================
create table if not exists customer_notes (
  key text primary key,
  value text
);
alter table customer_notes enable row level security;
drop policy if exists "staff only access to customer notes" on customer_notes;
create policy "staff only access to customer notes" on customer_notes
  for all to authenticated using (true) with check (true);
