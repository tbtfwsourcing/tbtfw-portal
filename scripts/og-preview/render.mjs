// Renders the portal's link preview, static/og.jpg (og:image, 1200x630): the car, the headline
// and the wordmark, drawn by anim.html at its final frame.
//
// The preview has to stay a still. In iMessage, a video (og:video) or an animated image opens
// full screen when tapped, and only the strip under it opens the site. A still opens the site.
//
// Usage: npm run og:preview -- [--car <stock id | photo URL>] [--out <dir>]
//   --car  the car in the preview. Defaults to the Chiron Super Sport 300+ (stock 795008).
//   --out  where to write og.jpg (default: static/).
// Needs Google Chrome (or CHROME=/path/to/chrome). Node 22+.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// Same endpoint as INTAKE_API in src/lib/config.ts.
const INVENTORY = 'https://qymkzfhdneukffeilrhx.supabase.co/functions/v1/lead-intake/inventory';
// The car in the preview as shipped (stock 795008), by photo, so the default still reproduces
// it after the car leaves the inventory feed.
const DEFAULT_CAR = 'https://automanager.blob.core.windows.net/wmphotos/043135/237e00617a0041f6845beb1dda1a6015/fe1b8e74b9_1920.jpg';
// anim.html's last moment, where the preview has fully settled.
const FINAL = 6;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const { values: args } = parseArgs({ options: { car: { type: 'string' }, out: { type: 'string' } } });
const out = resolve(root, args.out ?? 'static');

const fail = (message) => {
	console.error('og:preview: ' + message);
	process.exit(1);
};

// A stock id is looked up in the live inventory (current and past); a URL is used as given.
// Either way the largest rendition, 1920, is what gets rendered.
async function photo(value) {
	if (!value) return { url: DEFAULT_CAR, name: '' };
	if (/^https?:\/\//.test(value)) return { url: value.replace(/_\d+\.jpg$/i, '_1920.jpg'), name: '' };
	const inventory = await fetch(INVENTORY).then((r) => r.json());
	const car = [...(inventory.items ?? []), ...(inventory.past ?? [])].find((c) => c.stock_id === value);
	if (!car?.image_url) throw new Error(`No car with a photo has stock id ${value}.`);
	const name = [car.year, car.make, car.model, car.trim].filter(Boolean).join(' ');
	return { url: car.image_url.replace(/_\d+\.jpg$/i, '_1920.jpg'), name };
}

const car = await photo(args.car).catch((e) => fail(e.message));

const work = mkdtempSync(join(tmpdir(), 'og-preview-'));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${join(work, 'profile')}`,
		'--no-first-run',
		'--hide-scrollbars',
		'--allow-file-access-from-files',
		'about:blank'
	],
	{ stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
	let version;
	for (let i = 0; i < 50 && !version; i++) {
		version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
		if (!version) await sleep(200);
	}
	if (!version) throw new Error('Chrome did not start. Set CHROME to its path.');

	const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((r) => ws.addEventListener('open', r, { once: true }));
	let id = 0;
	const pending = new Map();
	ws.addEventListener('message', (e) => {
		const m = JSON.parse(e.data);
		if (m.id && pending.has(m.id)) {
			pending.get(m.id)(m);
			pending.delete(m.id);
		}
	});
	const send = (method, params = {}) =>
		new Promise((r) => {
			const i = ++id;
			pending.set(i, r);
			ws.send(JSON.stringify({ id: i, method, params }));
		});
	const evaluate = async (expression) =>
		(await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

	await send('Page.enable');
	await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
	const page = pathToFileURL(join(here, 'anim.html'));
	// anim.html crossfades between two cars; at its final frame only the first shows.
	page.search = new URLSearchParams({ a: car.url, b: car.url }).toString();
	await send('Page.navigate', { url: page.href });
	await sleep(800);

	const ready = await evaluate('window.ready');
	if (!ready) throw new Error('anim.html did not load.');
	const d = ready.dims[0];
	if (!d.w) throw new Error(`The photo did not load (${d.src}).`);
	// The CDN's "Coming soon" card is the only image there that is not 3:2.
	if (Math.abs(d.w / d.h - 1.5) > 0.02) throw new Error('That is a "Coming soon" card, not a photo.');
	if (!ready.fonts.includes('Archivo')) throw new Error('The Archivo font did not load. Run npm install first.');

	await evaluate(`render(${FINAL})`);
	await sleep(500);
	const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
	ws.close();
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, 'og.jpg'), Buffer.from(shot.result.data, 'base64'));

	console.log(`Wrote ${join(out, 'og.jpg')} (${Math.round(statSync(join(out, 'og.jpg')).size / 1024)} KB).`);
	if (car.name) console.log(`Car: ${car.name}. Update og:image:alt in src/routes/+page.svelte to match.`);
	console.log('After deploying, check it with a fresh link (for example ?v=5): iMessage caches previews by URL.');
} catch (e) {
	process.exitCode = 1;
	console.error('og:preview: ' + (e instanceof Error ? e.message : e));
} finally {
	// Chrome keeps writing to its profile while it shuts down, so wait for it before cleaning up.
	await new Promise((r) => {
		chrome.once('exit', r);
		chrome.kill();
		setTimeout(r, 3000);
	});
	rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
