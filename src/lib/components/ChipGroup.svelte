<script lang="ts">
	interface Props {
		name: string;
		label: string;
		options: string[];
		value?: string;
		class?: string;
	}
	let { name, label, options, value = $bindable(''), class: className = '' }: Props = $props();
	const labelId = $derived('l-' + name);
</script>

<span class="eyebrow mt-5 mb-1 block" id={labelId}>{label}</span>
<div role="radiogroup" aria-labelledby={labelId} class="mt-2 mb-6 flex flex-wrap gap-2 {className}">
	{#each options as opt (opt)}
		<label
			class="relative inline-flex min-h-11 cursor-pointer items-center border border-hair-strong px-4 text-[11px] font-medium tracking-[.16em] text-foreground uppercase transition-colors duration-300 select-none hover:border-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:outline-1 has-focus-visible:outline-offset-2 has-focus-visible:outline-bone"
		>
			<input type="radio" class="sr-only" {name} value={opt} bind:group={value} />
			<span>{opt}</span>
		</label>
	{/each}
</div>
