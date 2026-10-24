<script lang="ts">
	import { portal } from '#lib/portal/state.svelte.js';
	import { cleanVin, vinValid, decodeVin, decodedIsEmpty } from '#lib/vin.js';
	import FloatField from '#lib/components/FloatField.svelte';

	interface Props {
		// A message from the step's own submit check ("Enter the full VIN").
		error?: string;
	}
	let { error = '' }: Props = $props();

	let fe = $state('');
	let status = $state('');
	let reading = $state(false);
	let lastDecoded = '';

	const d = $derived(portal.decoded && !decodedIsEmpty(portal.decoded) ? portal.decoded : null);

	function reset() {
		status = '';
		reading = false;
		portal.decoded = null;
		lastDecoded = '';
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
		portal.decoded = null;
		reading = true;
		status = '';
		try {
			const r = await decodeVin(v);
			if (portal.sellForm.vin !== v) return;
			portal.decoded = r;
			if (decodedIsEmpty(r)) status = 'VIN accepted. We will read the build on our side.';
		} catch {
			if (portal.sellForm.vin === v) status = 'VIN accepted. We will read the build on our side.';
		} finally {
			if (portal.sellForm.vin === v) reading = false;
		}
	}

	function onblur() {
		const v = portal.sellForm.vin;
		if (v.length && v.length < 17) fe = 'A VIN is 17 characters.';
	}
</script>

<FloatField
	id="vin"
	label="VIN"
	class="vin"
	value={portal.sellForm.vin}
	error={fe || error}
	maxlength={17}
	autocapitalize="characters"
	autocomplete="off"
	autocorrect="off"
	spellcheck={false}
	inputmode="text"
	enterkeyhint="done"
	required
	{oninput}
	{onblur}
/>

<div class="found" aria-live="polite">
	{#if d}
		<!-- The moment the VIN reads back as the customer's own car. -->
		<div class="card">
			<p class="eyebrow ok"><span class="tick" aria-hidden="true">&#10003;</span>Found it</p>
			<p class="disp car"><span class="num">{d.year}</span> {d.make} {d.model}</p>
			{#if d.trim}<p class="trim">{d.trim}</p>{/if}
		</div>
	{:else if reading}
		<p class="status">Reading the VIN</p>
	{:else if status}
		<p class="status">{status}</p>
	{/if}
</div>

<style>
	:global(.vin input) {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.08em;
	}
	.found {
		min-height: 24px;
	}
	.card {
		border: 1px solid var(--hair-strong);
		padding: 20px 18px 22px;
		animation: in 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.ok {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--bone);
	}
	.tick {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border: 1px solid var(--bone);
		border-radius: 999px;
		font-size: 10px;
		letter-spacing: 0;
	}
	.car {
		margin-top: 16px;
		font-size: 26px;
		text-wrap: balance;
		animation: in 620ms cubic-bezier(0.2, 0.7, 0.2, 1) 120ms both;
	}
	.trim {
		margin-top: 8px;
		font-size: 14px;
		color: var(--mute);
		animation: in 620ms cubic-bezier(0.2, 0.7, 0.2, 1) 220ms both;
	}
	.status {
		font-size: 13px;
		color: var(--mute);
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
</style>
