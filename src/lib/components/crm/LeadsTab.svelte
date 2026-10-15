<script lang="ts">
	import { crm, matches } from '#lib/crm/state.svelte.js';
	import { VERDICTS } from '#lib/api/crm.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import LeadRow from './LeadRow.svelte';

	const all = $derived(crm.data?.leads ?? []);
	const leads = $derived(all.filter(matches));
	const stages = $derived(crm.data?.stages ?? []);

	const sel =
		'h-[42px] border border-hair bg-background px-3 text-xs tracking-[.08em] uppercase text-foreground outline-none focus:border-foreground';
</script>

<div class="mt-4 mb-1 flex flex-wrap items-center gap-2">
	<Input
		type="search"
		bind:value={crm.filters.q}
		placeholder="Search name, phone, VIN, ref, car"
		class="h-[42px] min-w-[220px] flex-1 rounded-none border-hair bg-background px-3 text-sm focus-visible:border-foreground focus-visible:ring-0"
	/>
	<select class={sel} bind:value={crm.filters.kind} aria-label="Kind">
		<option value="all">All kinds</option>
		<option value="sell">Sell</option>
		<option value="buy">Buy</option>
	</select>
	<select class={sel} bind:value={crm.filters.stage} aria-label="Stage">
		<option value="all">All stages</option>
		{#each stages as s (s)}<option value={s}>{s}</option>{/each}
	</select>
	<select class={sel} bind:value={crm.filters.verdict} aria-label="Verdict">
		<option value="all">All verdicts</option>
		{#each VERDICTS as v (v)}<option value={v}>{v}</option>{/each}
	</select>
</div>

<div class="eyebrow mt-6 mb-2.5 text-[10.5px]">
	Last 60 days // <span class="text-foreground">{leads.length}</span> of {all.length} leads
</div>
{#if !leads.length}
	<div class="py-6 text-mute">Nothing matches.</div>
{/if}
{#each leads as l (l.id)}
	<LeadRow lead={l} />
{/each}
