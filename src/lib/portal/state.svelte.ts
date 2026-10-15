import { goto } from '$app/navigation';
import type { InventoryItem } from '#lib/api/intake.js';
import type { Identity } from '#lib/format.js';
import type { Decoded } from '#lib/vin.js';
import type { Compressed } from '#lib/images.js';
import { SOURCES, type Source } from '#lib/config.js';

export type Mode = 'buy' | 'sell' | 'trade';
export type Screen = 'choice' | 'buy' | 'sell1' | 'sell2' | 'done';
export const SCREEN_ORDER: Screen[] = ['choice', 'buy', 'sell1', 'sell2', 'done'];

export interface Photo extends Compressed {
	url: string; // object URL for the preview thumbnail
}

export interface BuyResult {
	ref: string;
	id: string;
	identity: Identity;
	stock: string;
	wanted: string;
	photo: string | null;
}

export interface SellResult {
	ref: string;
	id: string;
	identity: Identity;
	mileage: string;
	asking: string;
	vin: string;
	photoCount?: number;
}

function emptyBuyForm() {
	return {
		stock_id: '',
		wanted_text: '',
		full_name: '',
		phone: '',
		email: '',
		message: '',
		has_trade: false,
		timeline: '',
		wants_financing: false,
		zip: '',
		contact_pref: '',
		best_time: '',
		consent: false
	};
}

function emptySellForm() {
	return { vin: '', mileage: '', asking_price: '', full_name: '', phone: '', email: '', consent: false };
}

function emptyDetailsForm() {
	return {
		intent: '',
		title_status: '',
		payoff_estimate: '',
		lienholder: '',
		original_owner: false,
		owned_since: '',
		has_records: false,
		mods_text: '',
		condition: '',
		zip: '',
		timeline: '',
		contact_pref: '',
		best_time: ''
	};
}

// One object for the whole intake session. Form values live here (not in the
// screens) so going Back and Forward never loses what the customer typed, and
// so the trade flow can carry buy details into the sell step.
export const portal = $state({
	mode: 'buy' as Mode,
	source: 'direct' as Source,
	inv: [] as InventoryItem[],
	past: [] as InventoryItem[],
	invLoaded: false,
	tradeGroupId: '',
	buy: null as BuyResult | null,
	sell: null as SellResult | null,
	photos: {} as Record<string, Photo>,
	records: [] as File[],
	decoded: null as Decoded | null,
	vinOk: false,
	buyForm: emptyBuyForm(),
	sellForm: emptySellForm(),
	detailsForm: emptyDetailsForm(),
	done: { ref: '', photo: null as string | null, spec: '', note: '' }
});

export function readSource(): void {
	if (typeof window === 'undefined') return;
	const s = (new URLSearchParams(location.search).get('src') ?? '').toLowerCase();
	portal.source = (SOURCES as readonly string[]).includes(s) ? (s as Source) : 'direct';
}

// Shallow navigation: a new history entry carrying the screen, same URL, no load.
export function go(screen: Screen): void {
	goto(location.href, { state: { screen }, shallow: true });
}

// History-backed Back. Any screen past "choice" has a pushState behind it.
export function back(current: Screen): void {
	if (current === 'choice') return;
	history.back();
}

export function start(mode: Mode): void {
	portal.mode = mode;
	if (mode !== 'sell') portal.buyForm.has_trade = mode === 'trade';
	go(mode === 'sell' ? 'sell1' : 'buy');
}

export function finish(ref: string, photo: string | null, spec: string, note: string): void {
	let n = note;
	if (portal.mode === 'trade' && portal.buy?.ref && portal.sell) {
		n = 'Paired with ' + portal.buy.ref + ' for the car you asked about.';
	}
	portal.done = { ref, photo, spec, note: n };
	go('done');
}

export function photoCount(): number {
	return Object.keys(portal.photos).length;
}

export function railFor(screen: Screen): { label: string; step?: string } {
	const trade = portal.mode === 'trade';
	switch (screen) {
		case 'buy':
			return trade ? { label: 'TRADE', step: '1 OF 3' } : { label: 'BUY', step: '1 OF 1' };
		case 'sell1':
			return trade ? { label: 'TRADE', step: '2 OF 3' } : { label: 'SELL', step: '1 OF 2' };
		case 'sell2':
			return trade ? { label: 'TRADE', step: '3 OF 3' } : { label: 'SELL', step: '2 OF 2' };
		case 'done':
			return { label: 'SENT' };
		default:
			return { label: '' };
	}
}
