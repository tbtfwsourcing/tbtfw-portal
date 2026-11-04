-- Applied Nov 4, 2026 as migration watchdog_cron_window. Supersedes the function in 2026-10-24_watchdog_signals.sql.
-- Why: cron.job_run_details has only its primary key (runid), so "the last 2 days" was a sequential scan of the
-- whole history (74k rows since July): ~1.6 s every 5 minutes, and twice on Nov 3 past the API's 8 s statement
-- timeout, which paged Garett "Database check failed". The window now starts from the newest 10,000 runids
-- (an index range; ~5 days at today's ~1,750 runs a day) before the 2-day filter: same rows, ~40 ms.
-- Also: a daily job keeps 14 days of cron history (it had never been purged).
create or replace function public.watchdog_signals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'at', now(),

    -- Real leads that should already be on Garett's phone. Buy leads push at once,
    -- sell leads by the 5-minute fallback, trade halves by the 10-minute orphan sweep.
    'unalerted', coalesce((
      select jsonb_agg(jsonb_build_object('ref', l.ref, 'kind', l.kind,
        'minutes', round(extract(epoch from now() - l.ready_at) / 60)) order by l.ready_at)
      from public.leads l
      where l.created_at > now() - interval '7 days'
        and l.ready_at is not null and l.ready_at < now() - interval '15 minutes'
        and l.alerted_at is null
        and l.status not in ('duplicate', 'junk')
    ), '[]'::jsonb),

    -- Ready leads the AI has not finished after 20 minutes (still retrying, or out of retries
    -- after an exception, which leaves enriched_at empty for good).
    'unenriched', coalesce((
      select jsonb_agg(jsonb_build_object('ref', l.ref, 'attempts', l.enrich_attempts,
        'error', left(l.enrich_error, 160)) order by l.ready_at)
      from public.leads l
      where l.created_at > now() - interval '7 days'
        and l.ready_at is not null and l.ready_at < now() - interval '20 minutes'
        and l.enriched_at is null
        and l.status not in ('duplicate', 'junk')
    ), '[]'::jsonb),

    -- Leads stamped done with the error kept: the AI gave up after its retries (no draft).
    'gave_up', coalesce((
      select jsonb_agg(jsonb_build_object('ref', l.ref, 'error', left(l.enrich_error, 160)))
      from public.leads l
      where l.enriched_at > now() - interval '24 hours' and l.enrich_error is not null
    ), '[]'::jsonb),

    'push_failed', (
      select jsonb_build_object('count', count(*), 'last_error', left(max(e.payload->>'error'), 160))
      from public.lead_events e
      where e.event = 'push_failed' and e.created_at > now() - interval '30 minutes'
    ),

    -- Outlook (Microsoft Graph) trouble as reported by lead-inbox in its response body.
    'mailbox', (
      select jsonb_build_object('count', count(*), 'sample', left(max(r.content), 200))
      from net._http_response r
      where r.created > now() - interval '15 minutes'
        and r.content ~ 'graph auth|graph inbox|mailbox not connected|MS secrets missing'
    ),

    -- Any background call that failed outright (gateway errors, timeouts, ok:false). Counted,
    -- not itemised: one-off manual test calls land here too, so the function wants several.
    'http_failures', (
      select jsonb_build_object('count', count(*),
        'sample', left(max(coalesce(r.error_msg, r.status_code::text || ' ' || coalesce(r.content, ''))), 200))
      from net._http_response r
      where r.created > now() - interval '15 minutes'
        and (r.timed_out or r.error_msg is not null or r.status_code >= 400 or r.content ~ '"ok"\s*:\s*false')
    ),

    -- Active cron jobs that errored, or have not started for over three of their usual gaps.
    'cron', coalesce((
      with runs as (
        select j.jobname, d.status, d.start_time, d.return_message,
               d.start_time - lag(d.start_time) over (partition by d.jobid order by d.start_time) as gap,
               row_number() over (partition by d.jobid order by d.start_time desc) as rn
        from cron.job j join cron.job_run_details d on d.jobid = j.jobid
        where j.active
          and d.runid > (select max(r.runid) from cron.job_run_details r) - 10000  -- index range, see header
          and d.start_time > now() - interval '2 days'
      ),
      per_job as (
        select jobname,
               max(start_time) as last_start,
               percentile_cont(0.5) within group (order by extract(epoch from gap)) filter (where rn <= 11 and gap is not null) as gap_s,
               count(*) filter (where status = 'failed' and start_time > now() - interval '15 minutes') as recent_failed,
               left(max(return_message) filter (where status = 'failed' and start_time > now() - interval '15 minutes'), 160) as last_error
        from runs group by jobname
      )
      select jsonb_agg(jsonb_build_object('job', jobname,
               'minutes_since', round(extract(epoch from now() - last_start) / 60),
               'failed', recent_failed, 'error', last_error))
      from per_job
      where recent_failed > 0
         or (gap_s is not null and extract(epoch from now() - last_start) > 3 * gap_s + 120)
    ), '[]'::jsonb),

    'inventory', (
      select jsonb_build_object(
        'active', count(*) filter (where i.active),
        'hours_since', round((extract(epoch from now() - max(i.last_seen_at) filter (where i.active)) / 3600)::numeric, 1),
        'last_sync', (select e.payload - 'started_at' - 'finished_at' from public.lead_events e
                      where e.event = 'inventory_sync' order by e.created_at desc limit 1))
      from public.tbtfw_inventory i
    )
  );
$$;

-- create or replace keeps the existing grants (service_role only); restated so this file stands alone.
revoke execute on function public.watchdog_signals() from public, anon, authenticated;
grant execute on function public.watchdog_signals() to service_role;

-- Keep two weeks of cron run history (the watchdog reads two days).
select cron.schedule('portal-cron-history-purge', '17 4 * * *',
  $purge$delete from cron.job_run_details where end_time < now() - interval '14 days'$purge$);
