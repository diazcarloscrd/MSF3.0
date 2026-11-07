
-- Atomic administrator-only operation to empty today's shared calculation.
create or replace function public.clear_current_day()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not (select private.current_user_is_admin()) then
    raise exception 'Solo el administrador puede borrar la jornada compartida.' using errcode = '42501';
  end if;

  delete from public.socios where operational_date = v_day;

  insert into public.daily_settings (operational_date, hours_worked, captor_count)
  values (v_day, null, null)
  on conflict (operational_date) do update
    set hours_worked = null,
        captor_count = null;
end;
$$;

revoke all on function public.clear_current_day() from public, anon;
grant execute on function public.clear_current_day() to authenticated;
