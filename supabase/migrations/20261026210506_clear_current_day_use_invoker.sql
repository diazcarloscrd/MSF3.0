-- Keep the callable RPC under the caller's RLS context.
-- The function still checks the active administrator profile before clearing.
alter function public.clear_current_day() security invoker;
