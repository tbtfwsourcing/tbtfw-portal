-- Auth send-email hook → auth-email Edge Function (Oct 27, 2026). Applied as migration auth_email_hook.
-- Supabase Auth calls public.send_auth_email(event) for every email it would send (Auth → Hooks →
-- Send Email, type Postgres). The hook hands the event to the auth-email function through pg_net with
-- a shared secret from Vault, and the function sends it from the portal mailbox through Microsoft
-- Graph. Turning the hook off in the dashboard falls back to the SMTP settings (Resend).

-- The shared secret: random, created here, never printed. Rotate by deleting the row and re-running.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'AUTH_EMAIL_HOOK_SECRET') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'AUTH_EMAIL_HOOK_SECRET',
      'auth-email: shared secret between the Auth send-email hook and the Edge Function');
  end if;
end $$;

-- The hook. Auth runs it as supabase_auth_admin. pg_net sends after the transaction commits, so the
-- hook returns at once; a failed send is retried and alerted by the function itself.
create or replace function public.send_auth_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'AUTH_EMAIL_HOOK_SECRET';
  if secret is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 500, 'message', 'Sign-in email is not set up.'));
  end if;
  perform net.http_post(
    url := 'https://qymkzfhdneukffeilrhx.supabase.co/functions/v1/auth-email',
    body := event,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', secret),
    timeout_milliseconds := 20000
  );
  return '{}'::jsonb;
end;
$$;

revoke all on function public.send_auth_email(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.send_auth_email(jsonb) to supabase_auth_admin;

-- The function's gate: is this the secret? Returns only true/false, to service_role only.
create or replace function public.check_auth_email_hook_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'AUTH_EMAIL_HOOK_SECRET' and decrypted_secret = p_secret)
$$;

revoke all on function public.check_auth_email_hook_secret(text) from public, anon, authenticated;
grant execute on function public.check_auth_email_hook_secret(text) to service_role;
