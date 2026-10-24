<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';

	interface Props {
		label: string;
		step?: string;
		onback?: () => void;
	}
	let { label, step, onback }: Props = $props();
</script>

<div class="eyebrow mt-1 mb-2 flex h-11 items-center justify-between">
	{#if onback}
		<!-- The hit area runs 12px past the text on the left, so a thumb at the screen edge still lands. -->
		<button
			type="button"
			class="-ml-3 flex h-11 cursor-pointer items-center gap-0.5 bg-transparent pr-4 pl-1.5 text-[13px] normal-case tracking-[.04em] text-foreground active:text-bone"
			onclick={onback}
		>
			<ChevronLeftIcon class="size-4" aria-hidden="true" />
			Back
		</button>
	{:else}
		<span></span>
	{/if}
	<span>{label}{#if step} // <b class="font-normal text-bone">{step}</b>{/if}</span>
</div>
