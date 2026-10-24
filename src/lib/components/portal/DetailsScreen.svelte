<script lang="ts">
	import { portal, back, finish, railFor } from '#lib/portal/state.svelte.js';
	import { busy, setBusy } from '#lib/busy.svelte.js';
	import { saveDetails, completeLead, putUpload } from '#lib/api/intake.js';
	import { digits, groupDigits, identityLine, miles } from '#lib/format.js';
	import { MAX_RECORDS } from '#lib/config.js';
	import Rail from '#lib/components/Rail.svelte';
	import FloatField from '#lib/components/FloatField.svelte';
	import ChipGroup from '#lib/components/ChipGroup.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import Submit from './Submit.svelte';

	const f = portal.detailsForm;
	const rail = $derived(railFor('sell2'));
	const spec = $derived(
		portal.sell ? identityLine(portal.sell.identity) + ' // ' + miles(portal.sell.mileage) : ''
	);
	const recordsLabel = $derived(
		portal.records.length
			? portal.records.length + (portal.records.length === 1 ? ' file' : ' files')
			: 'Up to ' + MAX_RECORDS + ', PDF or photo'
	);

	function onRecords(e: Event) {
		const inp = e.currentTarget as HTMLInputElement;
		portal.records = Array.from(inp.files ?? []).slice(0, MAX_RECORDS);
	}

	function sellDone() {
		if (!portal.sell) return;
		const front = portal.photos.front34 ?? portal.photos[Object.keys(portal.photos)[0]];
		finish(portal.sell.ref, front ? front.url : null, spec, '');
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy.on || !portal.sell) return;
		const body: Record<string, unknown> = {
			intent: f.intent,
			title_status: f.title_status,
			payoff_estimate: digits(f.payoff_estimate),
			lienholder: f.lienholder.trim(),
			original_owner: f.original_owner,
			owned_since: digits(f.owned_since),
			has_records: f.has_records,
			mods_text: f.mods_text.trim(),
			condition: f.condition,
			zip: digits(f.zip),
			timeline: f.timeline,
			contact_pref: f.contact_pref,
			best_time: f.best_time.trim()
		};
		if (portal.records.length) {
			body.records = portal.records.map((r) => ({ type: r.type || 'application/pdf' }));
		}
		setBusy(true);
		// Details are optional: whatever happens, the customer lands on the confirmation.
		try {
			const r = await saveDetails(portal.sell.id, body);
			const urls = r?.upload_urls ?? [];
			if (urls.length) {
				await Promise.all(
					urls.map((u, i) => {
						const file = portal.records[i];
						return file ? putUpload(u.url, file, u.content_type || file.type) : Promise.resolve();
					})
				);
				await completeLead(portal.sell.id, {});
			}
		} catch {
			/* fall through */
		}
		setBusy(false);
		sellDone();
	}
</script>

<Rail label={rail.label} step={rail.step} onback={() => back('sell2')} />
<p class="num mb-4 text-sm text-mute">{spec}</p>
<form onsubmit={submit} novalidate>
	<h1 class="disp mt-2 mb-1 text-[22px] leading-tight md:text-[26px]">Tell us more</h1>
	<p class="mb-6 text-[15px] text-mute">Optional. Saves a phone call.</p>

	<ChipGroup name="intent" label="Intent" options={['Sell outright', 'Consign', 'Trade']} bind:value={f.intent} />
	<ChipGroup name="title_status" label="Title" options={['Clean', 'Lien', 'Salvage or rebuilt']} bind:value={f.title_status} />
	{#if f.title_status === 'Lien'}
		<FloatField money id="payoff_estimate" label="Payoff estimate" type="text" inputmode="numeric" bind:value={f.payoff_estimate} onblur={() => (f.payoff_estimate = groupDigits(f.payoff_estimate))} />
		<FloatField id="lienholder" label="Lienholder" type="text" bind:value={f.lienholder} />
	{/if}
	<Toggle id="original_owner" bind:checked={f.original_owner}>I am the original owner</Toggle>
	<FloatField id="owned_since" label="Owned since (year)" type="text" inputmode="numeric" maxlength={4} bind:value={f.owned_since} />
	<Toggle id="has_records" bind:checked={f.has_records}>I have service records</Toggle>
	{#if f.has_records}
		<div class="addrow">
			<label for="records">Add records</label>
			<input type="file" id="records" multiple accept="image/*,application/pdf" onchange={onRecords} />
			<span class="num text-[13px] text-mute">{recordsLabel}</span>
		</div>
	{/if}
	<FloatField textarea id="mods_text" label="Modifications" rows={2} hint="Novitec exhaust, PPF, Anrky wheels" bind:value={f.mods_text} />
	<ChipGroup name="condition" label="Condition" options={['Concours', 'Excellent', 'Driver', 'Needs work']} bind:value={f.condition} />
	<FloatField id="sell-zip" label="ZIP" type="text" inputmode="numeric" maxlength={5} autocomplete="postal-code" bind:value={f.zip} />
	<ChipGroup name="sell-timeline" label="Timeline" options={['This week', '30 days', 'Just curious']} bind:value={f.timeline} />
	<ChipGroup name="sell-contact_pref" label="Reach me by" options={['Text', 'Call', 'Email']} bind:value={f.contact_pref} />
	<FloatField id="sell-best_time" label="Best time" type="text" bind:value={f.best_time} />

	<Submit disabled={busy.on}>Save details</Submit>
	<Submit secondary type="button" disabled={busy.on} onclick={sellDone}>Skip</Submit>
</form>

<style>
	.addrow {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
		margin-bottom: 6px;
	}
	.addrow input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.addrow label {
		font-size: 14px;
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
		padding: 10px 0;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.addrow label:active {
		color: var(--bone);
	}
	.addrow:has(input:focus-visible) label {
		outline: 1px solid var(--bone);
		outline-offset: 4px;
	}
</style>
