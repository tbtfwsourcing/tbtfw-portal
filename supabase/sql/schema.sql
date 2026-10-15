-- TBTFW PORTAL — schema snapshot, Oct 15 2026 (reference only; the live DB is the source of truth)
-- Project qymkzfhdneukffeilrhx. Tables below are the portal's own; the sourcing board's
-- tables (listings, sold_comps, spec_premiums, model_intel, curated_specials, ingest_runs...)
-- are not included. Constraints and indexes listed after the tables.

CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ref text NOT NULL,
  kind text NOT NULL,                       -- buy | sell
  trade_group_id uuid,
  status text NOT NULL DEFAULT 'new',       -- new contacted replied offered won lost duplicate junk
  source text NOT NULL DEFAULT 'direct',    -- bio story dm site text direct
  channel text NOT NULL DEFAULT 'form',     -- form (Turnstile verified) | api
  stock_id text,
  wanted_text text,
  full_name text,
  phone text,
  email text,
  message text,
  has_trade boolean NOT NULL DEFAULT false,
  timeline text,
  wants_financing boolean NOT NULL DEFAULT false,
  zip text,
  contact_pref text,
  best_time text,
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  mileage integer,
  asking_price integer,
  intent text,
  title_status text,
  payoff_estimate integer,
  lienholder text,
  owner_count integer,
  owned_since integer,
  has_records boolean NOT NULL DEFAULT false,
  mods_text text,
  condition text,
  consent_at timestamptz,
  consent_ip text,
  user_agent text,
  photo_count integer NOT NULL DEFAULT 0,
  ready_at timestamptz,
  alerted_at timestamptz,
  assigned_to text,
  notes text,
  comps_median numeric,
  comps_n integer,
  verdict text,                             -- CHASE WATCH FLAG PASS
  desirability_tier text,                   -- exceptional notable ordinary
  desirability_why text,
  first_touch_draft text,
  enriched_at timestamptz,
  turnover_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  canon_model text,
  canon_trim text,
  detected_specs text[],
  unmatched_tokens jsonb,
  verdict_score integer,
  verdict_reasoning text,
  enrich_attempts integer NOT NULL DEFAULT 0,
  enrich_error text,
  classification text,                      -- BUYER SELLER JUNK (voice layer)
  missing_info text,
  flag text,
  PRIMARY KEY (id)
);
ALTER TABLE public.leads ADD CONSTRAINT leads_kind_check CHECK (kind = ANY (ARRAY['buy','sell']));
ALTER TABLE public.leads ADD CONSTRAINT leads_channel_check CHECK (channel = ANY (ARRAY['form','api']));
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status = ANY (ARRAY['new','contacted','replied','offered','won','lost','duplicate','junk']));

CREATE TABLE public.lead_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction text NOT NULL,                  -- out | in
  channel text NOT NULL,                    -- email | sms | dm
  purpose text NOT NULL,                    -- auto_reply first_touch follow_up reply manual
  to_address text,                          -- for direction=in this is the SENDER
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',     -- draft approved sent skipped failed received
  provider text,                            -- graph resend twilio manual
  provider_id text,                         -- graph: internetMessageId
  error text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  thread_id text,                           -- graph: conversationId
  provider_ref text,                        -- graph: message id (what createReply needs)
  PRIMARY KEY (id)
);
CREATE INDEX ON public.lead_messages (lead_id, status, created_at);
CREATE UNIQUE INDEX lead_messages_inbound_provider_id_uniq ON public.lead_messages (provider, provider_id) WHERE direction = 'in' AND provider_id IS NOT NULL;
ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;  -- zero policies; service role only

CREATE TABLE public.lead_events (
  id bigserial PRIMARY KEY,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  slot text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  bytes integer,
  width integer,
  height integer,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- lead-intake looks photos up by lead on /complete; without this the FK has no covering index.
CREATE INDEX IF NOT EXISTS lead_photos_lead_id_idx ON public.lead_photos (lead_id);

CREATE TABLE public.tbtfw_inventory (
  stock_id text PRIMARY KEY,
  vin text, year integer, make text, model text, trim text,
  mileage integer, price integer, color text, vdp_url text, image_url text,
  active boolean NOT NULL DEFAULT true,
  missed_runs integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.portal_kv (
  key text PRIMARY KEY,                     -- voice_prompt, ms_inbox_cursor
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.portal_kv ENABLE ROW LEVEL SECURITY;

-- Storage bucket: lead-photos (objects under leads/{lead_id}/{slot}.{ext}; record_N for service records)

-- pg_cron (active):
--   52 portal-inventory-sync-hourly   23 * * * *      -> inventory-sync
--   53 portal-lead-enrich-2min        */2 * * * *     -> lead-enrich
--   54 portal-lead-inbox-2min         1-59/2 * * * *  -> lead-inbox
-- All sourcing-board jobs (1,2,5,6,10,11,14-27,29-32,35-51) are DEACTIVATED as of Oct 15 2026.

-- Vault secrets: PORTAL_KEY, MS_REFRESH_TOKEN, PUSHOVER_USER_KEY, PUSHOVER_APP_TOKEN, DASHBOARD_KEY
-- Edge secrets: ANTHROPIC_KEY, FIRECRAWL_KEY, TURNSTILE_SECRET, MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MAILBOX
