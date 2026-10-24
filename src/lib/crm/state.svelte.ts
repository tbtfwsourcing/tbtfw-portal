import { getQueue, getVoice, type QueueData, type Voice, type Lead } from '#lib/api/crm.js';
import { identityPlain } from '#lib/format.js';
import { accessToken, sessionEmail } from './auth.svelte.js';

export type Tab = 'queue' | 'leads' | 'voice';

export interface Blocked {
	title: string;
	body: string;
}

// The whole CRM session. lead-crm is the only data source; nothing is cached
// client-side beyond this object, and a reload replaces it wholesale.
export const crm = $state({
	key: '',
	data: null as QueueData | null,
	tab: 'queue' as Tab,
	openId: null as string | null,
	voice: null as Voice | null,
	voiceLoading: false,
	filters: { q: '', kind: 'all', stage: 'all', verdict: 'all' },
	blocked: null as Blocked | null,
	loading: true,
	lastLoaded: 0 // epoch ms of the last successful load(); 0 until then
});

// The key arrives as ?k= and is kept in localStorage, so the page added to a
// phone's home screen (whose start URL carries no query) still opens the queue.
const KEY_STORE = 'tbtfw.portalKey';

export function readKey(): void {
	if (typeof window === 'undefined') return;
	let k = '';
	try {
		k = new URLSearchParams(location.search).get('k') ?? '';
		if (k) localStorage.setItem(KEY_STORE, k);
		else k = localStorage.getItem(KEY_STORE) ?? '';
	} catch {
		/* no storage; the URL key alone still works */
	}
	crm.key = k;
}

// Drops the stored key, on sign-out and when the backend rejects it (rotated, or
// retired with CRM_LEGACY_KEY=off), so a home-screen launch falls back to sign-in.
export function forgetKey(): void {
	crm.key = '';
	try {
		localStorage.removeItem(KEY_STORE);
	} catch {
		/* nothing stored */
	}
}

export function leadById(id: string): Lead | null {
	return crm.data?.leads.find((l) => l.id === id) ?? null;
}

export function signedIn(): boolean {
	return !!accessToken() || !!crm.key;
}

export async function load(): Promise<void> {
	// Not signed in and no legacy key: the page shows the sign-in screen instead.
	if (!signedIn()) {
		crm.blocked = null;
		crm.loading = false;
		return;
	}
	try {
		const r = await getQueue(crm.key);
		if (r.status === 401) {
			if (accessToken()) {
				crm.blocked = {
					title: 'Not on the list.',
					body:
						sessionEmail() + ' is signed in but is not allowed into the CRM. Sign out and use your TBTFW address.'
				};
			} else {
				// A bad legacy key: forget it, and the page shows the sign-in screen.
				forgetKey();
				crm.blocked = null;
			}
			return;
		}
		if (!r.json?.ok) {
			crm.blocked = {
				title: 'The queue did not load.',
				body:
					r.json?.message ??
					'HTTP ' + r.status + '. Try again in a minute; if it persists, check lead-crm in the Supabase dashboard.'
			};
			return;
		}
		crm.blocked = null;
		crm.data = r.json;
		crm.lastLoaded = Date.now();
	} catch {
		crm.blocked = {
			title: 'The queue did not load.',
			body: 'No response from the portal backend. Check your connection and reload.'
		};
	} finally {
		crm.loading = false;
	}
}

export async function loadVoice(): Promise<void> {
	if (crm.voiceLoading || !signedIn()) return;
	crm.voiceLoading = true;
	try {
		const r = await getVoice(crm.key);
		if (r.json?.ok) crm.voice = r.json;
	} catch {
		/* stays loading */
	} finally {
		crm.voiceLoading = false;
	}
}

export function matches(l: Lead): boolean {
	const f = crm.filters;
	if (f.kind !== 'all' && l.kind !== f.kind) return false;
	if (f.stage !== 'all' && (l.status ?? 'new') !== f.stage) return false;
	if (f.verdict !== 'all' && (l.verdict ?? '') !== f.verdict) return false;
	if (f.q) {
		const q = f.q.toLowerCase();
		const hay = [
			l.full_name,
			l.phone,
			l.email,
			l.vin,
			l.ref,
			identityPlain(l),
			l.stock_id,
			l.wanted_text,
			l.notes,
			l.assigned_to
		]
			.join(' ')
			.toLowerCase();
		if (!hay.includes(q)) return false;
	}
	return true;
}

// Jump from a draft to its lead, clearing filters so it is guaranteed visible.
export function openLead(id: string): void {
	crm.openId = id;
	crm.tab = 'leads';
	crm.filters = { q: '', kind: 'all', stage: 'all', verdict: 'all' };
}
