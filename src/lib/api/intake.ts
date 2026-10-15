import { INTAKE_API } from '../config.js';
import type { Identity } from '../format.js';

export interface InventoryItem {
	stock_id: string;
	vin?: string;
	year?: string | number;
	make?: string;
	model?: string;
	trim?: string;
	price?: number | null;
	mileage?: number | null;
	image_url?: string | null;
}

export interface InventoryResponse {
	items: InventoryItem[];
	past: InventoryItem[];
}

export interface UploadUrl {
	slot: string;
	url: string;
	content_type?: string;
}

export interface LeadResponse {
	ok: boolean;
	message?: string;
	ref?: string;
	lead_id?: string;
	identity?: Identity;
	trade_group_id?: string;
	upload_urls?: UploadUrl[];
	_status: number;
}

export interface CompleteResponse {
	ok: boolean;
	photo_count?: number;
	_status: number;
}

export interface DetailsResponse {
	ok?: boolean;
	upload_urls?: UploadUrl[];
	_status: number;
}

async function post<T extends { _status: number }>(path: string, body: unknown): Promise<T> {
	const r = await fetch(INTAKE_API + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const j = await r.json();
	return { ...j, _status: r.status } as T;
}

// The portal's prerendered <head> starts this request before the app's JS
// has loaded (routes/+page.svelte). Reuse it rather than paying a second
// round trip after hydration; fall back to a fresh fetch if it is missing or failed.
export async function getInventory(): Promise<InventoryResponse> {
	const g = globalThis as { __inv?: Promise<InventoryResponse | null> };
	let d = g.__inv ? await g.__inv.catch(() => null) : null;
	delete g.__inv;
	if (!d) {
		const r = await fetch(INTAKE_API + '/inventory');
		d = await r.json();
	}
	return { items: d?.items ?? [], past: d?.past ?? [] };
}

export function createLead(body: Record<string, unknown>): Promise<LeadResponse> {
	return post<LeadResponse>('/lead', body);
}

export function completeLead(
	leadId: string,
	dims: Record<string, [number, number]>
): Promise<CompleteResponse> {
	return post<CompleteResponse>('/lead/' + leadId + '/complete', { dims });
}

export function saveDetails(leadId: string, body: Record<string, unknown>): Promise<DetailsResponse> {
	return post<DetailsResponse>('/lead/' + leadId + '/details', body);
}

// PUT to a signed Storage URL. x-upsert lets a retry overwrite a partial object.
export async function putUpload(url: string, blob: Blob, type: string): Promise<void> {
	const r = await fetch(url, {
		method: 'PUT',
		headers: { 'Content-Type': type || 'image/jpeg', 'x-upsert': 'true' },
		body: blob
	});
	if (!r.ok) throw new Error('upload ' + r.status);
}
