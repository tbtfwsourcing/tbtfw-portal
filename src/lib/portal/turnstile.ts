import { TURNSTILE_SITE_KEY } from '#lib/config.js';

const browser = typeof window !== 'undefined';

let scriptPromise: Promise<void> | null = null;
const tokens: Record<string, string> = {};
const widgets: Record<string, string> = {};

// Loads the Turnstile script once. Resolves either way so a blocked script
// never blocks a submit; the server still rate-limits without a token.
export function loadTurnstile(): Promise<void> {
	if (!browser || !TURNSTILE_SITE_KEY) return Promise.resolve();
	if (window.turnstile) return Promise.resolve();
	if (!scriptPromise) {
		scriptPromise = new Promise((res) => {
			const cb = 'tbtfwTs' + Date.now();
			(window as unknown as Record<string, unknown>)[cb] = () => res();
			const s = document.createElement('script');
			s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=' + cb + '&render=explicit';
			s.async = true;
			s.defer = true;
			s.onerror = () => res();
			document.head.appendChild(s);
		});
	}
	return scriptPromise;
}

// Renders an invisible widget into a form's container. Screens mount and
// unmount, so each mount replaces any widget previously bound to that key.
export async function mountWidget(key: string, el: HTMLElement): Promise<void> {
	await loadTurnstile();
	if (!window.turnstile) return;
	if (widgets[key]) {
		try {
			window.turnstile.remove(widgets[key]);
		} catch {
			/* already gone */
		}
		delete widgets[key];
	}
	try {
		widgets[key] = window.turnstile.render(el, {
			sitekey: TURNSTILE_SITE_KEY,
			size: 'invisible',
			execution: 'execute',
			callback: (t: string) => {
				tokens[key] = t;
			},
			'error-callback': () => {
				tokens[key] = '';
			},
			'expired-callback': () => {
				tokens[key] = '';
			}
		});
	} catch {
		/* no widget; server rate limit still applies */
	}
}

export function getToken(key: string): Promise<string> {
	return new Promise((res) => {
		if (!TURNSTILE_SITE_KEY || !window.turnstile || !widgets[key]) return res('');
		if (tokens[key]) return res(tokens[key]);
		let done = false;
		const t0 = Date.now();
		try {
			window.turnstile.execute(widgets[key], {
				callback: (t: string) => {
					tokens[key] = t;
					if (!done) {
						done = true;
						res(t);
					}
				}
			});
		} catch {
			return res('');
		}
		const wait = () => {
			if (done) return;
			if (tokens[key]) {
				done = true;
				return res(tokens[key]);
			}
			if (Date.now() - t0 > 8000) {
				done = true;
				return res('');
			}
			setTimeout(wait, 150);
		};
		wait();
	});
}
