<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { Draft, Lead } from '#lib/api/crm.js';
	import { crm as api } from '#lib/api/crm.js';
	import { crm, leadById, load, openLead } from '#lib/crm/state.svelte.js';
	import { carName, purposeLabel, money, miles, ago, formatPhone, dialable } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import SendIcon from '@lucide/svelte/icons/send';
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
	const to = $derived(ch === 'sms' ? formatPhone(draft.to_address ?? '') || draft.to_address : draft.to_address);

	// Seeded once: the card is keyed by draft id, so a new draft is a new card.
	// svelte-ignore state_referenced_locally
	let body = $state(draft.body ?? '');
	// svelte-ignore state_referenced_locally
	let subject = $state(draft.subject ?? '');
	const edited = $derived(body !== (draft.body ?? '') || (ch === 'email' && subject !== (draft.subject ?? '')));
	type Act = 'send' | 'mark' | 'skip';
	// Which action is in flight, so its button can say so.
	let working = $state<null | Act>(null);
	let pending = $state<null | Act>(null);

	// With the channel off, the draft is handed to the device's own Messages or
	// Mail app, prefilled; "?&body=" is the form both iOS and Android accept.
	const handoff = $derived(
		ch === 'sms'
			? 'sms:' + dialable(draft.to_address) + '?&body=' + encodeURIComponent(body)
			: 'mailto:' + (draft.to_address ?? '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)
	);

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

	function text() {
		return (ch === 'email' && subject ? 'Subject: ' + subject + '\n\n' : '') + body;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(text());
			toast.success('Copied. Send it, then tap Mark sent.');
		} catch {
			toast('Select the text and copy it.');
		}
	}

	// The handoff link opens Messages or Mail; the clipboard gets a copy too, in
	// case the app opens without the body (some desktop mail clients drop it).
	function handedOff() {
		navigator.clipboard?.writeText(text()).catch(() => {});
		toast('Once it has gone, tap Mark sent.');
	}

	function revert() {
		body = draft.body ?? '';
		subject = draft.subject ?? '';
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

{#snippet stat(label: string, value: string, sub = '')}
	<div class="bg-surface px-3.5 py-3">
		<dt class="mlabel">{label}</dt>
		<dd class="mt-1.5 text-[15px] font-medium">{value}{#if sub}<span class="mono ml-1.5 text-[11px] font-normal text-mute">{sub}</span>{/if}</dd>
	</div>
{/snippet}

<article class="relative mb-4 border border-hair bg-surface sm:mb-5">
	{#if hot}<span class="absolute inset-y-[-1px] left-[-1px] w-0.5 bg-bone" aria-hidden="true"></span>{/if}

	<!-- What this draft is, and the way out to its lead. -->
	<header class="flex items-center justify-between gap-4 border-b border-hair py-1 pr-2 pl-4 sm:pl-5">
		<div class="mlabel dots min-w-0">
			<span class="text-foreground"><i class="mr-2 inline-block size-1.5 rounded-full bg-bone align-[1px]" aria-hidden="true"></i>{purposeLabel(draft.purpose)}</span><span>{isSell ? 'Sell' : 'Buy'}</span>{#if l.classification}<span class="hidden sm:inline">{l.classification}</span>{/if}{#if l.verdict}<span class={hot ? 'text-bone' : ''}>{l.verdict}</span>{/if}{#if l.desirability_tier}<span class="hidden sm:inline">{l.desirability_tier}</span>{/if}<span>{ago(draft.created_at ?? l.created_at)}</span>
		</div>
		<button
			type="button"
			class="mlabel inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 px-2 transition-colors hover:text-foreground active:text-foreground disabled:opacity-40 sm:h-9"
			disabled={!!working}
			onclick={() => l.id && openLead(l.id)}
		>
			Open lead <ArrowUpRightIcon class="size-3.5" />
		</button>
	</header>

	<div class="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
		<!-- The lead, as much as it takes to judge the draft. -->
		<section class="p-4 sm:p-5 lg:p-6">
			<h2 class="disp text-[22px] sm:text-[24px]">{carName(l)}</h2>
			{#if !isSell && l.stock_id}<p class="mono mt-2 text-[12px] text-mute">Stock {l.stock_id}</p>{/if}

			{#if isSell}
				<dl class="mt-5 grid grid-cols-2 gap-px border border-hair bg-hair">
					{@render stat('Asking', money(l.asking_price, 'No price'))}
					{@render stat('US sold median', l.comps_n ? money(l.comps_median, '—') : 'No comps', l.comps_n ? 'n=' + l.comps_n : '')}
					{@render stat('Mileage', miles(l.mileage, 'Unknown'))}
					{@render stat('Photos', String(l.photo_count ?? 0))}
				</dl>
				{#if l.desirability_why}<p class="mt-4 text-[13.5px] leading-relaxed">{l.desirability_why}</p>{/if}
			{/if}

			{#if l.flag || l.missing_info || l.message}
				<dl class="mt-5 grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13.5px] leading-relaxed">
					{#if l.flag}<dt class="mlabel pt-[3px] text-bone">Flag</dt><dd class="text-bone">{l.flag}</dd>{/if}
					{#if l.missing_info}<dt class="mlabel pt-[3px]">Missing</dt><dd class="text-mute">{l.missing_info}</dd>{/if}
					{#if l.message}<dt class="mlabel pt-[3px]">Note</dt><dd class="text-mute">“{l.message}”</dd>{/if}
				</dl>
			{/if}

			{#if draft.purpose === 'reply' && lastIn}
				<figure class="mt-5 border-l border-bone pl-4">
					<figcaption class="mlabel dots mb-1.5 text-bone"><span>{l.full_name?.split(' ')[0] || 'Customer'} wrote</span><span>{ago(lastIn.sent_at ?? lastIn.created_at)}</span></figcaption>
					<blockquote class="text-[13.5px] leading-relaxed whitespace-pre-wrap">{lastIn.body ?? ''}</blockquote>
				</figure>
			{/if}

			<ContactLine lead={l} class="mt-5 border-t border-hair pt-4" />
			<div class="mlabel dots mt-2">
				<span>{l.ref ?? ''}</span>{#if l.source}<span>via {l.source}</span>{/if}<span>{ago(l.created_at)}</span>
			</div>
		</section>

		<!-- The draft: edit it, then send it, hand it off, or skip it. -->
		<section class="flex flex-col border-t border-hair p-4 sm:p-5 lg:border-t-0 lg:border-l lg:p-6">
			<div class="mb-2.5 flex items-center justify-between gap-3">
				<p class="mlabel min-w-0 truncate">
					{chanWord} to <span class="text-foreground normal-case">{to ?? ''}</span>
				</p>
				<button
					type="button"
					class="-my-2 -mr-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center text-mute transition-colors hover:text-foreground active:text-bone"
					aria-label="Copy the draft"
					title="Copy"
					onclick={copy}
				>
					<CopyIcon class="size-3.5" />
				</button>
			</div>
			{#if ch === 'email'}
				<Input bind:value={subject} placeholder="Subject" aria-label="Subject" class="mb-2 bg-background" />
			{/if}
			<Textarea bind:value={body} aria-label="Message" class="min-h-[168px] flex-1 bg-background px-4 py-3.5 sm:text-[14px]" />
			<div class="mlabel mt-2 flex items-center justify-between gap-3">
				<span>{body.length} characters</span>
				{#if edited}
					<button type="button" class="cursor-pointer text-bone transition-colors hover:text-foreground" onclick={revert}>Edited · Revert</button>
				{/if}
			</div>

			<!-- Phone: primary full width, the rest in two cells. From sm: one row, Skip pushed right. -->
			<div class="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
				{#if chanOn}
					<Button
						variant="house"
						size="house"
						class="col-span-2 w-full gap-2.5 sm:w-auto"
						disabled={!!working}
						onclick={() => (pending = 'send')}
					>
						<SendIcon class="size-3.5" />{working === 'send' ? 'Sending' : 'Send ' + chanWord}
					</Button>
				{:else}
					<Button
						variant="house"
						size="house"
						href={handoff}
						class="col-span-2 w-full gap-2.5 sm:w-auto"
						disabled={!!working}
						onclick={handedOff}
					>
						Open in {ch === 'sms' ? 'Messages' : 'Mail'} <ArrowUpRightIcon class="size-3.5" />
					</Button>
					<Button variant="hairline" size="house" class="w-full sm:w-auto" disabled={!!working} onclick={() => (pending = 'mark')}>
						{working === 'mark' ? 'Marking' : 'Mark sent'}
					</Button>
				{/if}
				<Button
					variant="quiet"
					size="house"
					class="w-full sm:ml-auto sm:w-auto {chanOn ? 'col-span-2' : ''}"
					disabled={!!working}
					onclick={() => (pending = 'skip')}
				>
					{working === 'skip' ? 'Skipping' : 'Skip'}
				</Button>
			</div>
			{#if !chanOn}
				<p class="mt-3 text-[12px] leading-relaxed text-mute">
					{ch === 'sms'
						? 'Text sending is off until the number is approved. Send it from your phone, then mark it sent.'
						: 'Email is off until the mailbox is connected. Send it from Outlook, then mark it sent.'}
				</p>
			{/if}
		</section>
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
