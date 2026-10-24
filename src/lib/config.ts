// Backend endpoints. Both are public Supabase Edge Functions that gate themselves.
export const INTAKE_API = 'https://qymkzfhdneukffeilrhx.supabase.co/functions/v1/lead-intake';
export const CRM_API = 'https://qymkzfhdneukffeilrhx.supabase.co/functions/v1/lead-crm';
// Microsoft sign-in for the sending mailbox; /start?k= reconnects it when email goes off.
export const MS_AUTH_API = 'https://qymkzfhdneukffeilrhx.supabase.co/functions/v1/ms-auth';

// Where inventory photos are served from; the portal preconnects to it.
export const IMAGE_CDN = 'https://automanager.blob.core.windows.net';

// Supabase Auth for the CRM. The publishable key is public by design; access is
// decided by lead-crm, which only accepts signed-in users on CRM_EMAIL_DOMAIN.
export const SUPABASE_URL = 'https://qymkzfhdneukffeilrhx.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gJeVwOoe-XAF11eDN7CbSA_OE75UmdW';
export const CRM_EMAIL_DOMAIN = 'tbtfw.com';

// Cloudflare Turnstile, invisible widget. Public site key; the secret lives in Vault.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFXP4PgRTicqUUVZ';

// ?src= values the intake recognises; anything else is recorded as "direct".
export const SOURCES = ['bio', 'story', 'dm', 'site', 'text'] as const;
export type Source = (typeof SOURCES)[number] | 'direct';

export const SLOT_ORDER = ['front34', 'rear34', 'interior', 'odometer', 'vin_plate', 'sticker'] as const;
export type NamedSlot = (typeof SLOT_ORDER)[number];
export const SLOT_NAMES: Record<NamedSlot, string> = {
	front34: 'Front three quarter',
	rear34: 'Rear three quarter',
	interior: 'Interior',
	odometer: 'Odometer',
	vin_plate: 'VIN plate',
	sticker: 'Window sticker or build sheet'
};

export const MAX_PHOTOS = 20;
export const MIN_PHOTOS = 3;
export const MAX_RECORDS = 5;
export const MAX_EXTRA_SLOTS = 14;

export const SITE = {
	name: 'TBTFW',
	tagline: 'Hypercar and luxury dealership. Beverly Hills.',
	home: 'https://www.tbtfw.com',
	privacy: 'https://www.tbtfw.com/policies/privacy-policy',
	// Canonical URL of the deployed portal, used for og:url and the canonical tag.
	portal: 'https://tbtfwsourcing.github.io/tbtfw-portal/',
	// Fill these in to surface them in the footer; left blank they are not rendered.
	phone: '',
	address: '',
	hours: ''
} as const;
