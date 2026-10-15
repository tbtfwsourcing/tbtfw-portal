-- TBTFW PORTAL — Postgres functions the portal depends on (snapshot Oct 15 2026).
-- score_identity is the shared verdict engine (also used by the dormant board). Its body is long and
-- lives in the live DB; shown here as a signature with the dependencies it calls.

-- Verdict engine (v1.0): pure; called by lead-enrich via RPC and by score_listing (board).
-- Depends on value_car_spec(), compute_verdict(), sold_comps, curated_specials, model_intel.
-- CREATE FUNCTION public.score_identity(p_make text, p_model text, p_trim text, p_year integer, p_mileage integer,
--   p_price numeric, p_detected_specs text[], p_unmatched_tokens jsonb, p_desirability_tier text, p_title text)
--   RETURNS TABLE(verdict text, score integer, reasoning text, baseline_n bigint, baseline_median numeric,
--                 adjusted_low numeric, adjusted_high numeric, flags text[])

CREATE OR REPLACE FUNCTION public.next_lead_ref()
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  k integer;
begin
  insert into public.lead_ref_days (day, n) values (d, 1)
  on conflict (day) do update set n = public.lead_ref_days.n + 1
  returning n into k;
  return 'TB-' || to_char(d, 'YYMMDD') || '-' || lpad(k::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_mark_missing(seen text[])
 RETURNS TABLE(marked integer, deactivated integer) LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare m integer; d integer;
begin
  update public.tbtfw_inventory set missed_runs = missed_runs + 1, updated_at = now()
   where active = true and not (stock_id = any(seen));
  get diagnostics m = row_count;
  update public.tbtfw_inventory set active = false, updated_at = now()
   where active = true and missed_runs >= 2;
  get diagnostics d = row_count;
  return query select m, d;
end;
$function$;

-- Vault accessors (SECURITY DEFINER; execute revoked from anon/authenticated/public — service role only)
CREATE OR REPLACE FUNCTION public.get_portal_key() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ select decrypted_secret from vault.decrypted_secrets where name = 'PORTAL_KEY' $function$;

CREATE OR REPLACE FUNCTION public.get_pushover_keys() RETURNS TABLE(user_key text, app_token text) LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'PUSHOVER_USER_KEY'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'PUSHOVER_APP_TOKEN');
$function$;

CREATE OR REPLACE FUNCTION public.get_ms_refresh_token() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ select decrypted_secret from vault.decrypted_secrets where name = 'MS_REFRESH_TOKEN' $function$;

CREATE OR REPLACE FUNCTION public.set_ms_refresh_token(p_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'MS_REFRESH_TOKEN';
  if v_id is null then
    perform vault.create_secret(p_token, 'MS_REFRESH_TOKEN', 'Microsoft Graph delegated refresh token for the portal mailbox');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end $function$;
