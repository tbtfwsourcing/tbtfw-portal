import { digits, fixMake } from './format.js';

const TRANSLIT: Record<string, number> = {
	A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
	J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
	S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Strips anything that cannot appear in a VIN and caps at 17 characters.
export function cleanVin(raw: string): string {
	return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

// ISO 3779 check digit. Rejects I, O and Q outright.
export function vinValid(v: string): boolean {
	if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
	let sum = 0;
	for (let i = 0; i < 17; i++) {
		const c = v.charAt(i);
		const val = /[0-9]/.test(c) ? Number(c) : TRANSLIT[c];
		sum += val * WEIGHTS[i];
	}
	const r = sum % 11;
	return v.charAt(8) === (r === 10 ? 'X' : String(r));
}

export interface Decoded {
	year: string;
	make: string;
	model: string;
	trim: string;
}

export function decodedIsEmpty(d: Decoded): boolean {
	return !d.year && !d.make && !d.model;
}

// NHTSA vPIC. Free, no key, rate-limited but fine for one call per keystroke-17.
export async function decodeVin(vin: string): Promise<Decoded> {
	const r = await fetch(
		'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json'
	);
	const j = await r.json();
	const row = j?.Results?.[0] ?? {};
	return {
		year: digits(row.ModelYear),
		make: fixMake(row.Make),
		model: String(row.Model ?? '').trim(),
		trim: String(row.Trim ?? row.Series ?? '').trim()
	};
}
