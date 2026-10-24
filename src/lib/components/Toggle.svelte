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
	class="flex min-h-11 cursor-pointer items-start gap-3.5 py-2.5 text-[15px] {className}"
	class:consent
	class:is-on={checked}
>
	<Checkbox
		{id}
		{name}
		{required}
		bind:checked
		class="mt-0.5"
	/>
	<span class="text">{@render children()}</span>
</label>

<style>
	.consent {
		font-size: 13px;
		line-height: 1.55;
		color: var(--mute);
		padding-top: 18px;
		transition: color 0.2s;
	}
	.consent.is-on {
		color: var(--fg);
	}
</style>
