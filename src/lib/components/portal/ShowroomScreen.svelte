<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { portal, back, openSheet, closeSheet } from '#lib/portal/state.svelte.js';
	import { sized } from '#lib/images.js';
	import { FULL, photoOk, record, probeAll } from '#lib/portal/photos.svelte.js';
	import { money, miles } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import TopBar from './TopBar.svelte';
	import Dock from './Dock.svelte';
	import AskSheet from './AskSheet.svelte';
	import SideMenu from './SideMenu.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	// One car per screen. The last slide is for any car we don't have: we go and find it.
	const cars = $derived(portal.inv);
	const total = $derived(cars.length + 1);
	let active = $state(portal.showIndex);
	const current = $derived(active < cars.length ? cars[active] : null);

	let track = $state<HTMLDivElement | null>(null);
	// Slides load their photo once they come within two of the one showing, and keep it.
	let near = $state<Record<number, true>>({});
	// Photos that have loaded and passed the "Coming soon" check; only these are shown.
	let shown = $state<Record<string, true>>({});

	$effect(() => {
		if (portal.invLoaded) untrack(() => probeAll(portal.inv));
	});

	$effect(() => {
		for (let i = Math.max(0, active - 1); i <= active + 2; i++) near[i] = true;
	});


	function onscroll() {
		if (!track) return;
		const i = Math.round(track.scrollLeft / track.clientWidth);
		if (i !== active) {
			active = i;
			portal.showIndex = i;
		}
	}

	function goTo(i: number, smooth = true) {
		if (!track) return;
		const n = Math.max(0, Math.min(total - 1, i));
		near[n] = true;
		track.scrollTo({ left: n * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
	}

	function photoLoaded(e: Event, stock: string) {
		if (record(stock, e.currentTarget as HTMLImageElement)) shown[stock] = true;
	}

	// The 1920 rendition exists for nearly every car; fall back to whatever the feed gave us.
	function photoFailed(e: Event, full: string | null | undefined) {
		const img = e.currentTarget as HTMLImageElement;
		if (full && img.src !== full) img.src = full;
	}

	function ask() {
		portal.buyForm.stock_id = current ? current.stock_id : 'other';
		openSheet('ask');
	}

	function pick(i: number) {
		closeSheet();
		tick().then(() => goTo(i, false));
	}

	// The side menu's "Something else": the last slide, where any car can be asked for.
	function askAny() {
		pick(cars.length);
	}

	onMount(() => {
		// Coming back from a sheet or a later screen lands on the same car.
		if (active) requestAnimationFrame(() => goTo(active, false));
		const key = (e: KeyboardEvent) => {
			if (page.state.sheet || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key === 'ArrowRight') goTo(active + 1);
			else if (e.key === 'ArrowLeft') goTo(active - 1);
		};
		window.addEventListener('keydown', key);
		return () => window.removeEventListener('keydown', key);
	});
</script>

<div class="showroom">
	<TopBar overlay onback={() => back('showroom')} />

	<div
		class="track"
		bind:this={track}
		{onscroll}
		role="region"
		aria-roledescription="carousel"
		aria-label="Showroom"
		aria-busy={!portal.invLoaded}
	>
		{#if !portal.invLoaded}
			<div class="slide" aria-hidden="true">
				<div class="photo"><div class="fade"></div></div>
				<div class="info">
					<span class="sk" style:width="40%"></span>
					<span class="sk big" style:width="70%"></span>
					<span class="sk" style:width="30%"></span>
				</div>
			</div>
		{/if}

		{#each cars as car, i (car.stock_id)}
			{@const plate = !car.image_url || photoOk[car.stock_id] === false}
			<article class="slide" class:active={i === active} aria-roledescription="slide" aria-label="{i + 1} of {total}">
				<div class="photo" class:plate>
					{#if plate}
						<!-- No photograph yet: the car's name stands in, set large, rather than a stock card. -->
						<span class="plate-name disp" aria-hidden="true">{car.model}</span>
					{:else if near[i]}
						<img
							class:ready={shown[car.stock_id]}
							src={sized(car.image_url, FULL)}
							alt={[car.year, car.make, car.model, car.trim].filter(Boolean).join(' ')}
							decoding="async"
							onload={(e) => photoLoaded(e, car.stock_id)}
							onerror={(e) => photoFailed(e, car.image_url)}
						/>
					{/if}
					<div class="fade"></div>
				</div>
				<div class="info">
					<p class="eyebrow dots"><span class="num">{car.year}</span><span>{car.make}</span></p>
					<h2 class="disp name">{car.model}</h2>
					{#if car.trim}<p class="disp-sm trim">{car.trim}</p>{/if}
					<p class="meta dots num">
						{#if car.mileage != null}<span>{miles(car.mileage)}</span>{/if}
						{#if car.color}<span>{car.color}</span>{/if}
						{#if plate}<span>Photographs on request</span>{/if}
					</p>
					<p class="price num">{money(car.price, 'Price on request')}</p>
				</div>
			</article>
		{/each}

		{#if portal.invLoaded}
			<article class="slide" class:active={active === cars.length} aria-roledescription="slide" aria-label="{total} of {total}">
				<div class="photo plate">
					<span class="plate-name disp" aria-hidden="true">Any car</span>
					<div class="fade"></div>
				</div>
				<div class="info">
					<p class="eyebrow">Something else in mind?</p>
					<h2 class="disp name">Any car. We'll find it.</h2>
					<p class="meta">Tell us the car, the spec and the colour.</p>
				</div>
			</article>
		{/if}
	</div>

	<Dock pinned>
		<div class="actions">
			<div class="arrows">
				<button type="button" class="nav" onclick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous car">
					<ArrowLeftIcon class="size-4" aria-hidden="true" />
				</button>
				<button type="button" class="nav" onclick={() => goTo(active + 1)} disabled={active >= total - 1} aria-label="Next car">
					<ArrowRightIcon class="size-4" aria-hidden="true" />
				</button>
			</div>
			<Button variant="house" size="cta" onclick={ask} disabled={!portal.invLoaded}>
				{current || !portal.invLoaded ? 'Ask about this car' : 'Tell us what you want'}
			</Button>
		</div>
		{#snippet below()}
			<span class="hint">Swipe for the next car</span>
		{/snippet}
	</Dock>
</div>

<SideMenu {active} onpick={pick} onany={askAny} />
<AskSheet open={page.state.sheet === 'ask'} car={current} />

<style>
	.showroom {
		position: relative;
		height: 100dvh;
		min-height: 560px;
		overflow: hidden;
	}
	.track {
		display: flex;
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}
	.track::-webkit-scrollbar {
		display: none;
	}
	.slide {
		position: relative;
		flex: 0 0 100%;
		height: 100%;
		scroll-snap-align: start;
		scroll-snap-stop: always;
	}
	.photo {
		position: relative;
		height: calc(100dvh - 330px);
		min-height: 260px;
		overflow: hidden;
		background: var(--surface);
	}
	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 64%;
		opacity: 0;
		transform: scale(1.04);
		transition:
			opacity 800ms ease-out,
			transform 1400ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.photo img.ready {
		opacity: 1;
	}
	.slide.active .photo img {
		transform: none;
	}
	.fade {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			rgba(5, 5, 5, 0.86) 0%,
			rgba(5, 5, 5, 0.2) 26%,
			rgba(5, 5, 5, 0.12) 54%,
			rgba(5, 5, 5, 0.85) 88%,
			var(--bg) 100%
		);
	}
	.photo.plate {
		display: grid;
		place-items: center;
		background: var(--bg);
	}
	.plate-name {
		padding: 0 24px;
		font-size: 64px;
		line-height: 0.95;
		text-align: center;
		color: transparent;
		-webkit-text-stroke: 1px var(--hair-strong);
		text-wrap: balance;
	}
	.info {
		position: relative;
		z-index: 2;
		margin-top: -36px;
		padding: 0 24px;
	}
	.name {
		margin-top: 10px;
		font-size: 34px;
		text-wrap: balance;
	}
	.trim {
		margin-top: 6px;
		font-size: 16px;
		color: var(--fg);
		opacity: 0.8;
	}
	.meta {
		margin-top: 12px;
		max-width: 32em;
		font-size: 13px;
		line-height: 1.5;
		color: var(--mute);
	}
	.price {
		margin-top: 16px;
		font-size: 20px;
		letter-spacing: 0.01em;
		color: var(--bone);
	}
	/* The text of the car arriving settles in as its slide snaps into place. */
	.slide .info > :global(*) {
		transition:
			opacity 500ms ease-out,
			transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.slide:not(.active) .info > :global(*) {
		opacity: 0;
		transform: translateX(24px);
	}
	.sk {
		display: block;
		height: 12px;
		margin-top: 14px;
		background: var(--muted);
	}
	.sk.big {
		height: 32px;
	}
	.actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.arrows {
		display: none;
		gap: 8px;
	}
	.nav {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border: 1px solid var(--hair-strong);
		color: var(--fg);
		cursor: pointer;
		transition: border-color 0.2s;
	}
	.nav:hover {
		border-color: var(--fg);
	}
	.nav:disabled {
		opacity: 0.3;
		cursor: default;
	}
	@media (min-width: 900px) {
		.photo {
			height: calc(100dvh - 250px);
		}
		.info {
			max-width: 1200px;
			margin: -120px auto 0;
			padding: 0 48px;
		}
		.name {
			font-size: 64px;
		}
		.trim {
			font-size: 20px;
		}
		.price {
			font-size: 22px;
		}
		.plate-name {
			font-size: 150px;
		}
		.arrows {
			display: flex;
		}
		.actions {
			justify-content: space-between;
		}
		.actions :global([data-slot='button']) {
			width: 360px;
		}
		.showroom :global(.dock .inner) {
			max-width: 1200px;
			padding: 0 28px;
		}
		.hint {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.slide:not(.active) .info > :global(*) {
			opacity: 1;
			transform: none;
		}
	}
</style>
