<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-11 w-full min-w-0 rounded-none border border-hair bg-background px-3.5 py-2 text-base transition-colors outline-none placeholder:text-mute focus-visible:border-hair-strong focus-visible:ring-0 aria-invalid:border-bone disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:text-foreground",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-11 w-full min-w-0 rounded-none border border-hair bg-background px-3.5 py-2 text-base transition-colors outline-none placeholder:text-mute focus-visible:border-hair-strong focus-visible:ring-0 aria-invalid:border-bone disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:text-foreground",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
