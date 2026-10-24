<script lang="ts">
	import type { Snippet } from 'svelte';

	// A tab's opening line. The title shows from lg:, where the rail replaces the
	// phone's tab bar; the meta row (counts, scope) shows everywhere.
	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="mt-6 mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 lg:mt-0 lg:mb-7">
	<h1 class="disp hidden text-[30px] lg:block">{title}</h1>
	{#if children}<div class="mlabel dots">{@render children()}</div>{/if}
</div>
