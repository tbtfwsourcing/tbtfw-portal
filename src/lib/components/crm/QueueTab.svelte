<script lang="ts">
	import { crm } from '#lib/crm/state.svelte.js';
	import DraftCard from './DraftCard.svelte';

	const drafts = $derived(crm.data?.drafts ?? []);
</script>

<div class="eyebrow mt-6 mb-2.5 text-[10.5px]">
	Awaiting your approval // <span class="text-foreground">{drafts.length}</span>
</div>
{#if !drafts.length}
	<div class="py-6 text-mute">
		Nothing waiting. New leads draft themselves within two minutes of landing; replies and follow-ups land here too.
	</div>
{/if}
{#each drafts as d (d.id)}
	<DraftCard draft={d} />
{/each}
