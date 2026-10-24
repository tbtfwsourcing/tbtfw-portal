<script lang="ts">
	import type { Lead } from '#lib/api/crm.js';
	import { crm } from '#lib/crm/state.svelte.js';
	import { carName, ago } from '#lib/format.js';
	import StageMark from './StageMark.svelte';

	// One line of the list. `waiting`: what this lead has in the queue, a draft or a queued auto-email.
	let { lead, active = false, waiting }: { lead: Lead; active?: boolean; waiting?: string } = $props();

	const last = $derived((lead.messages ?? []).at(-1));
	const theirMove = $derived(last?.direction === 'in');
</script>

<button
	type="button"
	id="l-{lead.id}"
	class="relative block w-full cursor-pointer border-b border-hair px-4 py-3.5 text-left transition-colors last:border-b-0 {active
		? 'bg-surface-2'
		: 'hover:bg-surface active:bg-surface'}"
	aria-current={active ? 'true' : undefined}
	onclick={() => (crm.openId = lead.id)}
>
	{#if active}<span class="absolute inset-y-0 left-[-1px] w-px bg-bone" aria-hidden="true"></span>{/if}
	<div class="flex items-baseline justify-between gap-3">
		<span class="disp-sm truncate text-[15px] {lead.status === 'junk' ? 'text-mute' : ''}">{carName(lead)}</span>
		<span class="mlabel shrink-0">{ago(lead.created_at).replace(' ago', '')}</span>
	</div>
	<div class="mt-1.5 flex items-center justify-between gap-3">
		<span class="dots min-w-0 truncate text-[12.5px] text-mute">
			<span class="text-foreground/90">{lead.full_name ?? ''}</span><span>{lead.kind === 'sell' ? 'Sell' : 'Buy'}</span>{#if lead.verdict}<span class={lead.verdict === 'CHASE' || lead.verdict === 'WATCH' ? 'text-bone' : ''}>{lead.verdict}</span>{/if}
		</span>
		<StageMark status={lead.status} class="shrink-0" />
	</div>
	{#if waiting || theirMove || lead.flag}
		<div class="mlabel mt-2 flex items-center gap-3 normal-case tracking-normal">
			{#if waiting}<span class="shrink-0 text-bone">{waiting === 'approved' ? 'Auto-email queued' : 'Draft waiting'}</span>{:else if theirMove}<span class="shrink-0 text-bone">They wrote {ago(last?.sent_at ?? last?.created_at)}</span>{/if}
			{#if lead.flag}<span class="min-w-0 truncate text-mute">{lead.flag}</span>{/if}
		</div>
	{/if}
</button>
