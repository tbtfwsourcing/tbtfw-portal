<script lang="ts">
	import { portal, go, back, photoCount, sellStep } from '#lib/portal/state.svelte.js';
	import { decodedIsEmpty } from '#lib/vin.js';
	import { SLOT_ORDER, SLOT_NAMES, MIN_PHOTOS } from '#lib/config.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import Step from './Step.svelte';
	import Dock from './Dock.svelte';
	import Submit from './Submit.svelte';
	import PhotoSlots from './PhotoSlots.svelte';

	let error = $state('');
	const count = $derived(photoCount());
	const next = $derived(SLOT_ORDER.find((s) => !portal.photos[s]) ?? null);
	const enough = $derived(count >= MIN_PHOTOS);
	const car = $derived(
		portal.decoded && !decodedIsEmpty(portal.decoded)
			? [portal.decoded.year, portal.decoded.make, portal.decoded.model].filter(Boolean).join(' ')
			: 'Your car'
	);

	function onsubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!enough) {
			error = 'Add at least three photos.';
			return;
		}
		error = '';
		go('sell-you');
	}
</script>

<Step
	eyebrow={car}
	title="Show us the car."
	lede="Three photos to start. Your phone's camera is perfect."
	step={sellStep('sell-photos')}
	onback={() => back('sell-photos')}
	{onsubmit}
	error={enough ? '' : error}
>
	<PhotoSlots {next} />
	{#snippet dock()}
		<Dock>
			{#if enough || !next}
				<Submit>Continue</Submit>
			{:else}
				<!-- A label, so the tap opens the camera or library for the angle the guide is pointing at. -->
				<label for="ph-{next}" class={buttonVariants({ variant: 'house', size: 'cta' })}>
					{count ? 'Add the next photo' : 'Add a photo'}
				</label>
			{/if}
			{#snippet below()}
				<span class="num">{enough ? count + ' photos' : count + ' of ' + MIN_PHOTOS}</span>
				<span aria-hidden="true" class="text-hair-strong">&middot;</span>
				<label for="photos">Choose several from library</label>
			{/snippet}
		</Dock>
	{/snippet}
</Step>

{#if next && !enough}<p class="sr-only" aria-live="polite">Next: {SLOT_NAMES[next]}</p>{/if}
