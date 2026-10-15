<script lang="ts">
	import { portal, start } from '#lib/portal/state.svelte.js';
	import type { InventoryItem } from '#lib/api/intake.js';
	import { sized } from '#lib/images.js';
	import { identityLine } from '#lib/format.js';

	const SHOW_EVERY = 12000;
	type Key = 'sell' | 'buy';

	interface Layer {
		a: string;
		b: string;
		useA: boolean;
		alt: string;
		cap: string;
		current: InventoryItem | null;
	}
	const blank = (): Layer => ({ a: '', b: '', useA: false, alt: '', cap: '', current: null });
	let layers = $state<Record<Key, Layer>>({ sell: blank(), buy: blank() });

	const pools: Record<Key, InventoryItem[]> = { sell: [], buy: [] };
	const idx: Record<Key, number> = { sell: 0, buy: 0 };
	let timer: ReturnType<typeof setInterval> | null = null;
	let tick = 0;
	let started = false;

	function shuffle<T>(a: T[]): T[] {
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// Slow crossfade through current and past inventory. The first two cars
	// lead each panel; the rest are shuffled so returning visitors see variety.
	function slide(k: Key) {
		const pool = pools[k];
		if (!pool.length) return;
		const other: Key = k === 'sell' ? 'buy' : 'sell';
		let item = pool[idx[k] % pool.length];
		idx[k]++;
		if (pool.length > 1 && layers[other].current?.stock_id === item.stock_id) {
			item = pool[idx[k] % pool.length];
			idx[k]++;
		}
		const w = window.innerWidth > 720 ? 1920 : 1280;
		let src = sized(item.image_url, w);
		const pre = new Image();
		pre.onload = () => {
			const L = layers[k];
			const incomingA = !L.useA;
			if (incomingA) L.a = src;
			else L.b = src;
			L.useA = incomingA;
			L.alt = [item.year, item.make, item.model].filter(Boolean).join(' ');
			L.cap = identityLine(item);
			L.current = item;
		};
		pre.onerror = () => {
			if (src !== item.image_url && item.image_url) {
				src = item.image_url;
				pre.src = src;
			}
		};
		pre.src = src;
	}

	function startShow(items: InventoryItem[]) {
		const pool = items.filter((i) => i && i.image_url);
		if (!pool.length) return;
		const hero = pool.slice(0, 2);
		const rest = pool.slice(2);
		pools.sell = [hero[0], ...shuffle(rest.slice())];
		pools.buy = [hero[1] ?? hero[0], ...shuffle(rest.slice())];
		slide('sell');
		slide('buy');
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced || pool.length < 2) return;
		const run = () => {
			tick++;
			slide(tick % 2 ? 'sell' : 'buy');
		};
		const on = () => {
			if (!timer) timer = setInterval(run, SHOW_EVERY / 2);
		};
		const off = () => {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		};
		on();
		const vis = () => (document.hidden ? off() : on());
		document.addEventListener('visibilitychange', vis);
		return () => {
			off();
			document.removeEventListener('visibilitychange', vis);
		};
	}

	$effect(() => {
		if (!portal.invLoaded || started) return;
		started = true;
		return startShow([...portal.inv, ...portal.past]);
	});
</script>

<div class="choice">
	{#each [['sell', 'Sell my car', 'Tell us what you have. A salesperson will respond within the hour.'], ['buy', 'Find my next car', 'Ask about a car in stock, or tell us what to find.']] as [key, title, lede] (key)}
		{@const L = layers[key as Key]}
		<button type="button" class="panel" onclick={() => start(key as Key)}>
			{#if L.a}<img src={L.a} alt={L.useA ? L.alt : ''} class:ready={L.useA} />{/if}
			{#if L.b}<img src={L.b} alt={!L.useA ? L.alt : ''} class:ready={!L.useA} />{/if}
			<span class="scrim">
				<em class="num">{L.cap}</em>
				<strong class="disp">{title}</strong>
				<span>{lede}</span>
			</span>
		</button>
	{/each}
</div>
<button type="button" class="tradelink" onclick={() => start('trade')}>
	Trading in? <span class="text-mute">Start with the car you want.</span>
</button>

<style>
	.choice {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--hair);
		height: calc(100dvh - 120px);
		min-height: 520px;
	}
	.panel {
		position: relative;
		display: block;
		flex: 1 1 0;
		min-height: 0;
		width: 100%;
		background: var(--bg);
		border: 0;
		color: var(--fg);
		overflow: hidden;
		cursor: pointer;
		text-align: left;
	}
	.panel img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		z-index: 1;
		transition: opacity 1200ms ease-out;
	}
	.panel img.ready {
		opacity: 1;
		z-index: 2;
	}
	.scrim {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 3;
		background: var(--bg);
		padding: 16px 20px 18px;
	}
	.scrim em {
		display: block;
		font-style: normal;
		color: var(--mute);
		font-size: 12px;
		letter-spacing: 0.02em;
		margin-bottom: 6px;
		min-height: 17px;
	}
	.scrim strong {
		display: block;
		font-size: 20px;
		letter-spacing: 0.04em;
		margin-bottom: 4px;
	}
	.scrim > span {
		display: block;
		color: var(--mute);
		font-size: 14px;
		max-width: 36em;
	}
	.panel:focus-visible {
		outline: 1px solid var(--bone);
		outline-offset: -2px;
	}
	.panel:active .scrim strong {
		color: var(--bone);
	}
	.tradelink {
		display: block;
		width: auto;
		margin: 0 20px;
		padding: 20px 0;
		background: none;
		border: 0;
		border-top: 1px solid var(--hair);
		color: var(--fg);
		font-size: 15px;
		text-align: left;
		cursor: pointer;
	}
	@media (min-width: 720px) {
		.choice {
			flex-direction: row;
			height: min(calc(100dvh - 136px), 720px);
			min-height: 480px;
		}
		.scrim {
			padding: 22px 28px 26px;
		}
		.scrim strong {
			font-size: 26px;
		}
		.scrim > span {
			font-size: 15px;
		}
		.tradelink {
			max-width: 560px;
			margin: 0 auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.panel img {
			opacity: 1;
		}
	}
</style>
