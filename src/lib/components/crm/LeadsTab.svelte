<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { crm, matches } from '#lib/crm/state.svelte.js';
	import { VERDICTS, DEFAULT_STAGES } from '#lib/api/crm.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import Filter from './Filter.svelte';
	import LeadRow from './LeadRow.svelte';
	import LeadDetail from './LeadDetail.svelte';
	import PageHead from './PageHead.svelte';

	// From lg: the list and the open lead sit side by side; below that the lead
	// opens as a full-height sheet over the list.
	const wide = new MediaQuery('min-width: 1024px', false);

	const all = $derived(crm.data?.leads ?? []);
	const leads = $derived(all.filter((l) => matches(l)));
	// Stage counts honour search, kind and verdict, so the strip reads as a breakdown of what is listed.
	const pool = $derived(all.filter((l) => matches(l, true)));
	const stages = $derived(crm.data?.stages ?? DEFAULT_STAGES);
	const strip = $derived([
		{ id: 'all', label: 'All', n: pool.length },
		...stages
			.map((s) => ({ id: s, label: s, n: pool.filter((l) => (l.status ?? 'new') === s).length }))
			.filter((s) => s.id !== 'duplicate' || s.n)
	]);
	// lead id -> 'draft' or 'approved' (an auto-email counting down), for the row's note.
	const waiting = $derived(new Map((crm.data?.drafts ?? []).map((d) => [d.lead_id, d.status ?? 'draft'])));

	const selected = $derived(leads.find((l) => l.id === crm.openId) ?? (wide.current ? leads[0] : undefined));

	const kinds = [
		{ value: 'all', label: 'All' },
		{ value: 'buy', label: 'Buy' },
		{ value: 'sell', label: 'Sell' }
	];
	const verdictOpts = [{ value: 'all', label: 'Any verdict' }, ...VERDICTS.map((v) => ({ value: v, label: v }))];
</script>

<PageHead title="Leads">
	<span>Last 60 days</span><span><b class="font-normal text-foreground">{leads.length}</b> of {all.length}</span>
</PageHead>

<!-- The stage strip: a count per stage, and the stage filter itself. -->
<div class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
	<div class="flex min-w-max border border-hair sm:min-w-0" role="group" aria-label="Filter by stage">
		{#each strip as s (s.id)}
			{@const active = crm.filters.stage === s.id}
			<button
				type="button"
				class="relative min-w-[84px] flex-1 cursor-pointer border-r border-hair px-3.5 pt-3 pb-3.5 text-left transition-colors last:border-r-0 {active
					? 'bg-surface-2'
					: 'hover:bg-surface'}"
				aria-pressed={active}
				onclick={() => (crm.filters.stage = s.id)}
			>
				{#if active}<span class="absolute inset-x-0 top-[-1px] h-px bg-bone" aria-hidden="true"></span>{/if}
				<span class="mlabel block {active ? 'text-foreground' : ''}">{s.label}</span>
				<span class="mt-2 block text-[22px] leading-none font-medium {s.n ? (s.id === 'junk' ? 'text-mute' : 'text-foreground') : 'text-hair-strong'}">{s.n}</span>
			</button>
		{/each}
	</div>
</div>

<div class="mt-3 flex flex-wrap items-center gap-2">
	<div class="relative min-w-[220px] flex-1">
		<SearchIcon class="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-mute" />
		<Input
			type="search"
			bind:value={crm.filters.q}
			placeholder="Search name, phone, VIN, ref, car"
			enterkeyhint="search"
			autocomplete="off"
			autocorrect="off"
			autocapitalize="none"
			aria-label="Search leads"
			class="pl-9"
		/>
	</div>
	<div class="flex h-11 border border-hair" role="group" aria-label="Kind">
		{#each kinds as k (k.value)}
			{@const active = crm.filters.kind === k.value}
			<button
				type="button"
				class="mlabel h-full cursor-pointer px-3.5 transition-colors {active ? 'bg-surface-2 text-foreground' : 'hover:text-foreground'}"
				aria-pressed={active}
				onclick={() => (crm.filters.kind = k.value)}>{k.label}</button
			>
		{/each}
	</div>
	<Filter bind:value={crm.filters.verdict} label="Verdict" options={verdictOpts} class="border-hair font-mono text-[10.5px] tracking-[.08em]" />
</div>

<div class="mt-5 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
	<div class="border border-hair">
		{#if !leads.length}
			<div class="px-4 py-10 text-[13.5px] text-mute">Nothing matches.</div>
		{/if}
		{#each leads as l (l.id)}
			<LeadRow lead={l} active={selected?.id === l.id} waiting={waiting.get(l.id)} />
		{/each}
	</div>
	{#if wide.current}
		<div class="sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto border border-l-0 border-hair bg-surface [scrollbar-width:thin]">
			{#if selected}
				{#key selected.id}<LeadDetail lead={selected} />{/key}
			{:else}
				<div class="px-6 py-16 text-center text-[13.5px] text-mute">Pick a lead.</div>
			{/if}
		</div>
	{/if}
</div>

{#if !wide.current}
	<Sheet.Root open={crm.tab === 'leads' && !!selected} onOpenChange={(o) => !o && (crm.openId = null)}>
		<Sheet.Content
			side="right"
			showCloseButton={false}
			class="w-full gap-0 overflow-y-auto border-hair bg-surface p-0 shadow-none data-[side=right]:w-full sm:data-[side=right]:max-w-[560px]"
		>
			{#if selected}
				{#key selected.id}<LeadDetail lead={selected} sheet />{/key}
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{/if}
