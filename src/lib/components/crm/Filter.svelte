<script lang="ts">
	import * as Select from '#lib/components/ui/select/index.js';

	interface Option {
		value: string;
		label: string;
	}
	interface Props {
		value: string;
		label: string;
		options: Option[];
		class?: string;
	}
	let { value = $bindable('all'), label, options, class: className = '' }: Props = $props();

	const current = $derived(options.find((o) => o.value === value)?.label ?? label);
</script>

<Select.Root type="single" bind:value>
	<Select.Trigger aria-label={label} class={className}>{current}</Select.Trigger>
	<Select.Content sideOffset={-1}>
		{#each options as o (o.value)}
			<Select.Item value={o.value} label={o.label}>{o.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
