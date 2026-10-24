<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const badgeVariants = tv({
		// House chip: a small tracked label in a hairline box.
		base: "inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-none border px-2 py-[5px] text-[10px] leading-none tracking-[.16em] uppercase transition-colors focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-bone",
		variants: {
			variant: {
				default: "border-hair-strong text-foreground",
				solid: "border-foreground bg-foreground text-background",
				dim: "border-hair text-mute",
				accent: "border-bone/50 text-bone",
				secondary: "border-hair bg-surface-2 text-foreground",
				destructive: "border-destructive/40 text-destructive",
				outline: "border-hair-strong text-foreground",
				ghost: "border-transparent text-mute",
				link: "border-transparent text-foreground underline-offset-4 hover:underline",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? "a" : "span"}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
