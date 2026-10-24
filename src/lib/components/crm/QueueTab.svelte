<script lang="ts">
	import { crm } from '#lib/crm/state.svelte.js';
	import DraftCard from './DraftCard.svelte';

	const drafts = $derived(crm.data?.drafts ?? []);
</script>

<div class="eyebrow dots mt-7 mb-3">
	<span>Awaiting your approval</span><span class="text-foreground">{drafts.length}</span>
</div>
{#if !drafts.length}
	<div class="max-w-[48ch] py-8 text-[14px] leading-relaxed text-mute">
		Nothing waiting. New leads draft themselves within two minutes of landing; replies and follow-ups land here too.
	</div>
{/if}
{#each drafts as d (d.id)}
	<DraftCard draft={d} />
{/each}
