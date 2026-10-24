<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { portal, readSource, SCREEN_ORDER, type Screen } from '#lib/portal/state.svelte.js';
	import { getInventory } from '#lib/api/intake.js';
	import { INTAKE_API, IMAGE_CDN } from '#lib/config.js';
	import { loadTurnstile } from '#lib/portal/turnstile.js';
	import { probeAll } from '#lib/portal/photos.svelte.js';
	import { SITE } from '#lib/config.js';
	import ProgressLine from '#lib/components/ProgressLine.svelte';
	import ChoiceScreen from '#lib/components/portal/ChoiceScreen.svelte';
	import BuyScreen from '#lib/components/portal/BuyScreen.svelte';
	import ShowroomScreen from '#lib/components/portal/ShowroomScreen.svelte';
	import SellCar from '#lib/components/portal/SellCar.svelte';
	import SellNumbers from '#lib/components/portal/SellNumbers.svelte';
	import SellPhotos from '#lib/components/portal/SellPhotos.svelte';
	import SellYou from '#lib/components/portal/SellYou.svelte';
	import DetailsScreen from '#lib/components/portal/DetailsScreen.svelte';
	import DoneScreen from '#lib/components/portal/DoneScreen.svelte';

	const TITLE = SITE.name + ' // Buy, sell or trade';
	const DESC = 'Sell your car to TBTFW, or tell us your next one and we will find it. Beverly Hills.';
	// The share card. iMessage plays the MP4 in the bubble (muted, six seconds, ending on
	// the still); every other app shows the still, which is also the video's cover.
	// Both come from the same animation, so the last frame and the still match.
	const OG_IMAGE = SITE.portal + 'og.jpg';
	const OG_VIDEO = SITE.portal + 'og.mp4';

	const ld = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'AutoDealer',
		name: SITE.name,
		url: SITE.home,
		address: { '@type': 'PostalAddress', addressLocality: 'Beverly Hills', addressRegion: 'CA' },
		potentialAction: { '@type': 'Action', name: 'Sell my car', target: SITE.portal }
	});

	// Runs from the prerendered head, before the app's JS has downloaded, so the
	// inventory round trip overlaps the script load instead of following it.
	// getInventory() in api/intake.ts picks the promise up on mount.
	const earlyInventory =
		'window.__inv=fetch(' +
		JSON.stringify(INTAKE_API + '/inventory') +
		').then(function(r){return r.json()}).catch(function(){return null})';

	let screen = $state<Screen>('choice');
	let dir = $state<'fwd' | 'bwd' | ''>('');
	let prev: Screen = 'choice';

	// Screen follows the shallow-routing state so Back/Forward walk the flow.
	// Leaving the confirmation lands on "choice": a sent form cannot be re-entered.
	// The one exception is the confirmation's own link into the showroom.
	$effect(() => {
		let next: Screen = page.state.screen ?? 'choice';
		if (prev === 'done' && next !== 'done' && !page.state.restart) {
			next = 'choice';
			untrack(() => goto(location.href, { state: { screen: 'choice' }, shallow: true, replace: true }));
		}
		if (next !== prev) {
			dir = SCREEN_ORDER.indexOf(next) < SCREEN_ORDER.indexOf(prev) ? 'bwd' : 'fwd';
			window.scrollTo(0, 0);
		}
		prev = next;
		screen = next;
	});

	onMount(() => {
		readSource();
		goto(location.href, { state: { screen: 'choice' }, shallow: true, replace: true });
		getInventory()
			.then((d) => {
				portal.inv = d.items;
				portal.past = d.past;
				// Know which cars have real photos before anyone opens the showroom.
				setTimeout(() => probeAll(d.items), 1500);
			})
			.catch(() => {
				portal.inv = [];
			})
			.finally(() => {
				portal.invLoaded = true;
			});
		loadTurnstile();
	});

	const labels: Record<Screen, string> = {
		choice: 'Choose',
		buy: 'Find my next car',
		showroom: 'Showroom',
		'sell-car': 'Sell, your car',
		'sell-numbers': 'Sell, mileage and price',
		'sell-photos': 'Sell, photos',
		'sell-you': 'Sell, your details',
		'sell-more': 'Sell, tell us more',
		done: 'Sent'
	};
</script>

<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESC} />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={SITE.portal} />
	<link rel="preconnect" href={IMAGE_CDN} />
	<link rel="preconnect" href="https://challenges.cloudflare.com" />
	{@html '<script>' + earlyInventory + '<' + '/script>'}
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE.name} />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESC} />
	<meta property="og:url" content={SITE.portal} />
	<meta property="og:image" content={OG_IMAGE} />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="A black and orange Bugatti Chiron Super Sport 300+ in the TBTFW showroom. The extraordinary, bought and sold." />
	<meta property="og:video" content={OG_VIDEO} />
	<meta property="og:video:secure_url" content={OG_VIDEO} />
	<meta property="og:video:type" content="video/mp4" />
	<meta property="og:video:width" content="1200" />
	<meta property="og:video:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={DESC} />
	<meta name="twitter:image" content={OG_IMAGE} />
	{@html '<script type="application/ld+json">' + ld + '<' + '/script>'}
</svelte:head>

<ProgressLine />

<main class="relative">
	{#key screen}
		<section class="screen {dir}" aria-label={labels[screen]}>
			{#if screen === 'choice'}
				<ChoiceScreen />
			{:else if screen === 'buy'}
				<BuyScreen />
			{:else if screen === 'showroom'}
				<ShowroomScreen />
			{:else if screen === 'sell-car'}
				<SellCar />
			{:else if screen === 'sell-numbers'}
				<SellNumbers />
			{:else if screen === 'sell-photos'}
				<SellPhotos />
			{:else if screen === 'sell-you'}
				<SellYou />
			{:else if screen === 'sell-more'}
				<DetailsScreen />
			{:else}
				<DoneScreen />
			{/if}
		</section>
	{/key}
</main>

<style>
	/* Screens arrive as a quiet cascade: the blocks inside a .rise container lift
	   a few pixels and settle in sequence, rather than the page sliding sideways. */
	@keyframes rise {
		from {
			transform: translateY(10px);
			opacity: 0;
		}
	}
	.screen.fwd :global(.rise > *),
	.screen.bwd :global(.rise > *) {
		animation: rise 620ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.screen :global(.rise > :nth-child(2)) {
		animation-delay: 60ms;
	}
	.screen :global(.rise > :nth-child(3)) {
		animation-delay: 120ms;
	}
	.screen :global(.rise > :nth-child(4)) {
		animation-delay: 180ms;
	}
	.screen :global(.rise > :nth-child(n + 5)) {
		animation-delay: 240ms;
	}
</style>
