<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'default' | 'solid' | 'dim' | 'acc';
	interface Props {
		variant?: Variant;
		onclick?: () => void;
		class?: string;
		children: Snippet;
	}
	let { variant = 'default', onclick, class: className = '', children }: Props = $props();

	const look: Record<Variant, string> = {
		default: 'border-foreground text-foreground',
		solid: 'border-foreground bg-foreground text-background',
		dim: 'border-hair text-mute',
		acc: 'border-bone text-bone'
	};
	const base = 'inline-block border px-2 py-1 text-[10px] leading-none tracking-[.14em] uppercase';
</script>

{#if onclick}
	<button
		type="button"
		class="{base} {look[variant]} cursor-pointer transition-colors hover:border-bone hover:text-bone {className}"
		{onclick}
	>
		{@render children()}
	</button>
{:else}
	<span class="{base} {look[variant]} {className}">{@render children()}</span>
{/if}
