
-- MSFC shared daily calculator: initial schema
-- Date source is always America/Argentina/Buenos_Aires (server-side).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  role text not null default 'captador' check (role in ('admin', 'captador')),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  constraint profiles_username_normalized check (
    username = lower(username)
    and username ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  constraint profiles_full_name_nonempty check (length(trim(full_name)) >= 2)
);

create table public.daily_settings (
  operational_date date primary key,
  hours_worked numeric(7,2),
  captor_count integer,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint daily_settings_hours_nonnegative check (hours_worked is null or hours_worked >= 0),
  constraint daily_settings_captors_nonnegative check (captor_count is null or captor_count >= 0)
);

create table public.socios (
  id uuid primary key default gen_random_uuid(),
  operational_date date not null,
  age smallint not null check (age between 1 and 99),
  amount numeric(12,2) not null check (amount > 0),
  payment_method_id text not null check (payment_method_id in ('credito', 'debito', 'cbu', 'prepaga')),
  payment_method_name text not null,
  points numeric(4,2) not null check (points between 0 and 1),
  created_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_name text not null,
  updated_at timestamptz not null,
  updated_by uuid not null references auth.users(id) on delete restrict
);

create index socios_operational_date_created_at_idx
  on public.socios (operational_date, created_at desc);
create index socios_created_by_idx on public.socios (created_by);

create table private.bootstrap_state (
  singleton boolean primary key default true check (singleton = true),
  token_hash text not null,
  consumed_at timestamptz
);
revoke all on table private.bootstrap_state from public, anon, authenticated, service_role;

-- Only the SHA-256 hash is stored; the one-time activation token is distributed separately.
insert into private.bootstrap_state (singleton, token_hash)
values (true, 'ab1b79112d8410b27c62a7bd7aa62c87741a0c35923544480f96d38d7f00b15c');

create or replace function private.current_user_is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true
  );
$$;

create or replace function private.current_user_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true and p.role = 'admin'
  );
$$;

revoke all on function private.current_user_is_active() from public, anon;
revoke all on function private.current_user_is_admin() from public, anon;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

create or replace function public.get_operational_date()
returns date language sql stable security invoker set search_path = ''
as $$
  select (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;
revoke all on function public.get_operational_date() from public, anon;
grant execute on function public.get_operational_date() to authenticated;

create or replace function private.prepare_socio_record()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
  end if;

  select p.full_name into v_name
  from public.profiles p
  where p.user_id = auth.uid() and p.is_active = true;

  if not found then
    raise exception 'La cuenta no está habilitada.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.operational_date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
    new.created_at := statement_timestamp();
    new.created_by := auth.uid();
    new.created_by_name := v_name;
    new.updated_at := statement_timestamp();
    new.updated_by := auth.uid();
  else
    new.operational_date := old.operational_date;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.updated_at := statement_timestamp();
    new.updated_by := auth.uid();
  end if;

  case new.payment_method_id
    when 'credito' then
      new.payment_method_name := 'Tarjeta de crédito'; new.points := 1.00;
    when 'debito' then
      new.payment_method_name := 'Tarjeta de débito'; new.points := 0.70;
    when 'cbu' then
      new.payment_method_name := 'CBU bancario'; new.points := 0.60;
    when 'prepaga' then
      new.payment_method_name := 'Tarjeta prepaga / Billetera virtual'; new.points := 0.40;
    else
      raise exception 'Medio de pago inválido.' using errcode = '22023';
  end case;

  return new;
end;
$$;
revoke all on function private.prepare_socio_record() from public, anon, authenticated;
create trigger socios_prepare_record
before insert or update on public.socios
for each row execute function private.prepare_socio_record();

create or replace function private.prepare_daily_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.operational_date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
  else
    new.operational_date := old.operational_date;
  end if;
  new.updated_at := statement_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function private.prepare_daily_settings() from public, anon, authenticated;
create trigger daily_settings_prepare_record
before insert or update on public.daily_settings
for each row execute function private.prepare_daily_settings();

alter table public.profiles enable row level security;
alter table public.daily_settings enable row level security;
alter table public.socios enable row level security;

create policy profiles_select_self_or_admin
on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or (select private.current_user_is_admin()));

create policy daily_settings_select_active
on public.daily_settings for select to authenticated
using ((select private.current_user_is_active()));
create policy daily_settings_insert_active
on public.daily_settings for insert to authenticated
with check ((select private.current_user_is_active()));
create policy daily_settings_update_active
on public.daily_settings for update to authenticated
using ((select private.current_user_is_active()))
with check ((select private.current_user_is_active()));

create policy socios_select_active
on public.socios for select to authenticated
using ((select private.current_user_is_active()));
create policy socios_insert_own
on public.socios for insert to authenticated
with check ((select private.current_user_is_active()) and created_by = (select auth.uid()));
create policy socios_update_own_or_admin
on public.socios for update to authenticated
using ((select private.current_user_is_active())
  and (created_by = (select auth.uid()) or (select private.current_user_is_admin())))
with check ((select private.current_user_is_active())
  and (created_by = (select auth.uid()) or (select private.current_user_is_admin())));
create policy socios_delete_own_or_admin
on public.socios for delete to authenticated
using ((select private.current_user_is_active())
  and (created_by = (select auth.uid()) or (select private.current_user_is_admin())));

-- Explicit Data API grants are required independently of RLS policies.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.daily_settings to authenticated;
grant select, insert, update, delete on public.socios to authenticated;
revoke all on public.profiles, public.daily_settings, public.socios from anon;

create or replace function public.consume_initial_admin(
  p_token text, p_user_id uuid, p_username text, p_full_name text
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_token_hash text;
begin
  select bs.token_hash into v_token_hash
  from private.bootstrap_state bs
  where bs.singleton = true and bs.consumed_at is null
  for update;

  if v_token_hash is null
     or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_token_hash then
    raise exception 'Clave de activación inválida o ya utilizada.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.role = 'admin') then
    raise exception 'El administrador principal ya fue creado.' using errcode = '23505';
  end if;
  if p_username <> lower(p_username)
     or p_username !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
     or length(trim(p_full_name)) < 2 then
    raise exception 'Los datos del administrador no son válidos.' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, username, full_name, role, is_active)
  values (p_user_id, p_username, trim(p_full_name), 'admin', true);

  update private.bootstrap_state
  set consumed_at = statement_timestamp(), token_hash = 'consumed'
  where singleton = true;
  return true;
end;
$$;
revoke all on function public.consume_initial_admin(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_initial_admin(text, uuid, text, text) to service_role;

create or replace function private.purge_expired_data()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.socios
  where created_at < statement_timestamp() - interval '7 days';
  get diagnostics v_deleted = row_count;
  delete from public.daily_settings
  where operational_date < (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date - 7;
  return v_deleted;
end;
$$;
revoke all on function private.purge_expired_data() from public, anon, authenticated;

create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'msfc-delete-expired-data') then
    perform cron.schedule('msfc-delete-expired-data', '15 * * * *', 'select private.purge_expired_data();');
  end if;
end
$$;

alter publication supabase_realtime add table public.socios, public.daily_settings;
