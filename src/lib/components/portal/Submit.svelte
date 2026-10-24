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
		variant="quiet"
		class="mt-2 h-auto min-h-[52px] w-full rounded-none border-t border-hair text-[13px] font-normal tracking-[.04em]"
	>
		{@render children()}
	</Button>
{:else}
	<Button {type} disabled={disabled || sending} {onclick} variant="house" size="cta" class="mt-2" aria-live="polite">
		{#if sending}
			<span class="num">{busy.label}</span>
		{:else}
			{@render children()}
		{/if}
	</Button>
{/if}
