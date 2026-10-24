import { CRM_API } from '../config.js';
import { accessToken } from '../crm/auth.svelte.js';

export type Channel = 'sms' | 'email';
export type Direction = 'in' | 'out';
export type Verdict = 'CHASE' | 'WATCH' | 'FLAG' | 'PASS';
export const VERDICTS: Verdict[] = ['CHASE', 'WATCH', 'FLAG', 'PASS'];
export const DEFAULT_STAGES = ['new', 'contacted', 'replied', 'offered', 'won', 'lost', 'junk'];

export interface Message {
	direction: Direction;
	channel: Channel | string;
	purpose?: string;
	status: string;
	provider?: string;
	sent_at?: string;
	created_at?: string;
	subject?: string;
	body?: string;
	error?: string;
}

export interface Lead {
	id: string;
	kind: 'buy' | 'sell';
	ref?: string;
	source?: string;
	channel?: string;
	created_at?: string;
	enriched_at?: string | null;
	status?: string;
	assigned_to?: string;
	notes?: string;
	full_name?: string;
	phone?: string;
	email?: string;
	zip?: string;
	contact_pref?: string;
	message?: string;
	// car
	vin?: string;
	year?: string | number;
	make?: string;
	model?: string;
	trim?: string;
	canon_model?: string;
	canon_trim?: string;
	mileage?: number | null;
	asking_price?: number | null;
	stock_id?: string;
	wanted_text?: string;
	intent?: string;
	timeline?: string;
	condition?: string;
	photo_count?: number;
	// grading
	classification?: string;
	verdict?: Verdict | string;
	verdict_reasoning?: string;
	desirability_tier?: string;
	desirability_why?: string;
	comps_n?: number;
	comps_median?: number | null;
	flag?: string;
	missing_info?: string;
	enrich_error?: string | null;
	messages?: Message[];
}

export interface Draft {
	id: string;
	lead_id: string;
	channel: Channel;
	purpose?: string;
	subject?: string;
	body?: string;
	to_address?: string;
	created_at?: string;
}

export interface QueueData {
	ok: boolean;
	message?: string;
	drafts: Draft[];
	leads: Lead[];
	// email_via is "graph:<mailbox>" when Outlook sends, "resend" on the fallback, null when off.
	channels: { email?: boolean; email_via?: string | null; sms?: boolean };
	stages?: string[];
	actor?: string;
}

export interface Voice {
	ok?: boolean;
	text: string;
	v?: string | number;
	updated_at?: string;
}

export interface Result<T = Record<string, unknown>> {
	status: number;
	json: (T & { ok?: boolean; message?: string }) | null;
}

// Signed-in users are identified by their Supabase session; the legacy ?k=
// portal key is still passed through while bookmarks migrate.
function withKey(path: string, key: string): string {
	return CRM_API + path + (key ? '?k=' + encodeURIComponent(key) : '');
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
	const t = accessToken();
	return t ? { ...extra, Authorization: 'Bearer ' + t } : extra;
}

async function parse<T>(r: Response): Promise<Result<T>> {
	let json: Result<T>['json'] = null;
	try {
		json = await r.json();
	} catch {
		json = null;
	}
	return { status: r.status, json };
}

export async function getQueue(key: string): Promise<Result<QueueData>> {
	return parse<QueueData>(await fetch(withKey('/queue', key), { cache: 'no-store', headers: headers() }));
}

export async function getVoice(key: string): Promise<Result<Voice>> {
	return parse<Voice>(await fetch(withKey('/voice', key), { cache: 'no-store', headers: headers() }));
}

export async function post<T = Record<string, unknown>>(
	key: string,
	path: string,
	body: unknown = {}
): Promise<Result<T>> {
	return parse<T>(
		await fetch(withKey(path, key), {
			method: 'POST',
			headers: headers({ 'Content-Type': 'application/json' }),
			body: JSON.stringify(body ?? {})
		})
	);
}

export const crm = {
	setStatus: (key: string, id: string, status: string) =>
		post(key, '/lead/' + id + '/status', { status }),
	saveNotes: (key: string, id: string, notes: string) =>
		post(key, '/lead/' + id + '/note', { notes }),
	saveOwner: (key: string, id: string, assigned_to: string) =>
		post(key, '/lead/' + id + '/owner', { assigned_to }),
	saveVoice: (key: string, text: string) => post<{ v?: string | number }>(key, '/voice', { text }),
	send: (key: string, id: string, body: string, subject: string | null) =>
		post(key, '/message/' + id + '/send', { body, subject }),
	mark: (key: string, id: string, body: string, subject: string | null) =>
		post(key, '/message/' + id + '/mark', { body, subject }),
	skip: (key: string, id: string) => post(key, '/message/' + id + '/skip', {})
};
