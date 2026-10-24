<script lang="ts">
	import { portal, go, back, sellStep, sellEyebrow } from '#lib/portal/state.svelte.js';
	import { vinValid, decodedIsEmpty } from '#lib/vin.js';
	import VinField from './VinField.svelte';
	import Step from './Step.svelte';
	import Dock from './Dock.svelte';
	import Submit from './Submit.svelte';

	let error = $state('');
	const found = $derived(!!portal.decoded && !decodedIsEmpty(portal.decoded));

	// A new keystroke in the VIN clears the last submit's complaint.
	$effect(() => {
		void portal.sellForm.vin;
		error = '';
	});

	function next(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!vinValid(portal.sellForm.vin.toUpperCase())) {
			error = 'Enter the full 17 character VIN. It must pass the check.';
			document.getElementById('vin')?.focus();
			return;
		}
		go('sell-numbers');
	}

	function editVin() {
		const el = document.getElementById('vin') as HTMLInputElement | null;
		el?.focus();
		el?.select();
	}
</script>

<Step
	eyebrow={sellEyebrow()}
	title="What are you driving?"
	lede="The VIN is on the driver's door jamb, at the base of the windshield, and on your registration."
	step={sellStep('sell-car')}
	onback={() => back('sell-car')}
	onsubmit={next}
>
	<VinField {error} />
	{#snippet dock()}
		<Dock>
			<Submit>{found ? "That's my car" : 'Continue'}</Submit>
			{#snippet below()}
				{#if found}<button type="button" onclick={editVin}>Not right? Edit the VIN</button>{/if}
			{/snippet}
		</Dock>
	{/snippet}
</Step>
