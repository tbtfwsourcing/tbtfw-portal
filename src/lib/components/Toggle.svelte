<script lang="ts">
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		checked?: boolean;
		name?: string;
		consent?: boolean;
		required?: boolean;
		class?: string;
		children: Snippet;
	}
	let {
		id,
		checked = $bindable(false),
		name,
		consent = false,
		required,
		class: className = '',
		children
	}: Props = $props();
</script>

<label
	for={id}
	class="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] {className}"
	class:consent
	class:is-on={checked}
>
	<Checkbox
		{id}
		{name}
		{required}
		bind:checked
		class="mt-0.5 size-5 shrink-0 rounded-none border-hair bg-transparent data-checked:border-foreground data-checked:bg-foreground data-checked:text-background focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-3 focus-visible:outline-bone"
	/>
	<span class="text">{@render children()}</span>
</label>

<style>
	.consent {
		font-size: 13px;
		line-height: 1.5;
		color: var(--mute);
		padding-top: 18px;
	}
	.consent.is-on {
		color: var(--fg);
	}
</style>
