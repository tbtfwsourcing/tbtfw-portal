<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"flex field-sizing-content min-h-24 w-full rounded-none border border-hair bg-background px-3.5 py-3 text-base leading-relaxed transition-colors outline-none placeholder:text-mute focus-visible:border-hair-strong focus-visible:ring-0 aria-invalid:border-bone disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
		className
	)}
	bind:value
	{...restProps}></textarea>
