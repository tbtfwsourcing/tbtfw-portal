<script lang="ts">
	interface Props {
		label: string;
		step?: string;
		onback?: () => void;
	}
	let { label, step, onback }: Props = $props();
</script>

<div class="eyebrow mt-1 mb-2 flex h-11 items-center justify-between">
	{#if onback}
		<button
			type="button"
			class="h-11 cursor-pointer bg-transparent pr-3 text-[13px] normal-case tracking-[.04em] text-foreground"
			onclick={onback}
		>
			Back
		</button>
	{:else}
		<span></span>
	{/if}
	<span>{label}{#if step} // <b class="font-normal text-bone">{step}</b>{/if}</span>
</div>
