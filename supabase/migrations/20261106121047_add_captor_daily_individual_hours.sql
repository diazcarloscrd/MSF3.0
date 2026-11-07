create table if not exists public.captor_daily_hours (
  operational_date date not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  hours_worked numeric(5,2) not null check (hours_worked >= 0 and hours_worked <= 24),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (operational_date, user_id)
);

alter table public.captor_daily_hours enable row level security;

drop policy if exists captor_daily_hours_select_active on public.captor_daily_hours;
create policy captor_daily_hours_select_active
  on public.captor_daily_hours for select to authenticated
  using ((select private.current_user_is_active()));

drop policy if exists captor_daily_hours_insert_own on public.captor_daily_hours;
create policy captor_daily_hours_insert_own
  on public.captor_daily_hours for insert to authenticated
  with check (
    (select private.current_user_is_active())
    and user_id = (select auth.uid())
  );

drop policy if exists captor_daily_hours_update_own_or_admin on public.captor_daily_hours;
create policy captor_daily_hours_update_own_or_admin
  on public.captor_daily_hours for update to authenticated
  using (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  )
  with check (
    (select private.current_user_is_active())
    and (user_id = (select auth.uid()) or (select private.current_user_is_admin()))
  );

grant select, insert, update on public.captor_daily_hours to authenticated;
revoke all on public.captor_daily_hours from anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'captor_daily_hours'
  ) then
    alter publication supabase_realtime add table public.captor_daily_hours;
  end if;
end $$;
