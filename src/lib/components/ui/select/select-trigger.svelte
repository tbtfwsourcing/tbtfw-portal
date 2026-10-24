<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithoutChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"flex h-11 w-fit cursor-pointer items-center justify-between gap-3 rounded-none border border-hair-strong bg-background px-3.5 text-[11px] tracking-[.16em] text-foreground uppercase whitespace-nowrap transition-colors outline-none select-none hover:bg-surface focus-visible:border-foreground focus-visible:ring-0 data-[state=open]:border-foreground data-placeholder:text-mute disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="text-mute size-3.5 pointer-events-none" />
</SelectPrimitive.Trigger>
