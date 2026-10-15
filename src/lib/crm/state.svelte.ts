import { getQueue, getVoice, type QueueData, type Voice, type Lead } from '#lib/api/crm.js';
import { identityPlain } from '#lib/format.js';

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

export function readKey(): void {
	if (typeof window === 'undefined') return;
	try {
		crm.key = new URLSearchParams(location.search).get('k') ?? '';
	} catch {
		crm.key = '';
	}
}

export function leadById(id: string): Lead | null {
	return crm.data?.leads.find((l) => l.id === id) ?? null;
}

export async function load(): Promise<void> {
	if (!crm.key) {
		crm.blocked = {
			title: 'No key in the address.',
			body: 'Open this page with ?k= followed by the portal key from Supabase Vault (PORTAL_KEY).'
		};
		crm.loading = false;
		return;
	}
	try {
		const r = await getQueue(crm.key);
		if (r.status === 401) {
			crm.blocked = {
				title: 'Bad key.',
				body: 'The ?k= in the address does not match the portal key. Check it in Supabase Vault (PORTAL_KEY) and reload.'
			};
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
	if (crm.voiceLoading || !crm.key) return;
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
