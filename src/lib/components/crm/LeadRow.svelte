<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { Lead } from '#lib/api/crm.js';
	import { crm as api, DEFAULT_STAGES } from '#lib/api/crm.js';
	import { crm } from '#lib/crm/state.svelte.js';
	import { identityPlain, money, miles, ago } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Chip from './Chip.svelte';
	import LeadChips from './LeadChips.svelte';
	import Thread from './Thread.svelte';
	import Confirm from './Confirm.svelte';

	let { lead }: { lead: Lead } = $props();

	const open = $derived(crm.openId === lead.id);
	const isSell = $derived(lead.kind === 'sell');
	const last = $derived((lead.messages ?? []).at(-1));
	const stages = $derived(crm.data?.stages ?? DEFAULT_STAGES);

	let owner = $state('');
	let notes = $state('');
	let working = $state(false);
	let junkPending = $state(false);

	// Seed the editable fields each time the row opens.
	$effect(() => {
		if (open) {
			owner = lead.assigned_to ?? '';
			notes = lead.notes ?? '';
		}
	});

	async function setStage(st: string) {
		if (st === 'junk') {
			junkPending = true;
			return;
		}
		await applyStage(st);
	}

	// The chip flips at once; the backend round trip (about half a second)
	// confirms it, and a failure puts the old stage back.
	async function applyStage(st: string) {
		const prev = lead.status;
		lead.status = st;
		try {
			const r = await api.setStatus(crm.key, lead.id, st);
			if (r.json?.ok) toast.success('Stage set to ' + st + '.');
			else {
				lead.status = prev;
				toast.error(r.json?.message ?? 'Failed.');
			}
		} catch {
			lead.status = prev;
			toast.error('No response from the backend.');
		}
	}

	// Same idea: apply locally, write notes and owner in parallel, roll back on failure.
	async function save() {
		const prev = { notes: lead.notes, assigned_to: lead.assigned_to };
		lead.notes = notes;
		lead.assigned_to = owner;
		working = true;
		try {
			const [n, o] = await Promise.all([
				api.saveNotes(crm.key, lead.id, notes),
				api.saveOwner(crm.key, lead.id, owner)
			]);
			if (n.json?.ok && o.json?.ok) toast.success('Saved.');
			else {
				Object.assign(lead, prev);
				toast.error(n.json?.message ?? o.json?.message ?? 'Failed.');
			}
		} catch {
			Object.assign(lead, prev);
			toast.error('No response from the backend.');
		} finally {
			working = false;
		}
	}

	const btnSmall =
		'h-auto rounded-none border border-foreground bg-transparent px-3 py-2 text-[10px] font-normal tracking-[.14em] uppercase text-foreground hover:border-bone hover:bg-transparent hover:text-bone';
</script>

{#snippet summary()}
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
		<LeadChips {lead} stage />
		<span class="disp text-sm">{identityPlain(lead)}</span>
		<span class="text-[13px] text-mute">
			{lead.full_name ?? ''} // {lead.ref ?? ''} // {ago(lead.created_at)}{lead.assigned_to ? ' // ' + lead.assigned_to : ''}
		</span>
	</div>
	{#if isSell}
		<div class="num mt-2 text-[12.5px] text-mute">
			{miles(lead.mileage, 'mileage unknown')} // asking {money(lead.asking_price, 'no price')}{lead.comps_n ? ' // median ' + money(lead.comps_median, 'no price') + ' (n=' + lead.comps_n + ')' : ''}{lead.enriched_at ? '' : ' // grading pending'}
		</div>
	{:else}
		<div class="mt-2 text-[12.5px] text-mute">{lead.stock_id ? 'stock ' + lead.stock_id : (lead.wanted_text ?? '')}</div>
	{/if}
{/snippet}

<div id="l-{lead.id}" class="border-b border-hair py-3.5">
	{#if !open}
		<button type="button" class="block w-full cursor-pointer text-left" onclick={() => (crm.openId = lead.id)}>
			{@render summary()}
			{#if lead.flag}
				<div class="mt-2 text-[13px] text-bone"><b class="eyebrow mr-2 text-[10px] text-bone">Flag</b>{lead.flag}</div>
			{/if}
			{#if last}
				<div class="mt-2 text-[12.5px] text-mute">
					Last: {last.direction === 'in' ? 'customer' : 'us'} // {last.channel} // {last.status} // {ago(last.sent_at ?? last.created_at)}
				</div>
			{/if}
		</button>
	{:else}
		{@render summary()}
		<div class="mt-3">
			{#if lead.flag}
				<div class="mt-2 text-[13px] text-bone"><b class="eyebrow mr-2 text-[10px] text-bone">Flag</b>{lead.flag}</div>
			{/if}
			{#if lead.missing_info}
				<div class="mt-1 text-[13px] text-mute"><b class="eyebrow mr-2 text-[10px]">Missing</b>{lead.missing_info}</div>
			{/if}
			<div class="mt-2 text-[12.5px] text-mute">
				<b class="font-medium text-foreground">{lead.full_name ?? ''}</b> // {lead.phone ?? ''} // {lead.email ?? ''}{lead.zip ? ' // ' + lead.zip : ''}{lead.contact_pref ? ' // prefers ' + lead.contact_pref : ''}
			</div>
			{#if isSell}
				<div class="mt-2 text-[12.5px] text-mute">
					VIN {lead.vin ?? ''}{lead.intent ? ' // ' + lead.intent : ''}{lead.condition ? ' // ' + lead.condition : ''}{lead.photo_count ? ' // ' + lead.photo_count + ' photos' : ''}
				</div>
			{/if}
			{#if lead.desirability_why}<div class="mt-1.5 text-[13px]">{lead.desirability_why}</div>{/if}
			{#if lead.verdict_reasoning}<div class="mt-2 text-[12.5px] text-mute">{lead.verdict_reasoning}</div>{/if}
			{#if lead.message}<div class="mt-2 text-[12.5px] text-mute">Their note: {lead.message}</div>{/if}
			<div class="mt-2 text-[12.5px] text-mute">
				Ref {lead.ref ?? ''} // {lead.source ?? ''} // {lead.channel ?? ''} // created {ago(lead.created_at)}
			</div>

			<div class="mt-2.5 flex flex-wrap gap-1.5">
				{#each stages as s (s)}
					{#if s !== 'duplicate' || lead.status === 'duplicate'}
						<Chip variant={(lead.status ?? 'new') === s ? 'solid' : 'dim'} onclick={() => setStage(s)}>{s}</Chip>
					{/if}
				{/each}
			</div>

			<Input
				bind:value={owner}
				placeholder="Owner"
				class="mt-2.5 h-auto rounded-none border-hair bg-background px-3 py-2.5 text-base focus-visible:border-foreground sm:text-sm focus-visible:ring-0"
			/>
			<Textarea
				bind:value={notes}
				placeholder="Notes"
				class="mt-2.5 min-h-[80px] rounded-none border-hair bg-background px-3 py-3 text-base leading-normal focus-visible:border-foreground sm:text-sm focus-visible:ring-0"
			/>
			<div class="mt-3 flex flex-wrap items-center gap-2.5">
				<Button class={btnSmall} disabled={working} onclick={save}>{working ? 'Saving' : 'Save owner + notes'}</Button>
				<Button class={btnSmall} disabled={working} onclick={() => (crm.openId = null)}>Close</Button>
			</div>
			<Thread messages={lead.messages} />
		</div>
	{/if}
</div>

<Confirm
	bind:open={junkPending}
	title="Mark this lead junk?"
	description="It will never be messaged."
	action="Mark junk"
	onconfirm={() => applyStage('junk')}
/>
