<script lang="ts">
	import { untrack } from 'svelte';
	import { portal, start } from '#lib/portal/state.svelte.js';
	import type { InventoryItem } from '#lib/api/intake.js';
	import { sized } from '#lib/images.js';
	import { FULL, record } from '#lib/portal/photos.svelte.js';
	import { SITE } from '#lib/config.js';
	import TopBar from './TopBar.svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	const HEADLINE = 'The extraordinary, bought and sold.';
	const words = HEADLINE.split(' ');
	const SHOW_EVERY = 8000;
	const year = new Date().getFullYear();

	// Two stacked images, crossfaded: the incoming one loads hidden, then takes over.
	let a = $state('');
	let b = $state('');
	let useA = $state(false);
	let started = false;

	// The first car leads (inventory is sorted by price, so it is the flagship);
	// the rest of current and past inventory follow in a shuffled order.
	function order(items: InventoryItem[]): InventoryItem[] {
		const pool = items.filter((i) => i?.image_url);
		const rest = pool.slice(1);
		for (let i = rest.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[rest[i], rest[j]] = [rest[j], rest[i]];
		}
		return pool.length ? [pool[0], ...rest] : [];
	}

	function startShow(items: InventoryItem[]) {
		const pool = order(items);
		if (!pool.length) return;
		let n = 0;
		let tries = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// Loads the next car; "Coming soon" cards are skipped, never shown.
		const next = () => {
			if (stopped || tries > pool.length) return;
			const item = pool[n++ % pool.length];
			tries++;
			const pre = new Image();
			pre.onload = () => {
				if (stopped) return;
				if (!record(item.stock_id, pre)) return next();
				tries = 0;
				const incomingA = !useA;
				if (incomingA) a = pre.src;
				else b = pre.src;
				useA = incomingA;
				if (!reduced && pool.length > 1) timer = setTimeout(next, SHOW_EVERY);
			};
			pre.onerror = () => next();
			pre.src = sized(item.image_url, FULL);
		};
		next();

		const vis = () => {
			if (document.hidden) clearTimeout(timer);
			else if (!reduced) timer = setTimeout(next, SHOW_EVERY);
		};
		document.addEventListener('visibilitychange', vis);
		return () => {
			stopped = true;
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', vis);
		};
	}

	// Only invLoaded is tracked: startShow writes a/b/useA, and tracking those
	// would re-run the effect and restart the show on every image.
	$effect(() => {
		if (!portal.invLoaded || started) return;
		started = true;
		return untrack(() => startShow([...portal.inv, ...portal.past]));
	});
</script>

<div class="home">
	<div class="hero" aria-hidden="true">
		{#if a}<img src={a} alt="" class:on={useA} />{/if}
		{#if b}<img src={b} alt="" class:on={!useA} />{/if}
		<div class="scrim"></div>
	</div>

	<TopBar overlay />

	<div class="content">
		<h1 class="disp headline" aria-label={HEADLINE}>
			{#each words as w, i (i)}<span class="mask" aria-hidden="true"><span class="w" style:--i={i}>{w}</span></span>{' '}{/each}
		</h1>
		<p class="lede">Beverly Hills. A specialist replies within the hour.</p>

		<nav class="choices" aria-label="What would you like to do">
			<button type="button" class="choice" onclick={() => start('buy')}>
				<span>
					<span class="disp-sm t">Find my next car</span>
					<span class="s">Any car. Ours, or one we find for you.</span>
				</span>
				<ArrowRightIcon class="arrow size-[18px]" aria-hidden="true" />
			</button>
			<button type="button" class="choice" onclick={() => start('sell')}>
				<span>
					<span class="disp-sm t">Sell or trade mine</span>
					<span class="s">Four quick steps</span>
				</span>
				<ArrowRightIcon class="arrow size-[18px]" aria-hidden="true" />
			</button>
		</nav>

		<footer class="fine">
			<a href={SITE.home}>tbtfw.com</a>
			<a href={SITE.privacy} target="_blank" rel="noopener">Privacy</a>
			<span class="num">&copy; {year} {SITE.name}</span>
		</footer>
	</div>
</div>

<style>
	.home {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		overflow: hidden;
	}
	.hero {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 66dvh;
		min-height: 380px;
		overflow: hidden;
		background: var(--surface);
	}
	.hero img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 46% 64%;
		opacity: 0;
		transition: opacity 1600ms ease-out;
	}
	/* The incoming photo fades up while it settles from a slight push-in. */
	.hero img.on {
		opacity: 1;
		z-index: 1;
		animation: settle 9000ms cubic-bezier(0.2, 0.6, 0.2, 1) both;
	}
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 2;
		background: linear-gradient(
			to bottom,
			rgba(5, 5, 5, 0.86) 0%,
			rgba(5, 5, 5, 0.22) 26%,
			rgba(5, 5, 5, 0.1) 48%,
			rgba(5, 5, 5, 0.82) 82%,
			var(--bg) 100%
		);
	}
	.content {
		position: relative;
		z-index: 3;
		margin-top: auto;
		padding: 0 24px calc(8px + env(safe-area-inset-bottom));
	}
	.headline {
		font-size: 36px;
		text-wrap: balance;
	}
	/* Each word rises from behind its own mask, a few beats apart. The resting
	   state is the final one, so with motion off the headline simply shows. */
	.mask {
		display: inline-block;
		overflow: hidden;
		vertical-align: top;
		padding-bottom: 0.08em;
		margin-bottom: -0.08em;
	}
	.w {
		display: inline-block;
		animation: up 1000ms cubic-bezier(0.2, 0.75, 0.15, 1) calc(250ms + var(--i) * 90ms) both;
	}
	.lede {
		margin-top: 14px;
		font-size: 13px;
		line-height: 1.55;
		color: var(--mute);
		animation: show 900ms ease-out 850ms both;
	}
	.choices {
		margin-top: 44px;
		animation: show 900ms ease-out 1000ms both;
	}
	.choice {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 0;
		border-top: 1px solid var(--hair-strong);
		text-align: left;
		color: var(--fg);
		cursor: pointer;
	}
	.choice:last-child {
		border-bottom: 1px solid var(--hair-strong);
	}
	.choice .t {
		display: block;
		font-size: 20px;
		transition: color 0.3s;
	}
	.choice .s {
		display: block;
		margin-top: 6px;
		font-size: 12px;
		color: var(--mute);
	}
	.choice :global(.arrow) {
		flex: none;
		opacity: 0.7;
		transition:
			transform 400ms cubic-bezier(0.2, 0.7, 0.2, 1),
			opacity 0.3s;
	}
	.choice:active .t {
		color: var(--bone);
	}
	.choice:focus-visible {
		outline-offset: 2px;
	}
	@media (hover: hover) {
		.choice:hover .t {
			color: var(--bone);
		}
		.choice:hover :global(.arrow) {
			transform: translateX(5px);
			opacity: 1;
		}
	}
	.fine {
		display: flex;
		gap: 22px;
		padding: 18px 0 8px;
		font-size: 11px;
		letter-spacing: 0.06em;
		color: var(--mute);
		animation: show 900ms ease-out 1150ms both;
	}
	.fine a {
		color: var(--mute);
		text-decoration: none;
		transition: color 0.2s;
	}
	.fine a:hover {
		color: var(--fg);
	}
	@keyframes up {
		from {
			transform: translateY(108%);
		}
	}
	@keyframes show {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@keyframes settle {
		from {
			transform: scale(1.07);
		}
	}
	@media (min-width: 900px) {
		.hero {
			height: 100dvh;
		}
		.hero img {
			object-position: 50% 62%;
		}
		.scrim {
			background:
				linear-gradient(to bottom, rgba(5, 5, 5, 0.75) 0%, rgba(5, 5, 5, 0) 22%),
				linear-gradient(to top, var(--bg) 0%, rgba(5, 5, 5, 0.9) 24%, rgba(5, 5, 5, 0.25) 56%, rgba(5, 5, 5, 0) 75%);
		}
		.content {
			width: 100%;
			max-width: 1200px;
			margin-left: auto;
			margin-right: auto;
			padding: 0 48px 16px;
		}
		.headline {
			font-size: clamp(56px, 6vw, 84px);
			max-width: 11em;
		}
		.lede {
			font-size: 15px;
		}
		.choices {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: 48px;
			margin-top: 56px;
		}
		.choice,
		.choice:last-child {
			border-bottom: 1px solid var(--hair-strong);
			padding: 24px 0;
		}
		.choice .t {
			font-size: 24px;
		}
		.choice .s {
			font-size: 13px;
		}
		.fine {
			padding-top: 28px;
		}
	}
</style>
