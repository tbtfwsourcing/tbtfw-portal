<script lang="ts">
	import { crm, matches } from '#lib/crm/state.svelte.js';
	import { VERDICTS } from '#lib/api/crm.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import LeadRow from './LeadRow.svelte';

	const all = $derived(crm.data?.leads ?? []);
	const leads = $derived(all.filter(matches));
	const stages = $derived(crm.data?.stages ?? []);

	// 16px on phones so iOS does not zoom the page when a select or the search field opens;
	// at that size the filters read in sentence case, matching the search field beside them.
	const sel =
		'h-11 appearance-none border border-hair bg-background px-3 text-base text-foreground outline-none focus:border-foreground sm:h-[42px] sm:text-xs sm:tracking-[.08em] sm:uppercase';
</script>

<div class="mt-4 mb-1 flex flex-wrap items-center gap-2">
	<Input
		type="search"
		bind:value={crm.filters.q}
		placeholder="Search name, phone, VIN, ref, car"
		enterkeyhint="search"
		autocomplete="off"
		autocorrect="off"
		autocapitalize="none"
		class="h-11 min-w-[220px] flex-1 appearance-none rounded-none border-hair bg-background px-3 text-base focus-visible:border-foreground focus-visible:ring-0 sm:h-[42px] sm:text-sm"
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
