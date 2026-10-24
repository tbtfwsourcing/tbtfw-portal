// Dev only: /leads?demo serves a made-up queue so the CRM can be looked at and
// clicked through without signing in or touching a real lead. The page imports
// this behind import.meta.env.DEV, so it is dropped from the production build.
// Every request to lead-crm is answered here; nothing reaches the backend.
import { CRM_API } from '#lib/config.js';
import type { Lead, Draft, QueueData } from '#lib/api/crm.js';
import voiceText from '../../../docs/voice_prompt.txt?raw';
import { crm } from './state.svelte.js';

const H = 3600_000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString();
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

const leads: Lead[] = [
	{
		id: id(1), kind: 'buy', ref: 'TB-261015-0001', source: 'bio', status: 'new', classification: 'BUYER',
		created_at: at(9 * 24), full_name: 'Daniel Price', phone: '+13105550142', email: 'daniel@example.com',
		contact_pref: 'Text', wanted_text: 'Ferrari SP3', message: "I'm looking for a Ferrari SP3",
		timeline: 'This week', flag: 'Timeline is this week; may need to move fast.',
		missing_info: 'Trade-in interest, financing needs', messages: []
	},
	{
		id: id(2), kind: 'sell', ref: 'TB-261021-0004', source: 'site', status: 'replied', classification: 'SELLER',
		created_at: at(52), enriched_at: at(51), full_name: 'Sofia Marin', phone: '', email: 'sofia@example.com',
		contact_pref: 'Email', zip: '90210', vin: 'SBM14RCA1KW000123', year: 2019, make: 'MCLAREN', model: 'Senna',
		mileage: 1840, asking_price: 1150000, intent: 'Sell outright', condition: 'Excellent', photo_count: 8,
		verdict: 'CHASE', desirability_tier: 'Blue chip', comps_n: 6, comps_median: 1080000,
		desirability_why: 'Low-mile Senna with full MSO carbon pack; one of roughly 500, and US sold comps are holding.',
		verdict_reasoning: 'Asking sits 6% over the sold median on a car that rarely trades. Worth a fast call.',
		missing_info: 'Service records, whether there is a loan',
		messages: [
			{ direction: 'out', channel: 'email', purpose: 'first_touch', status: 'sent', provider: 'graph', sent_at: at(50),
				subject: 'Your Senna', body: 'Hi Sofia, this is Garett with TBTFW in Beverly Hills. Thanks for sending the Senna over. Do you have the service records handy, and is it owned outright?\n\nGarett' },
			{ direction: 'in', channel: 'email', purpose: 'reply', status: 'received', sent_at: at(3),
				body: 'Hi Garett, records are all at the dealer, I can get them this week. It is paid off. What would you be able to do on it?' }
		]
	},
	{
		id: id(3), kind: 'sell', ref: 'TB-261019-0002', source: 'story', status: 'contacted', classification: 'SELLER',
		created_at: at(5 * 24), enriched_at: at(5 * 24 - 1), full_name: 'Marcus Lee', phone: '+13105550178',
		email: 'marcus@example.com', contact_pref: 'Text', year: 2021, make: 'PORSCHE', model: '911', trim: 'GT3 Touring',
		mileage: 6200, asking_price: 245000, photo_count: 4, verdict: 'WATCH', desirability_tier: 'Strong',
		comps_n: 14, comps_median: 236500, desirability_why: 'Manual Touring in a paint-to-sample colour; demand is steady.',
		messages: [
			{ direction: 'out', channel: 'sms', purpose: 'first_touch', status: 'sent', provider: 'manual', sent_at: at(4 * 24),
				body: 'Hi Marcus, Garett with TBTFW in Beverly Hills. Got the GT3 Touring. Could you send a photo of the odometer and the window sticker?' }
		]
	},
	{
		id: id(4), kind: 'buy', ref: 'TB-261012-0007', source: 'site', status: 'offered', classification: 'BUYER',
		created_at: at(12 * 24), full_name: 'Priya Shah', phone: '+13105550110', email: 'priya@example.com',
		contact_pref: 'Text', stock_id: '296GTS-018', year: 2023, make: 'FERRARI', model: '296', trim: 'GTS',
		assigned_to: 'Garett', notes: 'Wants it shipped to Aspen. Sent numbers Tuesday.', messages: [
			{ direction: 'out', channel: 'sms', purpose: 'first_touch', status: 'sent', provider: 'manual', sent_at: at(12 * 24 - 2),
				body: 'Hi Priya, this is Garett with TBTFW in Beverly Hills. The 296 GTS is available. Happy to send photos or answer any questions.' },
			{ direction: 'in', channel: 'sms', status: 'received', sent_at: at(11 * 24), body: 'Can you ship to Colorado?' }
		]
	},
	{
		id: id(5), kind: 'sell', ref: 'TB-261008-0003', source: 'dm', status: 'won', classification: 'SELLER',
		created_at: at(16 * 24), enriched_at: at(16 * 24), full_name: 'James Okafor', email: 'james@example.com',
		year: 2018, make: 'ROLLS-ROYCE', model: 'Phantom', mileage: 11200, asking_price: 310000, verdict: 'FLAG',
		comps_n: 3, comps_median: 298000, assigned_to: 'Garett', messages: []
	},
	{
		id: id(6), kind: 'sell', ref: 'TB-261024-0009', source: 'bio', status: 'new', created_at: at(0.3),
		full_name: 'Elena Ruiz', phone: '+13105550199', contact_pref: 'Text', year: 2024, make: 'LAMBORGHINI',
		model: 'Revuelto', mileage: 900, asking_price: 640000, photo_count: 6, enriched_at: null, messages: []
	},
	{
		id: id(7), kind: 'buy', ref: 'TB-261020-0005', source: 'direct', status: 'junk', classification: 'JUNK',
		created_at: at(4 * 24), full_name: 'asdf', email: 'asdf@example.com', wanted_text: 'test', messages: []
	}
];

const drafts: Draft[] = [
	{
		id: id(101), lead_id: id(2), channel: 'email', purpose: 'reply', to_address: 'sofia@example.com', created_at: at(2.9),
		subject: 'Re: Your Senna',
		body: 'Hi Sofia, thanks. Records this week works. Before I put a number on it, what are you hoping to get for it?\n\nGarett'
	},
	{
		id: id(102), lead_id: id(1), channel: 'sms', purpose: 'first_touch', to_address: '+13105550142', created_at: at(9 * 24 - 0.1),
		body: 'Hi Daniel, this is Garett with TBTFW in Beverly Hills. The Ferrari SP3 is available. Happy to send photos or answer any questions.\nGarett'
	},
	{
		id: id(103), lead_id: id(3), channel: 'sms', purpose: 'follow_up', to_address: '+13105550178', created_at: at(20),
		body: 'Marcus, is the GT3 Touring still available? Garett'
	}
];

const queue = (): QueueData => ({
	ok: true,
	drafts: drafts.filter((d) => !gone.has(d.id)),
	leads,
	channels: { email: true, email_via: 'graph:garett@tbtfw.com', sms: false },
	stages: ['new', 'contacted', 'replied', 'offered', 'won', 'lost', 'duplicate', 'junk'],
	actor: 'portal_key'
});
const gone = new Set<string>();
let voice = { text: voiceText.trim(), v: 12, updated_at: at(3 * 24) };

function reply(body: unknown, ms = 350): Promise<Response> {
	return new Promise((r) =>
		setTimeout(() => r(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })), ms)
	);
}

export function installDemo(): void {
	crm.key = 'demo';
	const real = window.fetch.bind(window);
	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (!url.startsWith(CRM_API)) return real(input, init);
		const path = new URL(url).pathname.slice(new URL(CRM_API).pathname.length);
		const body = init?.body ? JSON.parse(String(init.body)) : {};
		if (path === '/queue') return reply(queue(), 500);
		if (path === '/voice' && init?.method === 'POST') {
			voice = { text: body.text, v: voice.v + 1, updated_at: new Date().toISOString() };
			return reply({ ok: true, v: voice.v });
		}
		if (path === '/voice') return reply({ ok: true, ...voice });
		const m = path.match(/^\/message\/([^/]+)\/(send|mark|skip)$/);
		if (m) gone.add(m[1]);
		const w = path.match(/^\/lead\/([^/]+)\/(status|note|owner)$/);
		const lead = w && leads.find((l) => l.id === w[1]);
		if (lead) Object.assign(lead, w[2] === 'status' ? { status: body.status } : w[2] === 'note' ? { notes: body.notes } : { assigned_to: body.assigned_to });
		return reply({ ok: true });
	};
}
