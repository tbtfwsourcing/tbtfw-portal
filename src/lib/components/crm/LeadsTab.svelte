<script lang="ts">
	import { crm, matches } from '#lib/crm/state.svelte.js';
	import { VERDICTS } from '#lib/api/crm.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import Filter from './Filter.svelte';
	import LeadRow from './LeadRow.svelte';

	const all = $derived(crm.data?.leads ?? []);
	const leads = $derived(all.filter(matches));
	const stages = $derived(crm.data?.stages ?? []);

	const kinds = [
		{ value: 'all', label: 'All kinds' },
		{ value: 'sell', label: 'Sell' },
		{ value: 'buy', label: 'Buy' }
	];
	const stageOpts = $derived([{ value: 'all', label: 'All stages' }, ...stages.map((s) => ({ value: s, label: s }))]);
	const verdictOpts = [{ value: 'all', label: 'All verdicts' }, ...VERDICTS.map((v) => ({ value: v, label: v }))];
</script>

<div class="mt-5 mb-1 flex flex-wrap items-center gap-2">
	<Input
		type="search"
		bind:value={crm.filters.q}
		placeholder="Search name, phone, VIN, ref, car"
		enterkeyhint="search"
		autocomplete="off"
		autocorrect="off"
		autocapitalize="none"
		class="min-w-[220px] flex-1 border-hair-strong"
	/>
	<Filter bind:value={crm.filters.kind} label="Kind" options={kinds} />
	<Filter bind:value={crm.filters.stage} label="Stage" options={stageOpts} />
	<Filter bind:value={crm.filters.verdict} label="Verdict" options={verdictOpts} />
</div>

<div class="eyebrow dots mt-7 mb-2">
	<span>Last 60 days</span><span><b class="font-normal text-foreground">{leads.length}</b> of {all.length} leads</span>
</div>
{#if !leads.length}
	<div class="py-8 text-[14px] text-mute">Nothing matches.</div>
{/if}
{#each leads as l (l.id)}
	<LeadRow lead={l} />
{/each}
