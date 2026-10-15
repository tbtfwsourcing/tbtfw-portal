<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { busy } from '#lib/busy.svelte.js';
	import type { Snippet } from 'svelte';

	interface Props {
		disabled?: boolean;
		secondary?: boolean;
		type?: 'submit' | 'button';
		onclick?: () => void;
		children: Snippet;
	}
	let { disabled = false, secondary = false, type = 'submit', onclick, children }: Props = $props();

	// While a labelled request is in flight the primary button reports progress
	// instead of its call to action. Secondary buttons (Skip) keep their text.
	const sending = $derived(busy.on && busy.label !== '');
</script>

{#if secondary}
	<Button
		{type}
		{disabled}
		{onclick}
		variant="ghost"
		class="mt-1 block h-auto min-h-[52px] w-full rounded-none border-t border-hair bg-transparent text-[15px] font-normal text-foreground hover:bg-transparent hover:text-bone"
	>
		{@render children()}
	</Button>
{:else}
	<Button
		{type}
		disabled={disabled || sending}
		{onclick}
		aria-live="polite"
		class="mt-2 h-14 w-full rounded-none bg-foreground text-[15px] font-medium tracking-[.02em] text-background transition-colors hover:bg-bone hover:text-background disabled:opacity-50"
	>
		{#if sending}
			<span class="num">{busy.label}</span>
		{:else}
			{@render children()}
		{/if}
	</Button>
{/if}
