<script lang="ts">
	import { untrack } from 'svelte';
	import { portal, start } from '#lib/portal/state.svelte.js';
	import type { InventoryItem } from '#lib/api/intake.js';
	import { sized } from '#lib/images.js';
	import { identityLine } from '#lib/format.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

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

	// Only invLoaded is tracked. slide() reads `layers`, and if the effect
	// tracked that too, the first image to load would re-run it: the cleanup
	// would clear the interval and the early return would never restart it.
	$effect(() => {
		if (!portal.invLoaded || started) return;
		started = true;
		return untrack(() => startShow([...portal.inv, ...portal.past]));
	});
</script>

<div class="choice">
	{#each [['sell', 'Sell my car', 'Tell us what you have. A salesperson will respond within the hour.'], ['buy', 'Find my next car', 'Ask about a car in stock, or tell us what to find.']] as [key, title, lede] (key)}
		{@const L = layers[key as Key]}
		<button type="button" class="panel" onclick={() => start(key as Key)}>
			<span class="index eyebrow">{key === 'sell' ? '01' : '02'}</span>
			{#if L.a}<img src={L.a} alt={L.useA ? L.alt : ''} class:ready={L.useA} />{/if}
			{#if L.b}<img src={L.b} alt={!L.useA ? L.alt : ''} class:ready={!L.useA} />{/if}
			<span class="scrim">
				<em class="num">{L.cap}</em>
				<span class="row">
					<strong class="disp">{title}</strong>
					<ArrowRightIcon class="arrow size-4" aria-hidden="true" />
				</span>
				<span class="lede">{lede}</span>
			</span>
		</button>
	{/each}
</div>
<button type="button" class="tradelink" onclick={() => start('trade')}>
	<span>Trading in? <span class="text-mute">Start with the car you want.</span></span>
	<ArrowRightIcon class="size-3.5 text-mute" aria-hidden="true" />
</button>

<style>
	.choice {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--hair);
		/* Header (57) + panels + trade link (~66) fit one phone viewport. */
		height: calc(100dvh - 128px);
		min-height: 480px;
	}
	.panel {
		position: relative;
		display: block;
		flex: 1 1 0;
		min-height: 0;
		width: 100%;
		background: var(--surface);
		border: 0;
		color: var(--fg);
		overflow: hidden;
		cursor: pointer;
		text-align: left;
	}
	.index {
		position: absolute;
		top: 18px;
		left: 20px;
		z-index: 3;
		color: var(--fg);
		opacity: 0.7;
	}
	.panel img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		z-index: 1;
		transition:
			opacity 1400ms ease-out,
			transform 1600ms cubic-bezier(0.2, 0.7, 0.2, 1);
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
		padding: 80px 20px 20px;
		background: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.94) 0%,
			rgba(0, 0, 0, 0.78) 36%,
			rgba(0, 0, 0, 0.35) 70%,
			rgba(0, 0, 0, 0) 100%
		);
	}
	.scrim em {
		display: block;
		font-style: normal;
		color: var(--bone);
		font-size: 10.5px;
		font-weight: 500;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		margin-bottom: 12px;
		min-height: 15px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.scrim strong {
		display: block;
		font-size: 28px;
		font-weight: 500;
		letter-spacing: -0.012em;
		line-height: 1.05;
	}
	.scrim :global(.arrow) {
		flex: none;
		color: var(--fg);
		opacity: 0.6;
		transition:
			transform 400ms cubic-bezier(0.2, 0.7, 0.2, 1),
			opacity 400ms;
	}
	.lede {
		display: block;
		margin-top: 10px;
		color: var(--mute);
		font-size: 14px;
		line-height: 1.5;
		max-width: 34em;
	}
	.panel:focus-visible {
		outline: 1px solid var(--bone);
		outline-offset: -2px;
	}
	.panel:active .scrim strong {
		color: var(--bone);
	}
	@media (hover: hover) {
		.panel:hover img.ready {
			transform: scale(1.03);
		}
		.panel:hover :global(.arrow) {
			transform: translateX(4px);
			opacity: 1;
		}
	}
	.tradelink {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		width: auto;
		margin: 0 20px;
		padding: 20px 0 calc(20px + env(safe-area-inset-bottom));
		background: none;
		border: 0;
		border-top: 1px solid var(--hair);
		color: var(--fg);
		font-size: 14px;
		text-align: left;
		cursor: pointer;
		transition: color 0.2s;
	}
	.tradelink:hover {
		color: var(--bone);
	}
	@media (min-width: 720px) {
		.choice {
			flex-direction: row;
			height: min(calc(100dvh - 136px), 760px);
			min-height: 520px;
		}
		.scrim {
			padding: 140px 32px 32px;
		}
		.scrim strong {
			font-size: 42px;
		}
		.index {
			top: 26px;
			left: 32px;
		}
		.lede {
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
