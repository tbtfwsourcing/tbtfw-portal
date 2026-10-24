// Renders the portal's link preview from anim.html:
//   og.jpg   the still, the last frame of the animation (og:image). Always written.
//   og.mp4   with --video: the six-second clip. iMessage plays an og:video in the bubble, but a tap
//            then opens the clip instead of the site, so the portal ships the still only.
//   og.gif, og.webp  with --animated: a loop that opens on the still, crossfades to the second car
//            and back. For testing whether iMessage animates an og:image (see static/preview-test/).
//
// Usage: npm run og:preview -- [--a <stock id | photo URL>] [--b <stock id | photo URL>] [--out <dir>] [--video] [--animated]
//   --a  the lead car, and the still. Defaults to the Chiron Super Sport 300+ in the current preview.
//   --b  the car it crossfades to. Defaults to the blue Chiron Super Sport.
//   --out  where to write the files (default: static/).
// Needs Google Chrome (or CHROME=/path/to/chrome), ffmpeg (brew install ffmpeg) and, for --animated,
// img2webp (brew install webp). Node 22+.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// Same endpoint as INTAKE_API in src/lib/config.ts.
const INVENTORY = 'https://qymkzfhdneukffeilrhx.supabase.co/functions/v1/lead-intake/inventory';
// The two cars in the preview as shipped (stock 795008 and 795037-BUG), by photo, so the
// defaults still reproduce it after either car leaves the inventory feed.
const DEFAULT_A = 'https://automanager.blob.core.windows.net/wmphotos/043135/237e00617a0041f6845beb1dda1a6015/fe1b8e74b9_1920.jpg';
const DEFAULT_B = 'https://automanager.blob.core.windows.net/wmphotos/043135/eca321e787fc46c9984b5403f37cc7b0/bda9b1a626_1920.jpg';
const SECONDS = 6;
const FPS = 30;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const { values: args } = parseArgs({
	options: {
		a: { type: 'string' },
		b: { type: 'string' },
		out: { type: 'string' },
		video: { type: 'boolean' },
		animated: { type: 'boolean' }
	}
});
const out = resolve(root, args.out ?? 'static');

// A stock id is looked up in the live inventory (current and past); a URL is used as given.
// Either way the largest rendition, 1920, is what gets rendered.
let inventory;
async function photo(value, fallback) {
	if (!value) return { url: fallback, name: '' };
	if (/^https?:\/\//.test(value)) return { url: value.replace(/_\d+\.jpg$/i, '_1920.jpg'), name: '' };
	inventory ??= await fetch(INVENTORY).then((r) => r.json());
	const car = [...(inventory.items ?? []), ...(inventory.past ?? [])].find((c) => c.stock_id === value);
	if (!car?.image_url) throw new Error(`No car with a photo has stock id ${value}.`);
	const name = [car.year, car.make, car.model, car.trim].filter(Boolean).join(' ');
	return { url: car.image_url.replace(/_\d+\.jpg$/i, '_1920.jpg'), name };
}

const fail = (message) => {
	console.error('og:preview: ' + message);
	process.exit(1);
};
const a = await photo(args.a, DEFAULT_A).catch((e) => fail(e.message));
const b = await photo(args.b, DEFAULT_B).catch((e) => fail(e.message));
try {
	execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
	fail('ffmpeg is not installed. Run: brew install ffmpeg');
}
if (args.animated) {
	try {
		execFileSync('img2webp', ['-version'], { stdio: 'ignore' });
	} catch {
		fail('img2webp is not installed. Run: brew install webp');
	}
}

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
	const shot = async (file) => {
		const s = await send('Page.captureScreenshot', { format: 'png' });
		writeFileSync(file, Buffer.from(s.result.data, 'base64'));
	};

	await send('Page.enable');
	await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
	const page = pathToFileURL(join(here, 'anim.html'));
	page.search = new URLSearchParams({ a: a.url, b: b.url }).toString();
	await send('Page.navigate', { url: page.href });
	await sleep(800);

	const ready = await evaluate('window.ready');
	if (!ready) throw new Error('anim.html did not load.');
	ready.dims.forEach((d, i) => {
		const which = i ? '--b' : '--a';
		if (!d.w) throw new Error(`${which}: the photo did not load (${d.src}).`);
		// The CDN's "Coming soon" card is the only image there that is not 3:2.
		if (Math.abs(d.w / d.h - 1.5) > 0.02) throw new Error(`${which}: that is a "Coming soon" card, not a photo.`);
	});
	if (!ready.fonts.includes('Archivo')) throw new Error('The Archivo font did not load. Run npm install first.');
	await sleep(500);

	const frames = join(work, 'frames');
	mkdirSync(frames);
	const total = SECONDS * FPS;
	for (let f = 0; f < total; f++) {
		await evaluate(`render(${f / FPS})`);
		await shot(join(frames, `f${String(f).padStart(4, '0')}.png`));
		if (f % 30 === 29) process.stdout.write(`\rframes ${f + 1}/${total}`);
	}
	await evaluate(`render(${SECONDS})`);
	await shot(join(work, 'still.png'));
	process.stdout.write('\n');
	ws.close();

	mkdirSync(out, { recursive: true });
	const written = ['og.jpg'];
	execFileSync('ffmpeg', [
		'-hide_banner', '-loglevel', 'error', '-y',
		'-i', join(work, 'still.png'), '-q:v', '2', join(out, 'og.jpg')
	]);
	if (args.video) {
		// H.264 High, yuv420p and faststart: what iOS plays natively, starting before the file has fully arrived.
		execFileSync('ffmpeg', [
			'-hide_banner', '-loglevel', 'error', '-y',
			'-framerate', String(FPS), '-i', join(frames, 'f%04d.png'),
			'-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
			'-crf', '17', '-preset', 'veryslow', '-tune', 'film', '-movflags', '+faststart', '-an',
			join(out, 'og.mp4')
		]);
		written.push('og.mp4');
	}
	if (args.animated) {
		// An image loop has to read as the still from its first frame (an app that shows only
		// frame one then shows the cover, never black): the still holds, then the crossfade to
		// the second car and back, which ends where it started. 15 fps keeps the files small.
		const LOOP_FPS = 15;
		const loop = join(work, 'loop');
		mkdirSync(loop);
		const order = [];
		for (let i = 0; i < 1.4 * LOOP_FPS; i++) order.push(join(work, 'still.png'));
		for (let t = 3.3; t < 5.7; t += 1 / LOOP_FPS) {
			order.push(join(frames, `f${String(Math.round(t * FPS)).padStart(4, '0')}.png`));
		}
		order.forEach((src, i) => copyFileSync(src, join(loop, `l${String(i).padStart(4, '0')}.png`)));
		// GIF: a crossfade changes every pixel, which GIF compresses badly, so it drops to 10 fps and
		// 760px (about 3.4 MB). One shared palette; error-diffusion dither hides banding in the dark gradients.
		execFileSync('ffmpeg', [
			'-hide_banner', '-loglevel', 'error', '-y',
			'-framerate', String(LOOP_FPS), '-i', join(loop, 'l%04d.png'),
			'-vf', 'fps=10,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
			'-loop', '0', join(out, 'og.gif')
		]);
		// Animated WebP: full size, lossy, looping.
		const delay = String(Math.round(1000 / LOOP_FPS));
		execFileSync('img2webp', [
			'-loop', '0', '-lossy', '-q', '80', '-m', '6', '-d', delay,
			...order.map((_, i) => join(loop, `l${String(i).padStart(4, '0')}.png`)),
			'-o', join(out, 'og.webp')
		], { stdio: 'ignore' });
		written.push('og.gif', 'og.webp');
	}

	const kb = (f) => Math.round(statSync(join(out, f)).size / 1024) + ' KB';
	console.log(`Wrote to ${out}: ${written.map((f) => `${f} (${kb(f)})`).join(', ')}.`);
	if (a.name) {
		console.log(`Lead car: ${a.name}. Update og:image:alt in src/routes/+page.svelte to match.`);
	}
	console.log('After deploying, check it with a fresh link (for example ?v=3): iMessage caches previews by URL.');
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
