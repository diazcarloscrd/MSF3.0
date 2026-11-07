
-- Cover the foreign keys used for ownership / updater metadata.
create index if not exists daily_settings_updated_by_idx on public.daily_settings(updated_by);
create index if not exists socios_updated_by_idx on public.socios(updated_by);
