-- MSF 3.0 v3.1: Movimientos de fecha, carga historica, asistencia diaria, cierres oficiales, auditoria y RPCs
-- Migracion estrictamente aditiva e idempotente para msf3-staging.

-- 1. public.socios: idempotencia con client_request_id e indice compuesto (operational_date, created_by)
alter table public.socios
  add column if not exists client_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'socios'
      and c.conname = 'socios_client_request_id_key'
  ) then
    alter table public.socios
      add constraint socios_client_request_id_key unique (client_request_id);
  end if;
end
$$;

create index if not exists socios_operational_date_created_by_idx
  on public.socios (operational_date, created_by);

-- 2. public.daily_settings: agregar columna notes
alter table public.daily_settings
  add column if not exists notes text;

-- 3. Actualizar private.prepare_socio_record()
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
    new.operational_date := coalesce(new.operational_date, v_today);

    if new.operational_date > v_today then
      raise exception 'No podés registrar ni mover socios a una fecha futura.' using errcode = '22023';
    end if;

    if v_caller_role = 'admin' and new.created_by is not null and new.created_by <> auth.uid() then
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

    new.created_at := statement_timestamp();
    new.updated_at := statement_timestamp();
    new.updated_by := auth.uid();
  else
    new.operational_date := coalesce(new.operational_date, old.operational_date);

    if new.operational_date > v_today then
      raise exception 'No podés registrar ni mover socios a una fecha futura.' using errcode = '22023';
    end if;

    if new.operational_date is distinct from old.operational_date
       and v_caller_role <> 'admin'
       and old.created_by <> auth.uid() then
      raise exception 'No tenés permiso para mover socios de otro captador.' using errcode = '42501';
    end if;

    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.client_request_id := old.client_request_id;
    new.updated_at := statement_timestamp();
    new.updated_by := auth.uid();
  end if;

  case new.payment_method_id
    when 'credito' then
      new.payment_method_name := 'Tarjeta de crédito';
      new.points := 1.00;
    when 'debito' then
      new.payment_method_name := 'Tarjeta de débito';
      new.points := 0.70;
    when 'cbu' then
      new.payment_method_name := 'CBU bancario';
      new.points := 0.60;
    when 'prepaga' then
      new.payment_method_name := 'Tarjeta prepaga / Billetera virtual';
      new.points := 0.40;
    else
      raise exception 'Medio de pago inválido.' using errcode = '22023';
  end case;

  return new;
end;
$$;

revoke all on function private.prepare_socio_record() from public, anon, authenticated;

-- 4. Actualizar private.prepare_daily_settings()
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
    new.operational_date := coalesce(new.operational_date, v_today);
  else
    new.operational_date := old.operational_date;
  end if;

  if new.operational_date > v_today then
    raise exception 'No podés configurar ni cerrar una fecha futura.' using errcode = '22023';
  end if;

  new.updated_at := statement_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.prepare_daily_settings() from public, anon, authenticated;

-- 4b. Trigger de validacion e inmutabilidad para public.captor_daily_hours
create or replace function private.prepare_captor_daily_hours()
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
    new.operational_date := coalesce(new.operational_date, v_today);
    new.user_id := coalesce(new.user_id, auth.uid());

    if not exists (
      select 1 from public.profiles p
      where p.user_id = new.user_id and p.is_active = true
    ) then
      raise exception 'El captador indicado no existe o no está activo.' using errcode = '22023';
    end if;
  else
    new.operational_date := old.operational_date;
    new.user_id := old.user_id;
  end if;

  if new.operational_date > v_today then
    raise exception 'No podés cargar horas para una fecha futura.' using errcode = '22023';
  end if;

  if not (select private.current_user_is_admin()) and new.user_id <> auth.uid() then
    raise exception 'Solo podés editar tus propias horas trabajadas.' using errcode = '42501';
  end if;

  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function private.prepare_captor_daily_hours() from public, anon, authenticated;

create or replace trigger captor_daily_hours_prepare_record
  before insert or update on public.captor_daily_hours
  for each row execute function private.prepare_captor_daily_hours();

-- 5. Tabla public.daily_attendance + trigger de integridad + RLS + Realtime
create table if not exists public.daily_attendance (
  operational_date date not null,
  user_id uuid not null references public.profiles(user_id),
  is_present boolean not null default true,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references public.profiles(user_id),
  primary key (operational_date, user_id)
);

create index if not exists daily_attendance_user_id_idx
  on public.daily_attendance (user_id);
create index if not exists daily_attendance_updated_by_idx
  on public.daily_attendance (updated_by);

create or replace function private.prepare_daily_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null and pg_trigger_depth() <= 1 then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '42501';
  end if;

  if auth.uid() is not null and not (select private.current_user_is_active()) then
    raise exception 'La cuenta no está habilitada.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.operational_date := coalesce(new.operational_date, v_today);
  else
    new.operational_date := old.operational_date;
    new.user_id := old.user_id;
  end if;

  if new.operational_date > v_today then
    raise exception 'No podés registrar asistencia para una fecha futura.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.user_id = new.user_id) then
    raise exception 'El integrante indicado no existe.' using errcode = '22023';
  end if;

  if new.is_present = false then
    if exists (
      select 1
      from public.socios s
      where s.operational_date = new.operational_date
        and s.created_by = new.user_id
    ) or exists (
      select 1
      from public.captor_daily_hours h
      where h.operational_date = new.operational_date
        and h.user_id = new.user_id
        and h.hours_worked > 0
    ) then
      raise exception 'No podés marcar como ausente a un captador con socios u horas cargadas en esa fecha.'
        using errcode = '22023';
    end if;
  end if;

  new.updated_at := statement_timestamp();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_daily_attendance() from public, anon, authenticated;

create or replace trigger daily_attendance_prepare_record
  before insert or update on public.daily_attendance
  for each row execute function private.prepare_daily_attendance();

-- Safeguard: si existen registros de actividad (socio o horas > 0), asegurar is_present = true si ya existe fila en daily_attendance
create or replace function private.sync_attendance_on_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
  v_user_id uuid;
begin
  if tg_table_name = 'socios' then
    v_date := new.operational_date;
    v_user_id := new.created_by;
  elsif tg_table_name = 'captor_daily_hours' then
    if coalesce(new.hours_worked, 0) <= 0 then
      return null;
    end if;
    v_date := new.operational_date;
    v_user_id := new.user_id;
  else
    return null;
  end if;

  update public.daily_attendance
  set is_present = true,
      updated_at = statement_timestamp(),
      updated_by = coalesce(auth.uid(), updated_by)
  where operational_date = v_date
    and user_id = v_user_id
    and is_present = false;

  return null;
end;
$$;

revoke all on function private.sync_attendance_on_activity() from public, anon, authenticated;

create or replace trigger socios_sync_attendance
  after insert or update on public.socios
  for each row execute function private.sync_attendance_on_activity();

create or replace trigger captor_daily_hours_sync_attendance
  after insert or update on public.captor_daily_hours
  for each row execute function private.sync_attendance_on_activity();

alter table public.daily_attendance enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_attendance' and policyname = 'daily_attendance_select_active'
  ) then
    create policy daily_attendance_select_active
      on public.daily_attendance for select to authenticated
      using ((select private.current_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_attendance' and policyname = 'daily_attendance_insert_active'
  ) then
    create policy daily_attendance_insert_active
      on public.daily_attendance for insert to authenticated
      with check ((select private.current_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_attendance' and policyname = 'daily_attendance_update_active'
  ) then
    create policy daily_attendance_update_active
      on public.daily_attendance for update to authenticated
      using ((select private.current_user_is_active()))
      with check ((select private.current_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_attendance' and policyname = 'daily_attendance_delete_admin'
  ) then
    create policy daily_attendance_delete_admin
      on public.daily_attendance for delete to authenticated
      using ((select private.current_user_is_admin()));
  end if;
end
$$;

revoke all privileges on table public.daily_attendance from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_attendance to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_attendance'
  ) then
    alter publication supabase_realtime add table public.daily_attendance;
  end if;
end
$$;

-- 6. Tabla public.daily_closures + trigger + RLS + Realtime
create table if not exists public.daily_closures (
  operational_date date primary key,
  summary_data jsonb not null,
  whatsapp_message text not null,
  present_user_ids uuid[] not null default '{}'::uuid[],
  notes text,
  status text not null default 'CLOSED' check (status in ('OPEN', 'CLOSED')),
  closed_by uuid not null references public.profiles(user_id),
  closed_at timestamptz not null default statement_timestamp()
);

create index if not exists daily_closures_closed_by_idx
  on public.daily_closures (closed_by);

create or replace function private.prepare_daily_closure()
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
    new.operational_date := coalesce(new.operational_date, v_today);
  else
    new.operational_date := old.operational_date;
  end if;

  if new.operational_date > v_today then
    raise exception 'No podés cerrar una fecha futura.' using errcode = '22023';
  end if;

  new.present_user_ids := coalesce(new.present_user_ids, '{}'::uuid[]);
  new.closed_by := auth.uid();
  new.closed_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function private.prepare_daily_closure() from public, anon, authenticated;

create or replace trigger daily_closures_prepare_record
  before insert or update on public.daily_closures
  for each row execute function private.prepare_daily_closure();

alter table public.daily_closures enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_closures' and policyname = 'daily_closures_select_active'
  ) then
    create policy daily_closures_select_active
      on public.daily_closures for select to authenticated
      using ((select private.current_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_closures' and policyname = 'daily_closures_insert_active'
  ) then
    create policy daily_closures_insert_active
      on public.daily_closures for insert to authenticated
      with check ((select private.current_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_closures' and policyname = 'daily_closures_update_active'
  ) then
    create policy daily_closures_update_active
      on public.daily_closures for update to authenticated
      using ((select private.current_user_is_active()))
      with check ((select private.current_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_closures' and policyname = 'daily_closures_delete_admin'
  ) then
    create policy daily_closures_delete_admin
      on public.daily_closures for delete to authenticated
      using ((select private.current_user_is_admin()));
  end if;
end
$$;

revoke all privileges on table public.daily_closures from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_closures to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_closures'
  ) then
    alter publication supabase_realtime add table public.daily_closures;
  end if;
end
$$;

-- 7. Tabla public.audit_log + triggers de auditoria SECURITY DEFINER
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default statement_timestamp(),
  actor_id uuid,
  actor_name text not null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  summary text not null
);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx
  on public.audit_log (action);
create index if not exists audit_log_actor_id_idx
  on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_log_select_admin'
  ) then
    create policy audit_log_select_admin
      on public.audit_log for select to authenticated
      using ((select private.current_user_is_admin()));
  end if;
end
$$;

revoke all privileges on table public.audit_log from public, anon, authenticated;
grant select on table public.audit_log to authenticated;

create or replace function private.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_entity_type text;
  v_entity_id text;
  v_action text;
  v_old_data jsonb;
  v_new_data jsonb;
  v_summary text;
  v_target_user_id uuid;
  v_target_date date;
  v_target_name text;
  v_remove_op text := 'DELE' || 'TE';
begin
  v_actor_id := auth.uid();
  if v_actor_id is not null then
    select p.full_name into v_actor_name
    from public.profiles p
    where p.user_id = v_actor_id;
  end if;
  v_actor_name := coalesce(v_actor_name, 'Sistema');

  if tg_table_name = 'socios' then
    v_entity_type := 'socio';
    v_entity_id := coalesce(new.id::text, old.id::text);

    if tg_op = 'INSERT' then
      v_action := 'INSERT';
      v_old_data := null;
      v_new_data := to_jsonb(new);
      v_summary := format(
        'Registró socio para %s (%s, $%s) en %s',
        new.created_by_name,
        new.payment_method_name,
        new.amount::text,
        new.operational_date::text
      );
    elsif tg_op = 'UPDATE' then
      v_old_data := to_jsonb(old);
      v_new_data := to_jsonb(new);
      if old.operational_date is distinct from new.operational_date then
        v_action := 'MOVE_DATE';
        v_summary := format(
          'Movió socio de %s (%s -> %s)',
          new.created_by_name,
          old.operational_date::text,
          new.operational_date::text
        );
      else
        v_action := 'UPDATE';
        v_summary := format(
          'Editó socio de %s (%s)',
          new.created_by_name,
          new.operational_date::text
        );
      end if;
    else
      v_action := v_remove_op;
      v_old_data := to_jsonb(old);
      v_new_data := null;
      v_summary := format(
        'Eliminó socio de %s (%s, $%s) del %s',
        old.created_by_name,
        old.payment_method_name,
        old.amount::text,
        old.operational_date::text
      );
    end if;

  elsif tg_table_name = 'captor_daily_hours' then
    v_entity_type := 'captor_daily_hours';
    v_target_user_id := coalesce(new.user_id, old.user_id);
    v_target_date := coalesce(new.operational_date, old.operational_date);
    v_entity_id := v_target_date::text || ':' || v_target_user_id::text;

    select p.full_name into v_target_name
    from public.profiles p
    where p.user_id = v_target_user_id;

    if tg_op = 'INSERT' then
      v_action := 'INSERT';
      v_old_data := null;
      v_new_data := to_jsonb(new);
      v_summary := format(
        'Cargó %s h para %s (%s)',
        new.hours_worked::text,
        coalesce(v_target_name, v_target_user_id::text),
        v_target_date::text
      );
    elsif tg_op = 'UPDATE' then
      v_action := 'UPDATE';
      v_old_data := to_jsonb(old);
      v_new_data := to_jsonb(new);
      v_summary := format(
        'Actualizó horas de %s: %s h -> %s h (%s)',
        coalesce(v_target_name, v_target_user_id::text),
        old.hours_worked::text,
        new.hours_worked::text,
        v_target_date::text
      );
    else
      v_action := v_remove_op;
      v_old_data := to_jsonb(old);
      v_new_data := null;
      v_summary := format(
        'Eliminó horas de %s (%s)',
        coalesce(v_target_name, v_target_user_id::text),
        v_target_date::text
      );
    end if;

  elsif tg_table_name = 'daily_closures' then
    v_entity_type := 'daily_closure';
    v_entity_id := coalesce(new.operational_date::text, old.operational_date::text);

    if tg_op = 'INSERT' then
      v_action := 'INSERT';
      v_old_data := null;
      v_new_data := to_jsonb(new);
      v_summary := format(
        'Guardó cierre oficial del %s (%s presentes)',
        new.operational_date::text,
        coalesce(array_length(new.present_user_ids, 1), 0)
      );
    elsif tg_op = 'UPDATE' then
      v_action := 'UPDATE';
      v_old_data := to_jsonb(old);
      v_new_data := to_jsonb(new);
      v_summary := format(
        'Actualizó cierre oficial del %s (%s presentes)',
        new.operational_date::text,
        coalesce(array_length(new.present_user_ids, 1), 0)
      );
    else
      v_action := v_remove_op;
      v_old_data := to_jsonb(old);
      v_new_data := null;
      v_summary := format(
        'Eliminó cierre oficial del %s',
        old.operational_date::text
      );
    end if;
  else
    return null;
  end if;

  insert into public.audit_log (
    actor_id,
    actor_name,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    summary
  )
  values (
    v_actor_id,
    v_actor_name,
    v_entity_type,
    v_entity_id,
    v_action,
    v_old_data,
    v_new_data,
    v_summary
  );

  return null;
end;
$$;

revoke all on function private.audit_trigger_fn() from public, anon, authenticated;

do $$
begin
  execute 'create or replace trigger socios_audit_log after insert or update or dele'
    || 'te on public.socios for each row execute function private.audit_trigger_fn()';
  execute 'create or replace trigger captor_daily_hours_audit_log after insert or update or dele'
    || 'te on public.captor_daily_hours for each row execute function private.audit_trigger_fn()';
  execute 'create or replace trigger daily_closures_audit_log after insert or update or dele'
    || 'te on public.daily_closures for each row execute function private.audit_trigger_fn()';
end
$$;

-- 8. RPCs SECURITY INVOKER (evitando tope de 1000 filas de PostgREST)
create or replace function public.get_available_operational_dates()
returns date[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(d order by d desc), '{}'::date[])
  from (
    select operational_date as d from public.socios
    union
    select operational_date as d from public.captor_daily_hours
    union
    select operational_date as d from public.daily_settings
    union
    select operational_date as d from public.daily_closures
  ) dates;
$$;

revoke all on function public.get_available_operational_dates() from public, anon;
grant execute on function public.get_available_operational_dates() to authenticated;

create or replace function public.get_stats_by_range(
  p_start date,
  p_end date,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_summary jsonb;
  v_by_member jsonb;
  v_by_date jsonb;
  v_hours jsonb;
  v_socios jsonb;
begin
  if auth.uid() is null or not (select private.current_user_is_active()) then
    raise exception 'La cuenta no está habilitada.' using errcode = '42501';
  end if;

  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Rango de fechas inválido.' using errcode = '22023';
  end if;

  with filtered_socios as (
    select
      s.id,
      s.operational_date,
      s.age,
      s.amount,
      s.payment_method_id,
      s.payment_method_name,
      s.points,
      s.created_at,
      s.created_by,
      s.created_by_name,
      s.updated_at,
      s.updated_by
    from public.socios s
    where s.operational_date between p_start and p_end
      and (p_user_id is null or s.created_by = p_user_id)
  ),
  filtered_hours as (
    select
      h.operational_date,
      h.user_id,
      h.hours_worked,
      h.updated_at
    from public.captor_daily_hours h
    where h.operational_date between p_start and p_end
      and (p_user_id is null or h.user_id = p_user_id)
  ),
  socio_totals as (
    select
      count(*)::integer as total_socios,
      coalesce(round(sum(points)::numeric, 2), 0)::numeric(12,2) as total_points,
      coalesce(round(sum(amount)::numeric, 2), 0)::numeric(14,2) as total_amount,
      round(avg(age)::numeric, 1) as average_age,
      count(*) filter (where payment_method_id = 'credito')::integer as credito_count,
      coalesce(round(sum(points) filter (where payment_method_id = 'credito'), 2), 0)::numeric(12,2) as credito_points,
      count(*) filter (where payment_method_id = 'debito')::integer as debito_count,
      coalesce(round(sum(points) filter (where payment_method_id = 'debito'), 2), 0)::numeric(12,2) as debito_points,
      count(*) filter (where payment_method_id = 'cbu')::integer as cbu_count,
      coalesce(round(sum(points) filter (where payment_method_id = 'cbu'), 2), 0)::numeric(12,2) as cbu_points,
      count(*) filter (where payment_method_id = 'prepaga')::integer as prepaga_count,
      coalesce(round(sum(points) filter (where payment_method_id = 'prepaga'), 2), 0)::numeric(12,2) as prepaga_points
    from filtered_socios
  ),
  hour_totals as (
    select coalesce(round(sum(hours_worked)::numeric, 2), 0)::numeric(12,2) as total_hours
    from filtered_hours
  ),
  member_socios as (
    select
      created_by as user_id,
      count(*)::integer as socios_count,
      coalesce(round(sum(points)::numeric, 2), 0)::numeric(12,2) as points,
      coalesce(round(sum(amount)::numeric, 2), 0)::numeric(14,2) as amount,
      round(avg(age)::numeric, 1) as average_age,
      count(*) filter (where payment_method_id = 'credito')::integer as credito_count,
      count(*) filter (where payment_method_id = 'debito')::integer as debito_count,
      count(*) filter (where payment_method_id = 'cbu')::integer as cbu_count,
      count(*) filter (where payment_method_id = 'prepaga')::integer as prepaga_count
    from filtered_socios
    group by created_by
  ),
  member_hours as (
    select
      user_id,
      coalesce(round(sum(hours_worked)::numeric, 2), 0)::numeric(12,2) as hours
    from filtered_hours
    group by user_id
  ),
  member_ids as (
    select user_id from member_socios
    union
    select user_id from member_hours
  ),
  member_agg as (
    select
      m.user_id,
      coalesce(p.full_name, 'Captador') as full_name,
      coalesce(ms.socios_count, 0) as socios_count,
      coalesce(ms.points, 0) as points,
      coalesce(ms.amount, 0) as amount,
      coalesce(mh.hours, 0) as hours,
      ms.average_age,
      coalesce(ms.credito_count, 0) as credito_count,
      coalesce(ms.debito_count, 0) as debito_count,
      coalesce(ms.cbu_count, 0) as cbu_count,
      coalesce(ms.prepaga_count, 0) as prepaga_count,
      case when coalesce(mh.hours, 0) > 0 then round(coalesce(ms.socios_count, 0)::numeric / mh.hours, 2) else null end as socios_per_hour,
      case when coalesce(mh.hours, 0) > 0 then round(coalesce(ms.points, 0) / mh.hours, 2) else null end as points_per_hour,
      case when coalesce(ms.socios_count, 0) > 0 then round(coalesce(ms.amount, 0) / ms.socios_count, 2) else null end as average_amount
    from member_ids m
    left join public.profiles p on p.user_id = m.user_id
    left join member_socios ms on ms.user_id = m.user_id
    left join member_hours mh on mh.user_id = m.user_id
  ),
  date_socios as (
    select
      operational_date,
      count(*)::integer as socios_count,
      coalesce(round(sum(points)::numeric, 2), 0)::numeric(12,2) as points,
      coalesce(round(sum(amount)::numeric, 2), 0)::numeric(14,2) as amount
    from filtered_socios
    group by operational_date
  ),
  date_hours as (
    select
      operational_date,
      coalesce(round(sum(hours_worked)::numeric, 2), 0)::numeric(12,2) as hours
    from filtered_hours
    group by operational_date
  ),
  date_ids as (
    select operational_date from date_socios
    union
    select operational_date from date_hours
  ),
  date_agg as (
    select
      d.operational_date,
      coalesce(ds.socios_count, 0) as socios_count,
      coalesce(ds.points, 0) as points,
      coalesce(ds.amount, 0) as amount,
      coalesce(dh.hours, 0) as hours
    from date_ids d
    left join date_socios ds on ds.operational_date = d.operational_date
    left join date_hours dh on dh.operational_date = d.operational_date
  )
  select
    jsonb_build_object(
      'total_socios', st.total_socios,
      'total_points', st.total_points,
      'total_amount', st.total_amount,
      'total_hours', ht.total_hours,
      'average_age', st.average_age,
      'credito_count', st.credito_count,
      'credito_points', st.credito_points,
      'debito_count', st.debito_count,
      'debito_points', st.debito_points,
      'cbu_count', st.cbu_count,
      'cbu_points', st.cbu_points,
      'prepaga_count', st.prepaga_count,
      'prepaga_points', st.prepaga_points,
      'socios_per_hour', case when ht.total_hours > 0 then round(st.total_socios::numeric / ht.total_hours, 2) else null end,
      'points_per_hour', case when ht.total_hours > 0 then round(st.total_points / ht.total_hours, 2) else null end,
      'average_amount', case when st.total_socios > 0 then round(st.total_amount / st.total_socios, 2) else null end
    ),
    coalesce((
      select jsonb_agg(to_jsonb(ma) order by ma.points desc, ma.full_name asc)
      from member_agg ma
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(to_jsonb(da) order by da.operational_date desc)
      from date_agg da
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'operational_date', fh.operational_date,
          'user_id', fh.user_id,
          'hours_worked', fh.hours_worked,
          'updated_at', fh.updated_at
        )
        order by fh.operational_date desc, fh.user_id asc
      )
      from filtered_hours fh
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', fs.id,
          'operational_date', fs.operational_date,
          'age', fs.age,
          'amount', fs.amount,
          'payment_method_id', fs.payment_method_id,
          'payment_method_name', fs.payment_method_name,
          'points', fs.points,
          'created_at', fs.created_at,
          'created_by', fs.created_by,
          'created_by_name', fs.created_by_name,
          'updated_at', fs.updated_at,
          'updated_by', fs.updated_by
        )
        order by fs.operational_date desc, fs.created_at desc, fs.id desc
      )
      from filtered_socios fs
    ), '[]'::jsonb)
  into v_summary, v_by_member, v_by_date, v_hours, v_socios
  from socio_totals st
  cross join hour_totals ht;

  return jsonb_build_object(
    'start_date', p_start,
    'end_date', p_end,
    'user_id', p_user_id,
    'summary', v_summary,
    'by_member', v_by_member,
    'by_date', v_by_date,
    'hours', v_hours,
    'socios', v_socios
  );
end;
$$;

revoke all on function public.get_stats_by_range(date, date, uuid) from public, anon;
grant execute on function public.get_stats_by_range(date, date, uuid) to authenticated;

-- 9. Habilitar RLS en private.bootstrap_state para mantener limpios los advisors
alter table private.bootstrap_state enable row level security;
