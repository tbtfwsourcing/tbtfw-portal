<script lang="ts">
	import { portal, go, back, sellStep, sellEyebrow } from '#lib/portal/state.svelte.js';
	import { decodedIsEmpty } from '#lib/vin.js';
	import { digits, groupDigits } from '#lib/format.js';
	import FloatField from '#lib/components/FloatField.svelte';
	import Step from './Step.svelte';
	import Dock from './Dock.svelte';
	import Submit from './Submit.svelte';

	const f = portal.sellForm;
	let fe = $state<Record<string, string>>({});
	let mileageRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let askRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	// The car the VIN named, carried as this step's eyebrow.
	const car = $derived(
		portal.decoded && !decodedIsEmpty(portal.decoded)
			? [portal.decoded.year, portal.decoded.make, portal.decoded.model].filter(Boolean).join(' ')
			: ''
	);

	function next(e: SubmitEvent) {
		e.preventDefault();
		fe = {};
		if (!digits(f.mileage)) {
			fe.mileage = 'Enter the mileage.';
			mileageRef?.focus();
			return;
		}
		if (!digits(f.asking_price)) {
			fe.asking = 'Enter what you are hoping to get.';
			askRef?.focus();
			return;
		}
		go('sell-photos');
	}
</script>

<Step
	eyebrow={car || sellEyebrow()}
	title="Miles, and your number."
	lede="Your number is a starting point, not a commitment."
	step={sellStep('sell-numbers')}
	onback={() => back('sell-numbers')}
	onsubmit={next}
>
	<FloatField
		id="mileage"
		label="Mileage"
		type="text"
		inputmode="numeric"
		required
		bind:value={f.mileage}
		bind:ref={mileageRef}
		error={fe.mileage}
		oninput={() => (fe.mileage = '')}
		onblur={() => (f.mileage = groupDigits(f.mileage))}
	/>
	<FloatField
		money
		id="asking_price"
		label="What are you hoping to get?"
		type="text"
		inputmode="numeric"
		enterkeyhint="done"
		required
		bind:value={f.asking_price}
		bind:ref={askRef}
		error={fe.asking}
		oninput={() => (fe.asking = '')}
		onblur={() => (f.asking_price = groupDigits(f.asking_price))}
	/>
	{#snippet dock()}
		<Dock>
			<Submit>Continue</Submit>
		</Dock>
	{/snippet}
</Step>
