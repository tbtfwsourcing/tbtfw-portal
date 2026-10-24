<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { portal, back, openSheet, closeSheet, openCar } from '#lib/portal/state.svelte.js';
	import { sized } from '#lib/images.js';
	import { photoOk, probeAll } from '#lib/portal/photos.svelte.js';
	import { money } from '#lib/format.js';
	import FloatField from '#lib/components/FloatField.svelte';
	import TopBar from './TopBar.svelte';
	import Dock from './Dock.svelte';
	import Submit from './Submit.svelte';
	import AskSheet from './AskSheet.svelte';
	import SideMenu from './SideMenu.svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	// Any car at all. The showroom is offered along the way, never as the limit.
	const FEATURED = 12;
	const f = portal.buyForm;

	let error = $state('');
	let askRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let shown = $state<Record<string, true>>({});

	// Normally already running (the page starts it shortly after load); this covers a quick tap.
	$effect(() => {
		if (portal.invLoaded) untrack(() => probeAll(portal.inv));
	});

	// Showroom cars that match what the customer is typing: every word has to appear
	// somewhere in year, make, model or trim, so "porsche gt3" finds the GT3 RS.
	const matches = $derived.by(() => {
		const words = f.wanted_text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
		if (!words.length) return [];
		return portal.inv
			.map((car, i) => ({ car, i, hay: [car.year, car.make, car.model, car.trim].join(' ').toLowerCase() }))
			.filter((m) => words.every((w) => m.hay.includes(w)))
			.slice(0, 3);
	});

	// Cars with a verified photo, in showroom order. The row stops at the first car not
	// checked yet, so cards only ever append and never reshuffle as the check runs.
	const featured = $derived.by(() => {
		const out: { car: (typeof portal.inv)[number]; i: number }[] = [];
		for (const [i, car] of portal.inv.entries()) {
			const ok = photoOk[car.stock_id];
			if (ok === undefined && car.image_url) break;
			if (ok) out.push({ car, i });
			if (out.length >= FEATURED) break;
		}
		return out;
	});

	function find(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!f.wanted_text.trim()) {
			error = "Tell us the car you're after.";
			askRef?.focus();
			return;
		}
		f.stock_id = 'other';
		openSheet('ask');
	}


	// From the side menu's "Something else": back to the field this screen is built around.
	function askAny() {
		closeSheet();
		setTimeout(() => askRef?.focus(), 320);
	}
</script>

<form class="find" onsubmit={find} novalidate>
	<TopBar onback={() => back('buy')} />
	<div class="body rise">
		<p class="eyebrow">Find my next car</p>
		<h1 class="disp q">What's your next car?</h1>
		<p class="lede">Any make, any model, any spec. If it exists, we'll find it.</p>
		<div class="field-wrap">
			<FloatField
				id="find"
				label="The car you want"
				type="text"
				autocomplete="off"
				autocapitalize="words"
				enterkeyhint="go"
				hint={error ? undefined : 'A 992 GT3 RS in Shark Blue. A Pagani. Anything.'}
				error={error}
				bind:value={f.wanted_text}
				bind:ref={askRef}
				oninput={() => (error = '')}
			/>
		</div>

		{#if matches.length}
			<div class="matches" aria-live="polite">
				<p class="eyebrow text-bone">In the showroom now</p>
				{#each matches as { car, i } (car.stock_id)}
					<button type="button" class="match" onclick={() => openCar(i)}>
						<span class="min-w-0">
							<span class="disp-sm block truncate text-[16px]">{car.year} {car.model}{car.trim ? ' ' + car.trim : ''}</span>
							<span class="num mt-1 block text-[12px] text-mute">{money(car.price, 'Price on request')}</span>
						</span>
						<ArrowRightIcon class="size-4 shrink-0 text-mute" aria-hidden="true" />
					</button>
				{/each}
			</div>
		{/if}

		{#if featured.length}
			<section class="featured" aria-labelledby="featured-h">
				<div class="flex items-center justify-between">
					<h2 class="section-head mt-0" id="featured-h">From the showroom</h2>
					<button type="button" class="see" onclick={() => openSheet('menu')}>See them all</button>
				</div>
				<div class="cards">
					{#each featured as { car, i } (car.stock_id)}
						<button type="button" class="card" onclick={() => openCar(i)}>
							<span class="ph">
								<img
									class:ready={shown[car.stock_id]}
									src={sized(car.image_url, 800)}
									alt=""
									decoding="async"
									onload={() => (shown[car.stock_id] = true)}
								/>
							</span>
							<span class="eyebrow mt-3 block">{car.year} &nbsp;{car.make}</span>
							<span class="disp-sm mt-1.5 block truncate text-[15px]">{car.model}</span>
							<span class="num mt-1 block text-[13px] text-bone">{money(car.price, 'Price on request')}</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}
	</div>

	<Dock>
		<Submit>Find it for me</Submit>
		{#snippet below()}<span>A specialist replies within the hour</span>{/snippet}
	</Dock>
</form>

<SideMenu onpick={(i) => openCar(i, true)} onany={askAny} />
<AskSheet open={page.state.sheet === 'ask'} car={null} />

<style>
	.find {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	.body {
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		padding: 40px 24px 8px;
	}
	.q {
		margin-top: 14px;
		font-size: 36px;
		text-wrap: balance;
	}
	.lede {
		margin-top: 14px;
		max-width: 30em;
		font-size: 14px;
		line-height: 1.55;
		color: var(--mute);
	}
	.field-wrap {
		margin-top: 36px;
	}
	/* The ask is the point of the screen, so its field reads a size up. */
	.field-wrap :global(input) {
		font-size: 20px;
	}
	.matches {
		margin: -4px 0 8px;
		animation: show 360ms ease-out both;
	}
	.match {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 60px;
		margin-top: 8px;
		padding: 10px 0;
		border-bottom: 1px solid var(--hair);
		text-align: left;
		color: var(--fg);
		cursor: pointer;
		transition: color 0.2s;
	}
	.match:hover,
	.match:active {
		color: var(--bone);
	}
	.featured {
		margin-top: 40px;
	}
	.see {
		min-height: 44px;
		font-size: 12px;
		color: var(--fg);
		text-decoration: underline;
		text-decoration-color: var(--hair-strong);
		text-underline-offset: 4px;
		cursor: pointer;
	}
	.see:hover {
		text-decoration-color: var(--bone);
	}
	/* Cards run to the screen edge so the row reads as swipeable. */
	.cards {
		display: flex;
		gap: 10px;
		margin: 12px -24px 0;
		padding: 0 24px 4px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: 24px;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}
	.cards::-webkit-scrollbar {
		display: none;
	}
	.card {
		flex: 0 0 62%;
		max-width: 240px;
		scroll-snap-align: start;
		text-align: left;
		color: var(--fg);
		cursor: pointer;
	}
	.ph {
		display: block;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		background: var(--surface);
	}
	.ph img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 62%;
		opacity: 0;
		transition:
			opacity 600ms ease-out,
			transform 900ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.ph img.ready {
		opacity: 1;
	}
	.card {
		animation: show 500ms ease-out both;
	}
	@media (hover: hover) {
		.card:hover .ph img {
			transform: scale(1.04);
		}
	}
	.card:active .ph img {
		transform: scale(0.98);
	}
	@keyframes show {
		from {
			opacity: 0;
		}
	}
	@media (min-width: 600px) and (max-width: 899px) {
		.body {
			padding: 56px 40px 8px;
		}
		.q {
			font-size: 46px;
		}
		.cards {
			margin: 12px -40px 0;
			padding: 0 40px 4px;
			scroll-padding-inline: 40px;
		}
		.card {
			flex-basis: 40%;
		}
	}
	@media (min-width: 900px) {
		.body {
			padding-top: 9vh;
		}
		.q {
			font-size: 52px;
		}
		.lede {
			font-size: 15px;
		}
		.field-wrap {
			margin-top: 48px;
		}
		.field-wrap :global(input) {
			font-size: 24px;
		}
		.card {
			flex-basis: 30%;
		}
	}
	/* Wide but short (a foldable or tablet in landscape): tighter, so the fields clear the pinned button. */
	@media (min-width: 900px) and (max-height: 760px) {
		.body {
			padding-top: 28px;
		}
		.q {
			font-size: 40px;
		}
		.field-wrap {
			margin-top: 28px;
		}
	}
</style>