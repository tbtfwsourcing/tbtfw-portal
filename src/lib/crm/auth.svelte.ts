import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CRM_EMAIL_DOMAIN } from '#lib/config.js';

// Who is signed in to the CRM. Supabase Auth keeps the session in localStorage
// and refreshes it on its own; this is just the reactive mirror of it.
export const auth = $state({
	ready: false,
	session: null as Session | null
});

let client: SupabaseClient | null = null;

// Created on first use in the browser, never during prerender.
export function supabase(): SupabaseClient {
	if (!client) {
		client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
			auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
		});
	}
	return client;
}

export async function initAuth(): Promise<void> {
	const sb = supabase();
	const { data } = await sb.auth.getSession();
	auth.session = data.session;
	auth.ready = true;
	sb.auth.onAuthStateChange((_event, session) => {
		auth.session = session;
	});
}

export function accessToken(): string {
	return auth.session?.access_token ?? '';
}

export function sessionEmail(): string {
	return auth.session?.user.email ?? '';
}

export function allowedEmail(email: string): boolean {
	return email.trim().toLowerCase().endsWith('@' + CRM_EMAIL_DOMAIN);
}

// Sends a six-digit code (and a magic link) to the address. The redirect lands
// back on this page, so tapping the link in the email also signs in.
export async function sendCode(email: string): Promise<string> {
	const { error } = await supabase().auth.signInWithOtp({
		email: email.trim().toLowerCase(),
		options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname }
	});
	return error ? error.message : '';
}

export async function verifyCode(email: string, token: string): Promise<string> {
	const { error } = await supabase().auth.verifyOtp({
		email: email.trim().toLowerCase(),
		token: token.replace(/\D/g, ''),
		type: 'email'
	});
	return error ? error.message : '';
}

export async function signOut(): Promise<void> {
	await supabase().auth.signOut();
	auth.session = null;
}
