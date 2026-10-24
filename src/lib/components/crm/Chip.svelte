<script lang="ts">
	import type { Snippet } from 'svelte';
	import { badgeVariants, type BadgeVariant } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils.js';

	interface Props {
		variant?: BadgeVariant;
		onclick?: () => void;
		class?: string;
		children: Snippet;
	}
	let { variant = 'default', onclick, class: className = '', children }: Props = $props();
</script>

{#if onclick}
	<!-- Clickable chips get a thumb-sized target on phones; display chips stay compact. -->
	<button
		type="button"
		class={cn(badgeVariants({ variant }), 'min-h-11 cursor-pointer px-3.5 hover:border-bone hover:text-bone sm:min-h-0 sm:px-2.5 sm:py-[6px]', className)}
		{onclick}
	>
		{@render children()}
	</button>
{:else}
	<span class={cn(badgeVariants({ variant }), className)}>{@render children()}</span>
{/if}
