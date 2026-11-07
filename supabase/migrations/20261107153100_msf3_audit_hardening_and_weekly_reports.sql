-- Migración aplicada en producción (brvwhnyjemxqsnuwqwwt) - Auditoría Integral MSF 3.0

-- 1. Desactivar cuenta excluida (Morena) preservando historial previo
update public.profiles
set is_active = false
where username = 'morena';

-- 2. Permitir que integrantes activos lean el directorio de perfiles activos (y cada usuario su propio estado)
alter policy profiles_select_self_or_admin
  on public.profiles
  using (
    user_id = (select auth.uid())
    or (select private.current_user_is_active())
  );

-- 3. Índice en FK de captor_daily_hours + políticas INSERT/DELETE para propietario o administrador
create index if not exists captor_daily_hours_user_id_idx
  on public.captor_daily_hours (user_id);

alter policy captor_daily_hours_insert_own
  on public.captor_daily_hours
  with check (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  );

create policy captor_daily_hours_delete_own_or_admin
  on public.captor_daily_hours for delete to authenticated
  using (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  );

grant select, insert, update, delete on table public.captor_daily_hours to authenticated;
revoke all on table public.captor_daily_hours from anon;

-- 4. Actualizar trigger y política INSERT de socios
create or replace function private.prepare_socio_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_name text;
  v_caller_role text;
  v_target_id uuid;
  v_target_name text;
  v_today date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
  end if;

  select p.full_name, p.role
    into v_caller_name, v_caller_role
  from public.profiles p
  where p.user_id = auth.uid() and p.is_active = true;

  if not found then
    raise exception 'La cuenta no está habilitada.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_caller_role = 'admin' then
      new.operational_date := coalesce(new.operational_date, v_today);
      if new.created_by is not null and new.created_by <> auth.uid() then
        select p.user_id, p.full_name
          into v_target_id, v_target_name
        from public.profiles p
        where p.user_id = new.created_by and p.is_active = true;

        if not found then
          raise exception 'El captador seleccionado no existe o no está activo.' using errcode = '22023';
        end if;

        new.created_by := v_target_id;
        new.created_by_name := v_target_name;
      else
        new.created_by := auth.uid();
        new.created_by_name := v_caller_name;
      end if;
    else
      new.operational_date := v_today;
      new.created_by := auth.uid();
      new.created_by_name := v_caller_name;
    end if;

    new.created_at := statement_timestamp();
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

alter policy socios_insert_own
  on public.socios
  with check (
    (select private.current_user_is_active())
    and (created_by = (select auth.uid()) or (select private.current_user_is_admin()))
  );

-- 5. Actualizar trigger y política de daily_settings
create or replace function private.prepare_daily_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
  end if;
  if not (select private.current_user_is_active()) then
    raise exception 'La cuenta no está habilitada.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if (select private.current_user_is_admin()) then
      new.operational_date := coalesce(new.operational_date, v_today);
    else
      new.operational_date := v_today;
    end if;
  else
    new.operational_date := old.operational_date;
  end if;
  new.updated_at := statement_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.prepare_daily_settings() from public, anon, authenticated;

create policy daily_settings_delete_admin
  on public.daily_settings for delete to authenticated
  using ((select private.current_user_is_admin()));

grant select, insert, update, delete on table public.daily_settings to authenticated;
revoke all on table public.daily_settings from anon;

-- 6. Crear tabla public.weekly_reports para persistencia compartida y Realtime de la Planilla Semanal
create table if not exists public.weekly_reports (
  year smallint not null check (year between 2026 and 2100),
  week_number smallint not null check (week_number between 1 and 53),
  user_id uuid not null references public.profiles(user_id),
  member_name text not null,
  points_earned numeric(8,2) not null default 0 check (points_earned >= 0),
  invalid_and_cancellations numeric(8,2) not null default 0 check (invalid_and_cancellations >= 0),
  final_points numeric(8,2) not null default 0,
  hours numeric(6,2) not null default 0 check (hours >= 0 and hours <= 168),
  points_per_hour numeric(8,2),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  final_partners integer not null default 0 check (final_partners >= 0),
  average_amount numeric(14,2),
  notes text,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id),
  primary key (year, week_number, user_id)
);

create index if not exists weekly_reports_user_id_idx on public.weekly_reports (user_id);
create index if not exists weekly_reports_updated_by_idx on public.weekly_reports (updated_by);

create or replace function private.prepare_weekly_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_name text;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
  end if;
  if not (select private.current_user_is_active()) then
    raise exception 'La cuenta no está habilitada.' using errcode = '42501';
  end if;

  select p.full_name into v_profile_name
  from public.profiles p
  where p.user_id = new.user_id;

  if v_profile_name is null then
    raise exception 'El integrante indicado para la planilla semanal no existe.' using errcode = '22023';
  end if;

  new.member_name := v_profile_name;
  new.final_points := round(new.points_earned - new.invalid_and_cancellations, 2);
  new.points_per_hour := case
    when new.hours > 0 then round((new.points_earned - new.invalid_and_cancellations) / new.hours, 2)
    else null
  end;
  new.average_amount := case
    when new.final_partners > 0 then round(new.total_amount / new.final_partners, 2)
    else null
  end;
  new.updated_at := statement_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.prepare_weekly_report() from public, anon, authenticated;

create trigger weekly_reports_prepare_record
  before insert or update on public.weekly_reports
  for each row execute function private.prepare_weekly_report();

alter table public.weekly_reports enable row level security;

create policy weekly_reports_select_active
  on public.weekly_reports for select to authenticated
  using ((select private.current_user_is_active()));

create policy weekly_reports_insert_own_or_admin
  on public.weekly_reports for insert to authenticated
  with check (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  );

create policy weekly_reports_update_own_or_admin
  on public.weekly_reports for update to authenticated
  using (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  )
  with check (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  );

create policy weekly_reports_delete_own_or_admin
  on public.weekly_reports for delete to authenticated
  using (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  );

revoke all privileges on table public.weekly_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.weekly_reports to authenticated;

alter publication supabase_realtime add table public.weekly_reports;
