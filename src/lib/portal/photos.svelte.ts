import type { InventoryItem } from '#lib/api/intake.js';
import { sized, isPlaceholder } from '#lib/images.js';

// The largest rendition the dealer's CDN serves (tbtfw.com uses the same files).
// Phones crop these to fill a portrait screen, so even there 1920 is what keeps them sharp.
export const FULL = 1920;

// What we know about each car's photo, by stock id: true is a real photograph,
// false is the CDN's "Coming soon" card (or no photo at all). Missing means not
// checked yet. Screens read this before drawing a car's image, so the card is
// never put on screen, not even for a frame.
export const photoOk = $state<Record<string, boolean>>({});

// Records what a loaded image turned out to be. Returns true for a real photo.
export function record(stock: string, img: HTMLImageElement): boolean {
	const ok = !isPlaceholder(img);
	photoOk[stock] = ok;
	return ok;
}

let probing = false;

// Checks the whole showroom with the 400px rendition (about 19 KB a car), six at a
// time and in showroom order, so the first cars are known first.
export function probeAll(items: InventoryItem[]): void {
	if (probing || typeof window === 'undefined') return;
	probing = true;
	const queue = items.filter((i) => {
		if (!i.image_url) photoOk[i.stock_id] = false;
		return i.image_url && photoOk[i.stock_id] === undefined;
	});
	const next = () => {
		const item = queue.shift();
		if (!item) return;
		const img = new Image();
		let fallback = true;
		img.onload = () => {
			record(item.stock_id, img);
			next();
		};
		// Not every car has every rendition; try the 800 once before giving up.
		img.onerror = () => {
			if (fallback) {
				fallback = false;
				img.src = sized(item.image_url, 800);
			} else next();
		};
		img.src = sized(item.image_url, 400);
	};
	for (let k = 0; k < 6; k++) next();
}
