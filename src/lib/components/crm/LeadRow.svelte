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

</script>

{#snippet summary()}
	<div class="disp-sm text-[16px]">{identityPlain(lead)}</div>
	<div class="dots mt-1.5 text-[12.5px] text-mute">
		<span class="text-foreground">{lead.full_name ?? ''}</span><span class="num">{lead.ref ?? ''}</span><span>{ago(lead.created_at)}</span>{#if lead.assigned_to}<span>{lead.assigned_to}</span>{/if}
	</div>
	<div class="mt-2.5 flex flex-wrap gap-1.5">
		<LeadChips {lead} stage />
	</div>
	{#if isSell}
		<div class="num dots mt-3 text-[12.5px] text-mute">
			<span>{miles(lead.mileage, 'mileage unknown')}</span><span>asking {money(lead.asking_price, 'no price')}</span>{#if lead.comps_n}<span>median {money(lead.comps_median, 'no price')} (n={lead.comps_n})</span>{/if}{#if !lead.enriched_at}<span>grading pending</span>{/if}
		</div>
	{:else}
		<div class="mt-3 text-[12.5px] text-mute">{lead.stock_id ? 'stock ' + lead.stock_id : (lead.wanted_text ?? '')}</div>
	{/if}
{/snippet}

<div id="l-{lead.id}" class="border-b border-hair">
	{#if !open}
		<button
			type="button"
			class="-mx-3 block w-[calc(100%+24px)] cursor-pointer px-3 py-4 text-left transition-colors hover:bg-surface sm:py-5"
			onclick={() => (crm.openId = lead.id)}
		>
			{@render summary()}
			{#if lead.flag}
				<div class="mt-2.5 text-[13px] leading-relaxed text-bone"><b class="eyebrow mr-2.5 text-[10px] text-bone">Flag</b>{lead.flag}</div>
			{/if}
			{#if last}
				<div class="dots mt-2.5 text-[12.5px] text-mute">
					<span>Last: {last.direction === 'in' ? 'customer' : 'us'}</span><span>{last.channel}</span><span>{last.status}</span><span>{ago(last.sent_at ?? last.created_at)}</span>
				</div>
			{/if}
		</button>
	{:else}
		<div class="py-4 sm:py-5">
			{@render summary()}
			<div class="mt-4">
				{#if lead.flag}
					<div class="mt-2 text-[13px] leading-relaxed text-bone"><b class="eyebrow mr-2.5 text-[10px] text-bone">Flag</b>{lead.flag}</div>
				{/if}
				{#if lead.missing_info}
					<div class="mt-1.5 text-[13px] leading-relaxed text-mute"><b class="eyebrow mr-2.5 text-[10px]">Missing</b>{lead.missing_info}</div>
				{/if}
				<div class="dots mt-3 text-[12.5px] text-mute">
					<span class="font-medium text-foreground">{lead.full_name ?? ''}</span>{#if lead.phone}<span class="num whitespace-nowrap">{lead.phone}</span>{/if}{#if lead.email}<span>{lead.email}</span>{/if}{#if lead.zip}<span class="num">{lead.zip}</span>{/if}{#if lead.contact_pref}<span>prefers {lead.contact_pref}</span>{/if}
				</div>
				{#if isSell}
					<div class="dots mt-2 text-[12.5px] text-mute">
						<span class="num break-all">VIN {lead.vin ?? ''}</span>{#if lead.intent}<span>{lead.intent}</span>{/if}{#if lead.condition}<span>{lead.condition}</span>{/if}{#if lead.photo_count}<span>{lead.photo_count} photos</span>{/if}
					</div>
				{/if}
				{#if lead.desirability_why}<div class="mt-2.5 max-w-[64ch] text-[13.5px] leading-relaxed">{lead.desirability_why}</div>{/if}
				{#if lead.verdict_reasoning}<div class="mt-2 max-w-[64ch] text-[12.5px] leading-relaxed text-mute">{lead.verdict_reasoning}</div>{/if}
				{#if lead.message}<div class="mt-2 text-[12.5px] leading-relaxed text-mute">Their note: {lead.message}</div>{/if}
				<div class="dots mt-2 text-[12.5px] text-mute">
					<span class="num">Ref {lead.ref ?? ''}</span>{#if lead.source}<span>{lead.source}</span>{/if}{#if lead.channel}<span>{lead.channel}</span>{/if}<span>created {ago(lead.created_at)}</span>
				</div>

				<div class="eyebrow mt-5 mb-2 text-[10px]">Stage</div>
				<div class="flex flex-wrap gap-1.5">
					{#each stages as s (s)}
						{#if s !== 'duplicate' || lead.status === 'duplicate'}
							<Chip variant={(lead.status ?? 'new') === s ? 'solid' : 'dim'} onclick={() => setStage(s)}>{s}</Chip>
						{/if}
					{/each}
				</div>

				<Input bind:value={owner} placeholder="Owner" class="mt-4" />
				<Textarea bind:value={notes} placeholder="Notes" class="mt-2.5 min-h-[80px]" />
				<div class="mt-3.5 flex flex-wrap items-center gap-2.5">
					<Button variant="hairline" size="house-sm" disabled={working} onclick={save}>{working ? 'Saving' : 'Save owner + notes'}</Button>
					<Button variant="quiet" size="house-sm" disabled={working} onclick={() => (crm.openId = null)}>Close</Button>
				</div>
				<Thread messages={lead.messages} />
			</div>
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
