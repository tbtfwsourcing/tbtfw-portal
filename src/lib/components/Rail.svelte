<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	interface Props {
		label: string;
		step?: string;
		onback?: () => void;
	}
	let { label, step, onback }: Props = $props();
</script>

<div class="mt-1 mb-3 flex h-11 items-center justify-between">
	{#if onback}
		<button
			type="button"
			class="-ml-1 inline-flex h-11 cursor-pointer items-center gap-2 bg-transparent pr-3 pl-1 text-[13px] text-mute transition-colors hover:text-foreground"
			onclick={onback}
		>
			<ArrowLeftIcon class="size-3.5" />
			Back
		</button>
	{:else}
		<span></span>
	{/if}
	<span class="eyebrow dots">
		<span>{label}</span>{#if step}<span class="text-bone">{step}</span>{/if}
	</span>
</div>
