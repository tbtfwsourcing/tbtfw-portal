<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { portal, readSource, SCREEN_ORDER, type Screen } from '#lib/portal/state.svelte.js';
	import { getInventory } from '#lib/api/intake.js';
	import { INTAKE_API, IMAGE_CDN } from '#lib/config.js';
	import { loadTurnstile } from '#lib/portal/turnstile.js';
	import { SITE } from '#lib/config.js';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import ProgressLine from '#lib/components/ProgressLine.svelte';
	import Footer from '#lib/components/Footer.svelte';
	import ChoiceScreen from '#lib/components/portal/ChoiceScreen.svelte';
	import BuyScreen from '#lib/components/portal/BuyScreen.svelte';
	import SellScreen from '#lib/components/portal/SellScreen.svelte';
	import DetailsScreen from '#lib/components/portal/DetailsScreen.svelte';
	import DoneScreen from '#lib/components/portal/DoneScreen.svelte';

	const TITLE = SITE.name + ' // Portal';
	const DESC = 'Sell your car to TBTFW or ask about a car in stock. Beverly Hills.';
	const OG_IMAGE = SITE.portal + 'og.png';

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
	// Leaving the confirmation always lands on "choice": a sent form cannot be re-entered.
	$effect(() => {
		let next: Screen = page.state.screen ?? 'choice';
		if (prev === 'done' && next !== 'done') {
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
		buy: 'Buy',
		sell1: 'Sell, your car',
		sell2: 'Sell, tell us more',
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
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={DESC} />
	<meta name="twitter:image" content={OG_IMAGE} />
	{@html '<script type="application/ld+json">' + ld + '<' + '/script>'}
</svelte:head>

<ProgressLine />
<header class="border-b border-hair pt-[env(safe-area-inset-top)]">
	<div class="mx-auto flex h-14 max-w-[560px] items-center justify-center px-5">
		<Wordmark />
	</div>
</header>

<main class="relative mx-auto max-w-[560px] pb-8">
	{#key screen}
		<section class="screen {dir}" class:bleed={screen === 'choice'} aria-label={labels[screen]}>
			{#if screen === 'choice'}
				<ChoiceScreen />
			{:else if screen === 'buy'}
				<BuyScreen />
			{:else if screen === 'sell1'}
				<SellScreen />
			{:else if screen === 'sell2'}
				<DetailsScreen />
			{:else}
				<DoneScreen />
			{/if}
		</section>
	{/key}
</main>

<Footer />

<style>
	.screen {
		padding: 0 20px;
	}
	/* The choice screen's two panels run edge to edge. */
	.screen.bleed {
		padding: 0;
		width: 100vw;
		max-width: 100vw;
		margin-left: calc(50% - 50vw);
	}
	/* Each screen arrives as a quiet cascade: blocks rise a few pixels and
	   settle in sequence, rather than the whole page sliding sideways. */
	@keyframes rise {
		from {
			transform: translateY(10px);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}
	.screen.fwd > :global(*),
	.screen.bwd > :global(*) {
		animation: rise 560ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.screen > :global(:nth-child(2)) {
		animation-delay: 50ms;
	}
	.screen > :global(:nth-child(3)) {
		animation-delay: 100ms;
	}
	.screen > :global(:nth-child(4)) {
		animation-delay: 150ms;
	}
	.screen > :global(:nth-child(n + 5)) {
		animation-delay: 200ms;
	}
</style>
