const MAKE_FIX: Record<string, string> = {
	MCLAREN: 'McLaren',
	BMW: 'BMW',
	'ROLLS-ROYCE': 'Rolls-Royce',
	'ROLLS ROYCE': 'Rolls-Royce',
	'MERCEDES-BENZ': 'Mercedes-Benz',
	'ASTON MARTIN': 'Aston Martin',
	'LAND ROVER': 'Land Rover',
	'ALFA ROMEO': 'Alfa Romeo'
};

type Maybe = string | number | null | undefined;

function present(x: Maybe): x is string | number {
	return x !== null && x !== undefined && String(x).trim() !== '';
}

export function money(n: Maybe, empty = ''): string {
	const v = Number(n);
	return present(n) && isFinite(v) ? '$' + Math.round(v).toLocaleString('en-US') : empty;
}

export function miles(n: Maybe, empty = ''): string {
	const v = Number(n);
	return present(n) && isFinite(v) ? Math.round(v).toLocaleString('en-US') + ' mi' : empty;
}

export function digits(s: Maybe): string {
	return String(s ?? '').replace(/[^0-9]/g, '');
}

// Formats a raw numeric string with thousands separators for display in an input.
export function groupDigits(s: Maybe): string {
	const d = digits(s);
	return d ? Number(d).toLocaleString('en-US') : '';
}

// "(310) 555-1234", built up progressively as the customer types: "(310",
// then "(310) 555", then the full number. A leading country code 1 is dropped
// (no area code starts with 1) and anything past ten digits is ignored.
export function formatPhone(raw: string): string {
	let d = digits(raw);
	if (d.length > 10 && d.startsWith('1')) d = d.slice(1);
	d = d.slice(0, 10);
	if (!d) return '';
	if (d.length <= 3) return '(' + d;
	if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
	return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
}

export function titleCase(s: string): string {
	return s
		.toLowerCase()
		.split(/(\s+|-)/)
		.map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join('');
}

export function fixMake(raw: Maybe): string {
	if (!present(raw)) return '';
	const up = String(raw).trim().toUpperCase();
	return MAKE_FIX[up] ?? titleCase(String(raw).trim());
}

export interface Identity {
	year?: Maybe;
	make?: Maybe;
	model?: Maybe;
	trim?: Maybe;
}

// The portal's quiet separator, a spaced middle dot.
export const SEP = ' \u00B7 ';

// "2022 · Chiron · Super Sport" — the portal's car line.
export function identityLine(o: Identity | null | undefined): string {
	if (!o) return '';
	return [o.year, o.model, o.trim].filter(present).map(String).join(SEP);
}

// "2022 Chiron Super Sport" — the CRM's plainer form, falling back to make.
export function identityPlain(l: {
	year?: Maybe;
	make?: Maybe;
	model?: Maybe;
	trim?: Maybe;
	canon_model?: Maybe;
	canon_trim?: Maybe;
}): string {
	const parts = [l.year, l.canon_model ?? l.model, l.canon_trim ?? l.trim].filter(present).map(String);
	return parts.length ? parts.join(' ') : present(l.make) ? String(l.make) : 'unknown car';
}

export function ago(iso: Maybe): string {
	const t = Date.parse(String(iso ?? ''));
	if (!t) return '';
	const m = Math.round((Date.now() - t) / 60000);
	if (m < 1) return 'just now';
	if (m < 60) return m + ' min ago';
	const h = Math.round(m / 60);
	if (h < 48) return h + 'h ago';
	return Math.round(h / 24) + 'd ago';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
