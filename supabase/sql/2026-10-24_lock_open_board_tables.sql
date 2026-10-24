-- Applied Oct 24, 2026 as migration lock_open_board_tables_and_snapshot_fn.
-- Two sourcing-board tables were readable and writable through the public API, and a
-- SECURITY DEFINER function was callable by anyone. RLS with no policies leaves the
-- tables to the service role (edge functions, cron), like every other table.
alter table public.model_intel enable row level security;
alter table public.benchmark_fn_outputs enable row level security;

revoke execute on function public.take_benchmark_snapshot(text) from public, anon, authenticated;
