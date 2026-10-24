<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { Draft, Lead } from '#lib/api/crm.js';
	import { crm as api } from '#lib/api/crm.js';
	import { crm, leadById, load, openLead } from '#lib/crm/state.svelte.js';
	import { identityPlain, money, miles, ago } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import LeadChips from './LeadChips.svelte';
	import ContactLine from './ContactLine.svelte';
	import Confirm from './Confirm.svelte';

	let { draft }: { draft: Draft } = $props();

	const l = $derived((leadById(draft.lead_id) ?? {}) as Partial<Lead>);
	const isSell = $derived(l.kind === 'sell');
	const ch = $derived(draft.channel);
	const chanOn = $derived(!!crm.data?.channels?.[draft.channel]);
	const chanWord = $derived(ch === 'sms' ? 'text' : 'email');
	const hot = $derived(l.verdict === 'CHASE' || l.verdict === 'WATCH');
	const lastIn = $derived((l.messages ?? []).filter((m) => m.direction === 'in').at(-1));

	// Seeded once: the card is keyed by draft id, so a new draft is a new card.
	// svelte-ignore state_referenced_locally
	let body = $state(draft.body ?? '');
	// svelte-ignore state_referenced_locally
	let subject = $state(draft.subject ?? '');
	type Act = 'send' | 'mark' | 'skip';
	// Which action is in flight, so its button can say so.
	let working = $state<null | Act>(null);
	let pending = $state<null | Act>(null);

	const confirmCopy = {
		send: { title: 'Send this message now?', action: 'Send' },
		mark: {
			title: 'Mark this as sent by hand?',
			description: 'It is recorded as sent, and the lead moves to contacted.',
			action: 'Mark sent'
		},
		skip: {
			title: 'Skip this draft?',
			description: 'Nothing will be sent and it leaves the queue.',
			action: 'Skip'
		}
	} as const;

	async function copy() {
		const txt = (subject ? 'Subject: ' + subject + '\n\n' : '') + body;
		try {
			await navigator.clipboard.writeText(txt);
			toast.success('Copied. Send it from your phone or Outlook, then tap Mark sent by hand.');
		} catch {
			toast('Select the text and copy it.');
		}
	}

	// Called from the confirm dialog. Clear `pending` here, not in the dialog's
	// callback: the {@const act} in that block is derived from `pending`, so
	// reading it after `pending = null` yields null, and run(null) fell through
	// to the skip endpoint whichever button was tapped.
	async function run(act: Act) {
		pending = null;
		working = act;
		try {
			const subj = ch === 'email' ? subject : null;
			const r =
				act === 'send'
					? await api.send(crm.key, draft.id, body, subj)
					: act === 'mark'
						? await api.mark(crm.key, draft.id, body, subj)
						: await api.skip(crm.key, draft.id);
			if (r.json?.ok) {
				toast.success(act === 'send' ? 'Sent.' : act === 'mark' ? 'Marked sent.' : 'Skipped.');
				settle(act, subj);
			} else {
				working = null;
				toast.error(r.json?.message ?? 'Failed (HTTP ' + r.status + ').');
			}
		} catch {
			working = null;
			toast.error('No response from the backend.');
		}
	}

	// Mirror what the backend just did so the queue updates at once: the draft
	// leaves the list, the lead shows the message and moves to contacted. A
	// background reload then replaces this with the server's own copy.
	function settle(act: Act, subj: string | null) {
		const data = crm.data;
		if (!data) return;
		data.drafts = data.drafts.filter((d) => d.id !== draft.id);
		const lead = leadById(draft.lead_id);
		if (lead && act !== 'skip') {
			if ((lead.status ?? 'new') === 'new') lead.status = 'contacted';
			(lead.messages ??= []).push({
				direction: 'out',
				channel: ch,
				purpose: draft.purpose,
				status: 'sent',
				provider: act === 'mark' ? 'manual' : undefined,
				sent_at: new Date().toISOString(),
				subject: subj ?? undefined,
				body
			});
		}
		load();
	}
</script>

{#snippet openLeadButton(cls: string)}
	<button
		type="button"
		class="h-11 shrink-0 cursor-pointer active:text-foreground sm:h-9 items-center gap-1 px-1 text-[10.5px] tracking-[.16em] text-mute uppercase transition-colors hover:text-foreground disabled:opacity-40 {cls}"
		disabled={!!working}
		onclick={() => l.id && openLead(l.id)}
	>
		Open lead <ArrowUpRightIcon class="size-3.5" />
	</button>
{/snippet}

<Card.Root class="mb-3 block gap-0 p-4 sm:mb-4 sm:p-5 {hot ? 'border-l-2 border-l-bone' : ''}">
	<!-- Header: the car, then the live numbers under it. Open lead sits top-right from sm:,
	     and beside the chips on a phone so the car name keeps the full width. -->
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<div class="disp text-[18px] sm:text-[20px]">{identityPlain(l)}</div>
			<div class="num dots mt-1.5 text-[12.5px] text-mute">
				{#if isSell}
					<span>{miles(l.mileage, 'mileage unknown')}</span><span>asking {money(l.asking_price, 'no price')}</span>
				{:else if l.stock_id}
					<span>stock {l.stock_id}</span>
				{:else if l.wanted_text}
					<span>{l.wanted_text}</span>
				{/if}
			</div>
		</div>
		{@render openLeadButton('-mr-1 -mt-1 hidden sm:inline-flex')}
	</div>

	<div class="mt-3 flex items-start justify-between gap-3">
		<div class="flex flex-wrap gap-1.5">
			<LeadChips lead={l} purpose={draft.purpose} />
		</div>
		{@render openLeadButton('-mr-1 -mt-1.5 inline-flex sm:hidden')}
	</div>

	{#if isSell}
		<div class="num dots mt-4 text-[12.5px] text-mute">
			{#if l.comps_n}
				<span>US sold median <b class="font-medium text-foreground">{money(l.comps_median, 'no price')}</b> (n={l.comps_n})</span>
			{:else}
				<span>No sold comps on file</span>
			{/if}
			{#if l.photo_count}<span>{l.photo_count} photos</span>{/if}
		</div>
		{#if l.desirability_why}<div class="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed">{l.desirability_why}</div>{/if}
	{/if}
	{#if l.flag}
		<div class="mt-3 text-[13px] leading-relaxed text-bone"><b class="eyebrow mr-2.5 text-[10px] text-bone">Flag</b>{l.flag}</div>
	{/if}
	{#if l.missing_info}
		<div class="mt-1.5 text-[13px] leading-relaxed text-mute"><b class="eyebrow mr-2.5 text-[10px]">Missing</b>{l.missing_info}</div>
	{/if}

	<ContactLine lead={l} class="mt-4 border-t border-hair pt-4" />
	{#if l.message}<div class="mt-2 text-[12.5px] leading-relaxed text-mute">Their note: {l.message}</div>{/if}
	{#if draft.purpose === 'reply' && lastIn}
		<div class="mt-4 text-[13.5px] leading-relaxed">
			<div class="eyebrow dots mb-1.5 text-[10px] text-bone"><span>Customer</span><span>{ago(lastIn.sent_at ?? lastIn.created_at)}</span></div>
			<div class="border-l border-bone pl-3 whitespace-pre-wrap">{lastIn.body ?? ''}</div>
		</div>
	{/if}
	<div class="dots mt-3 text-[12.5px] text-mute">
		<span class="num">Ref {l.ref ?? ''}</span>{#if l.source}<span>{l.source}</span>{/if}<span>{ago(l.created_at)}</span><span>draft for <b class="font-medium text-foreground">{chanWord}</b> to {draft.to_address ?? ''}</span>
	</div>

	{#if ch === 'email'}
		<Input bind:value={subject} placeholder="Subject" class="mt-4" />
	{/if}
	<Textarea bind:value={body} class="mt-2.5 min-h-[150px]" />

	<!-- Phone: 2-col grid, primary full width, secondaries in the cells, hint last and full width.
	     From sm: the inline flex-wrap row. -->
	<div class="mt-3.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
		{#if chanOn}
			<Button
				variant="house"
				size="house"
				class="col-span-2 w-full sm:col-span-1 sm:w-auto"
				disabled={!!working}
				onclick={() => (pending = 'send')}
			>
				{working === 'send' ? 'Sending' : 'Send ' + chanWord}
			</Button>
		{:else}
			<Button variant="house" size="house" class="col-span-2 w-full sm:col-span-1 sm:w-auto" disabled={!!working} onclick={copy}>
				Copy {chanWord}
			</Button>
			<Button variant="hairline" size="house" class="w-full sm:w-auto" disabled={!!working} onclick={() => (pending = 'mark')}>
				{working === 'mark' ? 'Marking' : 'Mark sent by hand'}
			</Button>
		{/if}
		<Button variant="hairline" size="house" class="w-full sm:w-auto" disabled={!!working} onclick={() => (pending = 'skip')}>
			{working === 'skip' ? 'Skipping' : 'Skip'}
		</Button>
		{#if !chanOn}
			<span class="col-span-2 text-xs leading-relaxed text-mute sm:ml-1">
				{ch === 'sms'
					? 'Text sending is off until the number is approved. Copy, send from your phone, then mark it.'
					: 'Email is off until the mailbox is connected. Copy, send from Outlook, then mark it.'}
			</span>
		{/if}
	</div>
</Card.Root>

{#if pending}
	{@const c = confirmCopy[pending]}
	{@const act = pending}
	<Confirm
		open={true}
		title={c.title}
		description={'description' in c ? c.description : undefined}
		action={c.action}
		onconfirm={() => run(act)}
	/>
{/if}
