-- RLS does not protect TRUNCATE; browser roles must not hold it.
revoke all privileges on table public.profiles, public.daily_settings, public.socios
from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert, update on table public.daily_settings to authenticated;
grant select, insert, update, delete on table public.socios to authenticated;
