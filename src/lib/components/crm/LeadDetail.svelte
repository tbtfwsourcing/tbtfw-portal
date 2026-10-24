<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { Lead } from '#lib/api/crm.js';
	import { crm as api, DEFAULT_STAGES } from '#lib/api/crm.js';
	import { crm } from '#lib/crm/state.svelte.js';
	import { carName, money, miles, ago, formatPhone, dialable } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import PhoneIcon from '@lucide/svelte/icons/phone';
	import MessageIcon from '@lucide/svelte/icons/message-square';
	import MailIcon from '@lucide/svelte/icons/mail';
	import XIcon from '@lucide/svelte/icons/x';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import StageMark from './StageMark.svelte';
	import Thread from './Thread.svelte';
	import Confirm from './Confirm.svelte';

	// Everything you can change on a lead, then what we know about it. Keyed by
	// lead id where it is used, so the owner and notes fields seed once per lead
	// and a background refresh never overwrites what is being typed.
	let { lead, sheet = false }: { lead: Lead; sheet?: boolean } = $props();

	const isSell = $derived(lead.kind === 'sell');
	const status = $derived(lead.status ?? 'new');
	const stages = $derived((crm.data?.stages ?? DEFAULT_STAGES).filter((s) => s !== 'junk' && s !== 'duplicate'));
	const drafts = $derived((crm.data?.drafts ?? []).filter((d) => d.lead_id === lead.id).length);

	// svelte-ignore state_referenced_locally
	let owner = $state(lead.assigned_to ?? '');
	// svelte-ignore state_referenced_locally
	let notes = $state(lead.notes ?? '');
	const dirty = $derived(owner !== (lead.assigned_to ?? '') || notes !== (lead.notes ?? ''));
	let working = $state(false);
	let junkPending = $state(false);

	async function setStage(st: string) {
		if (st === status) return;
		if (st === 'junk') {
			junkPending = true;
			return;
		}
		await applyStage(st);
	}

	// The stage flips at once; the backend round trip (about half a second)
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

	function discard() {
		owner = lead.assigned_to ?? '';
		notes = lead.notes ?? '';
	}

	// The facts, in the order they get asked for. Empty ones are left out.
	const facts = $derived(
		[
			['Phone', lead.phone ? formatPhone(lead.phone) || lead.phone : ''],
			['Email', lead.email ?? ''],
			['Prefers', lead.contact_pref ?? ''],
			['Timeline', lead.timeline ?? ''],
			...(isSell
				? [
						['Asking', money(lead.asking_price)],
						['US sold median', lead.comps_n ? money(lead.comps_median) + '  n=' + lead.comps_n : ''],
						['Mileage', miles(lead.mileage)],
						['Photos', lead.photo_count ? String(lead.photo_count) : ''],
						['Intent', lead.intent ?? ''],
						['Condition', lead.condition ?? ''],
						['VIN', lead.vin ?? '']
					]
				: [['Stock', lead.stock_id ?? '']]),
			['ZIP', lead.zip ?? ''],
			['Source', lead.source ?? ''],
			['Created', ago(lead.created_at)]
		].filter(([, v]) => v) as [string, string][]
	);
	const mono = new Set(['Phone', 'VIN', 'ZIP', 'Stock', 'US sold median', 'Asking', 'Mileage']);
</script>

<div class="px-5 pt-[calc(20px+env(safe-area-inset-top))] pb-[calc(40px+env(safe-area-inset-bottom))] sm:px-6 lg:pt-6">
	<!-- Who and what. -->
	<header class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="mlabel dots">
				<span>{isSell ? 'Sell' : 'Buy'}</span>{#if lead.classification}<span>{lead.classification}</span>{/if}{#if lead.verdict}<span class={lead.verdict === 'CHASE' || lead.verdict === 'WATCH' ? 'text-bone' : ''}>{lead.verdict}</span>{/if}{#if lead.desirability_tier}<span class="text-bone">{lead.desirability_tier}</span>{/if}<span>{lead.ref ?? ''}</span>
			</div>
			<h2 class="disp mt-3 text-[24px] sm:text-[26px]">{carName(lead)}</h2>
			<p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
				<span>{lead.full_name ?? ''}</span><StageMark {status} />
			</p>
		</div>
		{#if sheet}
			<button
				type="button"
				class="-mt-2 -mr-3 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-mute hover:text-foreground active:text-foreground"
				aria-label="Close"
				onclick={() => (crm.openId = null)}
			>
				<XIcon class="size-4" />
			</button>
		{/if}
	</header>

	<!-- Reach them: the dialer, Messages, Mail, each prefilled with the lead. -->
	{#if lead.phone || lead.email}
		<div class="mt-5 grid grid-cols-3 gap-2">
			<Button variant="hairline" size="house-sm" class="gap-2" href={lead.phone ? 'tel:' + dialable(lead.phone) : undefined} disabled={!lead.phone}>
				<PhoneIcon class="size-3.5" />Call
			</Button>
			<Button variant="hairline" size="house-sm" class="gap-2" href={lead.phone ? 'sms:' + dialable(lead.phone) : undefined} disabled={!lead.phone}>
				<MessageIcon class="size-3.5" />Text
			</Button>
			<Button variant="hairline" size="house-sm" class="gap-2" href={lead.email ? 'mailto:' + lead.email : undefined} disabled={!lead.email}>
				<MailIcon class="size-3.5" />Email
			</Button>
		</div>
	{/if}
	{#if drafts}
		<button
			type="button"
			class="mt-2 flex w-full cursor-pointer items-center justify-between border border-bone/40 px-3.5 py-3 text-left text-[13px] text-bone transition-colors hover:border-bone"
			onclick={() => {
				crm.tab = 'queue';
				crm.openId = null;
			}}
		>
			{drafts === 1 ? 'A draft is' : drafts + ' drafts are'} waiting for your approval <ArrowRightIcon class="size-3.5" />
		</button>
	{/if}

	{#if lead.flag || lead.missing_info || lead.message}
		<dl class="mt-6 grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13.5px] leading-relaxed">
			{#if lead.flag}<dt class="mlabel pt-[3px] text-bone">Flag</dt><dd class="text-bone">{lead.flag}</dd>{/if}
			{#if lead.missing_info}<dt class="mlabel pt-[3px]">Missing</dt><dd class="text-mute">{lead.missing_info}</dd>{/if}
			{#if lead.message}<dt class="mlabel pt-[3px]">Note</dt><dd class="text-mute">“{lead.message}”</dd>{/if}
		</dl>
	{/if}

	<!-- Stage. Junk sits apart: it means the lead is never messaged. -->
	<section class="mt-8">
		<div class="mb-2.5 flex items-baseline justify-between gap-3">
			<p class="mlabel">Stage</p>
			{#if status === 'junk'}
				<span class="mlabel text-bone">Junk · never messaged</span>
			{:else if status === 'duplicate'}
				<span class="mlabel">Duplicate</span>
			{:else}
				<button type="button" class="mlabel cursor-pointer transition-colors hover:text-foreground" onclick={() => setStage('junk')}>Mark junk</button>
			{/if}
		</div>
		<div class="grid grid-cols-3 gap-px border border-hair bg-hair sm:grid-cols-6" role="group" aria-label="Stage">
			{#each stages as s (s)}
				{@const on = status === s}
				<button
					type="button"
					class="mlabel h-11 cursor-pointer transition-colors {on
						? 'bg-foreground text-background'
						: 'bg-surface hover:bg-surface-2 hover:text-foreground active:text-bone'}"
					aria-pressed={on}
					onclick={() => setStage(s)}>{s}</button
				>
			{/each}
		</div>
	</section>

	<!-- Owner and notes, saved together. -->
	<section class="mt-7 grid gap-3">
		<label class="grid gap-2">
			<span class="mlabel">Owner</span>
			<Input bind:value={owner} placeholder="Unassigned" class="bg-background" />
		</label>
		<label class="grid gap-2">
			<span class="mlabel">Notes</span>
			<Textarea bind:value={notes} placeholder="Anything worth remembering" class="min-h-[96px] bg-background" />
		</label>
		{#if dirty || working}
			<div class="flex items-center gap-2">
				<Button variant="house" size="house-sm" disabled={working} onclick={save}>{working ? 'Saving' : 'Save'}</Button>
				<Button variant="quiet" size="house-sm" disabled={working} onclick={discard}>Discard</Button>
			</div>
		{/if}
	</section>

	<!-- What we know. -->
	<section class="mt-9">
		<p class="mlabel mb-2.5">Details</p>
		<dl class="divide-y divide-hair border-y border-hair">
			{#each facts as [k, v] (k)}
				<div class="grid grid-cols-[112px_minmax(0,1fr)] gap-4 py-2.5">
					<dt class="mlabel pt-[3px]">{k}</dt>
					<dd class="text-[13.5px] break-words {mono.has(k) ? 'mono' : ''}">{v}</dd>
				</div>
			{/each}
		</dl>
		{#if lead.desirability_why}<p class="mt-4 text-[13.5px] leading-relaxed">{lead.desirability_why}</p>{/if}
		{#if lead.verdict_reasoning}<p class="mt-2 text-[13px] leading-relaxed text-mute">{lead.verdict_reasoning}</p>{/if}
		{#if isSell && !lead.enriched_at}<p class="mlabel mt-3">Grading pending</p>{/if}
	</section>

	<section class="mt-9">
		<p class="mlabel mb-3">Conversation{#if lead.messages?.length}<span class="ml-2 text-foreground">{lead.messages.length}</span>{/if}</p>
		<Thread messages={lead.messages} />
	</section>
</div>

<Confirm
	bind:open={junkPending}
	title="Mark this lead junk?"
	description="It will never be messaged."
	action="Mark junk"
	onconfirm={() => applyStage('junk')}
/>
