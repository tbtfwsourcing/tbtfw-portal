import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { InventoryItem } from '#lib/api/intake.js';
import type { Identity } from '#lib/format.js';
import type { Decoded } from '#lib/vin.js';
import type { Compressed } from '#lib/images.js';
import { SOURCES, type Source } from '#lib/config.js';

export type Mode = 'buy' | 'sell' | 'trade';
export type Screen =
	| 'choice'
	| 'buy'
	| 'showroom'
	| 'sell-car'
	| 'sell-numbers'
	| 'sell-photos'
	| 'sell-you'
	| 'sell-more'
	| 'done';
export type Sheet = 'ask' | 'menu';
export const SCREEN_ORDER: Screen[] = [
	'choice',
	'buy',
	'showroom',
	'sell-car',
	'sell-numbers',
	'sell-photos',
	'sell-you',
	'sell-more',
	'done'
];
// The sell flow asks one thing per screen. sell-more is optional and comes after the lead is sent.
export const SELL_STEPS: Screen[] = ['sell-car', 'sell-numbers', 'sell-photos', 'sell-you'];

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
	// Which showroom slide is showing, so closing a sheet or coming Back keeps the place.
	showIndex: 0,
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
// replace swaps the current entry instead, so Back skips a sheet that has done its job.
export function go(screen: Screen, replace = false): void {
	goto(location.href, { state: { screen }, shallow: true, replace });
}

// Sheets get their own history entry, so the phone's Back gesture closes the
// sheet instead of leaving the screen underneath it.
export function openSheet(sheet: Sheet): void {
	goto(location.href, { state: { screen: page.state.screen ?? 'choice', sheet }, shallow: true });
}

export function closeSheet(): void {
	if (page.state.sheet) history.back();
}

// Opens the car view on one showroom car. From the side menu it replaces the
// menu's history entry, so Back returns to the screen, not to the open menu.
export function openCar(index: number, replace = false): void {
	portal.showIndex = index;
	go('showroom', replace);
}

// History-backed Back. Any screen past "choice" has a pushState behind it.
export function back(current: Screen): void {
	if (current === 'choice') return;
	history.back();
}

export function start(mode: Mode): void {
	portal.mode = mode;
	if (mode !== 'sell') portal.buyForm.has_trade = mode === 'trade';
	go(mode === 'sell' ? 'sell-car' : 'buy');
}

// From the confirmation into the showroom: a fresh start, so the page lets it
// through instead of sending anyone leaving "done" back to the choice screen.
export function browseAgain(): void {
	portal.mode = 'buy';
	portal.buyForm.has_trade = false;
	goto(location.href, { state: { screen: 'buy', restart: true }, shallow: true });
}

export function finish(ref: string, photo: string | null, spec: string, note: string): void {
	let n = note;
	if (portal.mode === 'trade' && portal.buy?.ref && portal.sell) {
		n = 'Paired with ' + portal.buy.ref + ' for the car you asked about.';
	}
	portal.done = { ref, photo, spec, note: n };
	go('done', true);
}

export function photoCount(): number {
	return Object.keys(portal.photos).length;
}

// "1 / 4" on the sell steps. The trade flow uses the same four steps after the buy sheet.
export function sellStep(screen: Screen): { n: number; of: number } {
	return { n: SELL_STEPS.indexOf(screen) + 1, of: SELL_STEPS.length };
}

export function sellEyebrow(): string {
	return portal.mode === 'trade' ? 'Your trade-in' : 'Sell or trade';
}
