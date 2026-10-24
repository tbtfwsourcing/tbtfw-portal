<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { Draft, Lead } from '#lib/api/crm.js';
	import { crm as api } from '#lib/api/crm.js';
	import { crm, leadById, load, openLead } from '#lib/crm/state.svelte.js';
	import { identityPlain, money, miles, ago } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
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

	// 44px tall on phones (Apple's minimum target), their natural height from sm:.
	const btn =
		'h-auto min-h-11 rounded-none border border-foreground bg-transparent px-4 py-3 text-[11px] font-normal tracking-[.14em] uppercase text-foreground hover:border-bone hover:bg-transparent hover:text-bone active:border-bone active:text-bone sm:min-h-0';
	const btnPrimary =
		'h-auto min-h-11 rounded-none border border-foreground bg-foreground px-4 py-3 text-[11px] font-normal tracking-[.14em] uppercase text-background hover:border-bone hover:bg-bone hover:text-background active:border-bone active:bg-bone sm:min-h-0';
	const btnSmall = 'px-3 py-2 text-[10px]';
</script>

<article class="mb-3 border bg-surface p-4 {hot ? 'border-foreground' : 'border-hair'}">
	<div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
		<LeadChips lead={l} purpose={draft.purpose} />
		<span class="disp text-sm">{identityPlain(l)}</span>
		<span class="num text-[13px] text-mute">
			{#if isSell}
				{miles(l.mileage, 'mileage unknown')} // asking {money(l.asking_price, 'no price')}
			{:else if l.stock_id}
				stock {l.stock_id}
			{:else}
				{l.wanted_text ?? ''}
			{/if}
		</span>
	</div>

	{#if isSell}
		<div class="num mt-2 text-[12.5px] text-mute">
			{#if l.comps_n}
				US sold median <b class="font-medium text-foreground">{money(l.comps_median, 'no price')}</b> (n={l.comps_n})
			{:else}
				No sold comps on file
			{/if}
			{#if l.photo_count} // {l.photo_count} photos{/if}
		</div>
		{#if l.desirability_why}<div class="mt-1.5 text-[13px]">{l.desirability_why}</div>{/if}
	{/if}
	{#if l.flag}
		<div class="mt-2 text-[13px] text-bone"><b class="eyebrow mr-2 text-[10px] text-bone">Flag</b>{l.flag}</div>
	{/if}
	{#if l.missing_info}
		<div class="mt-1 text-[13px] text-mute"><b class="eyebrow mr-2 text-[10px]">Missing</b>{l.missing_info}</div>
	{/if}

	<ContactLine lead={l} />
	{#if l.message}<div class="mt-2 text-[12.5px] text-mute">Their note: {l.message}</div>{/if}
	{#if draft.purpose === 'reply' && lastIn}
		<div class="mt-3 border-b border-hair py-2.5 text-[13.5px]">
			<div class="eyebrow mb-1 text-[10px] text-bone">Customer // {ago(lastIn.sent_at ?? lastIn.created_at)}</div>
			<div class="border-l-2 border-bone pl-2.5 whitespace-pre-wrap">{lastIn.body ?? ''}</div>
		</div>
	{/if}
	<div class="mt-2 text-[12.5px] text-mute">
		Ref {l.ref ?? ''} // {l.source ?? ''} // {ago(l.created_at)} // draft for
		<b class="font-medium text-foreground">{chanWord}</b> to {draft.to_address ?? ''}
	</div>

	{#if ch === 'email'}
		<Input
			bind:value={subject}
			placeholder="Subject"
			class="mt-2.5 h-auto rounded-none border-hair bg-background px-3 py-2.5 text-base focus-visible:border-foreground focus-visible:ring-0 sm:text-sm"
		/>
	{/if}
	<Textarea
		bind:value={body}
		class="mt-2.5 min-h-[150px] rounded-none border-hair bg-background px-3 py-3 text-base leading-normal focus-visible:border-foreground focus-visible:ring-0 sm:text-sm"
	/>

	<!-- Phone: 2-col grid, primary full width, secondaries in the cells, Open lead on its own
	     right-aligned row, hint last and full width. From sm: the inline flex-wrap row. -->
	<div class="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
		{#if chanOn}
			<Button
				class="{btnPrimary} col-span-2 w-full sm:col-span-1 sm:w-auto"
				disabled={!!working}
				onclick={() => (pending = 'send')}
			>
				{working === 'send' ? 'Sending' : 'Send ' + chanWord}
			</Button>
		{:else}
			<Button class="{btnPrimary} col-span-2 w-full sm:col-span-1 sm:w-auto" disabled={!!working} onclick={copy}>
				Copy {chanWord}
			</Button>
			<Button class="{btn} w-full sm:w-auto" disabled={!!working} onclick={() => (pending = 'mark')}>
				{working === 'mark' ? 'Marking' : 'Mark sent by hand'}
			</Button>
		{/if}
		<Button class="{btn} w-full sm:w-auto" disabled={!!working} onclick={() => (pending = 'skip')}>
			{working === 'skip' ? 'Skipping' : 'Skip'}
		</Button>
		<Button
			class="{btn} {btnSmall} col-span-2 justify-self-end sm:col-span-1 sm:justify-self-auto"
			disabled={!!working}
			onclick={() => l.id && openLead(l.id)}
		>
			Open lead
		</Button>
		{#if !chanOn}
			<span class="col-span-2 text-xs text-mute">
				{ch === 'sms'
					? 'Text sending is off until the number is approved. Copy, send from your phone, then mark it.'
					: 'Email is off until the mailbox is connected. Copy, send from Outlook, then mark it.'}
			</span>
		{/if}
	</div>
</article>

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
