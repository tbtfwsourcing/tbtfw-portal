<script lang="ts">
	import { crm } from '#lib/crm/state.svelte.js';
	import DraftCard from './DraftCard.svelte';
	import PageHead from './PageHead.svelte';

	const drafts = $derived(crm.data?.drafts ?? []);
	const autos = $derived(drafts.filter((d) => d.status === 'approved').length);
	const replies = $derived(drafts.filter((d) => d.purpose === 'reply').length);
	const follows = $derived(drafts.filter((d) => d.purpose === 'follow_up').length);
	const firsts = $derived(drafts.length - replies - follows - autos);
</script>

<PageHead title="Queue">
	<span class={drafts.length - autos ? 'text-foreground' : ''}>{drafts.length - autos} awaiting approval</span>
	{#if autos}<span class="text-bone">{autos} sending by {autos === 1 ? 'itself' : 'themselves'}</span>{/if}
	{#if replies}<span class="text-bone">{replies} {replies === 1 ? 'reply' : 'replies'}</span>{/if}
	{#if firsts}<span>{firsts} first {firsts === 1 ? 'touch' : 'touches'}</span>{/if}
	{#if follows}<span>{follows} follow-{follows === 1 ? 'up' : 'ups'}</span>{/if}
</PageHead>

{#if !drafts.length}
	<div class="border border-hair bg-surface px-6 py-14 text-center sm:py-20">
		<p class="disp text-[24px]">All clear.</p>
		<p class="mx-auto mt-3 max-w-[44ch] text-[13.5px] leading-relaxed text-mute">
			New leads draft themselves within two minutes of landing. Replies and follow-ups land here too.
		</p>
	</div>
{/if}
{#each drafts as d (d.id)}
	<DraftCard draft={d} />
{/each}
