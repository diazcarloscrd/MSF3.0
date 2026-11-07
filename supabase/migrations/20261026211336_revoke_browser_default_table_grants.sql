-- Tables created by the postgres migration role should not automatically
-- grant ALL to anon/authenticated. Future app tables must add explicit grants.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
