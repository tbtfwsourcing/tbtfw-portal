<script lang="ts">
	import { portal } from '#lib/portal/state.svelte.js';
	import { cleanVin, vinValid, decodeVin, decodedIsEmpty, type Decoded } from '#lib/vin.js';
	import FloatField from '#lib/components/FloatField.svelte';

	let fe = $state('');
	let status = $state('');
	let words = $state<{ text: string; cls: string }[]>([]);
	let decoded = $state(false);
	let lastDecoded = '';

	function reset() {
		words = [];
		status = '';
		decoded = false;
		portal.decoded = null;
		lastDecoded = '';
	}

	function assemble(d: Decoded) {
		words = (
			[
				[d.year, 'y'],
				[d.make, 'm'],
				[d.model, 'o'],
				[d.trim, 't']
			] as [string, string][]
		)
			.filter((w) => w[0])
			.map(([text, cls]) => ({ text, cls }));
		status = '';
	}

	async function oninput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = cleanVin(el.value);
		if (v !== el.value) el.value = v;
		portal.sellForm.vin = v;
		fe = '';
		portal.vinOk = false;
		if (v.length < 17) {
			if (lastDecoded) reset();
			return;
		}
		if (!vinValid(v)) {
			reset();
			fe = 'That VIN does not check out. Re-type it from the door jamb or the title.';
			return;
		}
		portal.vinOk = true;
		if (v === lastDecoded) return;
		lastDecoded = v;
		decoded = true;
		words = [];
		status = 'Reading the VIN';
		try {
			const d = await decodeVin(v);
			if (portal.sellForm.vin !== v) return;
			portal.decoded = d;
			if (!decodedIsEmpty(d)) assemble(d);
			else status = 'VIN accepted. We will read the build on our side.';
		} catch {
			if (portal.sellForm.vin === v) status = 'VIN accepted. We will read the build on our side.';
		}
	}

	function onblur() {
		const v = portal.sellForm.vin;
		if (v.length && v.length < 17) fe = 'A VIN is 17 characters.';
	}
</script>

<div class="vinwrap" class:decoded>
	<div class="identity" aria-live="polite">
		{#each words as w, i (w.cls)}
			<span class="w {w.cls} in" style:animation-delay="{i * 90}ms">{w.text}</span>
		{/each}
		{#if words.length}<span class="rule in"></span>{/if}
		{#if status}<span class="status">{status}</span>{/if}
	</div>
	<FloatField
		id="vin"
		label="VIN"
		value={portal.sellForm.vin}
		error={fe}
		maxlength={17}
		autocapitalize="characters"
		autocomplete="off"
		spellcheck={false}
		inputmode="text"
		required
		{oninput}
		{onblur}
	/>
</div>

<style>
	.vinwrap {
		margin-top: 4px;
	}
	.identity {
		margin: 8px 0 2px;
	}
	.identity .w {
		display: block;
		font-family: var(--font-disp);
		font-stretch: 118%;
		font-weight: 500;
		font-size: 28px;
		line-height: 1.08;
		letter-spacing: -0.012em;
		opacity: 0;
		transform: translateY(8px);
	}
	.identity .w.in {
		animation: settle 320ms ease-out forwards;
	}
	.identity .w.y {
		font-family: var(--font-sans);
		font-stretch: normal;
		font-weight: 500;
		font-size: 10.5px;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		color: var(--bone);
		margin-bottom: 8px;
	}
	.identity .w.t {
		font-stretch: 108%;
		font-weight: 400;
		font-size: 18px;
		margin-top: 4px;
		color: var(--mute);
	}
	.identity .rule {
		display: block;
		height: 1px;
		background: var(--hair);
		transform: scaleX(0);
		transform-origin: left;
		margin: 12px 0 4px;
	}
	.identity .rule.in {
		animation: draw 420ms ease-out 360ms forwards;
	}
	.identity .status {
		display: block;
		color: var(--mute);
		font-size: 13px;
		min-height: 20px;
	}
	@keyframes settle {
		to {
			opacity: 1;
			transform: none;
		}
	}
	@keyframes draw {
		to {
			transform: scaleX(1);
		}
	}
	/* Once decoded the VIN itself recedes to a quiet reference line under its
	   lifted label; the label keeps the normal lifted offset so they never overlap. */
	.vinwrap.decoded :global(.field input) {
		font-size: 13px;
		color: var(--mute);
		padding-top: 20px;
		padding-bottom: 8px;
		letter-spacing: 0.06em;
	}
	.vinwrap.decoded :global(.field label) {
		color: var(--mute);
	}
	@media (prefers-reduced-motion: reduce) {
		.identity .w,
		.identity .rule {
			opacity: 1;
			transform: none;
		}
	}
</style>
