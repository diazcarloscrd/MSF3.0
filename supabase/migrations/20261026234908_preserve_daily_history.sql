-- Preserve daily socios and settings for historical read-only consultation.
-- The previous cleanup job erased entries older than seven days. Stop scheduling
-- that job and make its target function inert so accidental manual invocation
-- cannot delete historical records.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'msfc-delete-expired-data';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

create or replace function private.purge_expired_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Historical jornadas are retained; this function deliberately performs no deletion.
  return 0;
end;
$$;
