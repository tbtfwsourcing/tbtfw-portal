<script lang="ts">
	import { portal } from '#lib/portal/state.svelte.js';
	import { SITE } from '#lib/config.js';
	import Rail from '#lib/components/Rail.svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	const d = $derived(portal.done);
</script>

<Rail label="Sent" />
{#if d.photo}
	<div class="my-1 mb-8 aspect-[4/3] overflow-hidden border border-hair bg-surface">
		<img src={d.photo} alt="" class="size-full object-cover" />
	</div>
{/if}
<p class="eyebrow mb-4 flex items-center gap-2.5">
	<span class="grid size-5 place-items-center rounded-full bg-bone text-background"><CheckIcon class="size-3" /></span>
	Received
</p>
<div class="disp num mb-3 text-[26px]">{d.ref}</div>
{#if d.spec}<div class="eyebrow mb-8">{d.spec}</div>{/if}
<p class="disp-sm mb-4 max-w-[20em] text-[22px] font-normal md:text-[26px]">A salesperson will respond within the hour.</p>
{#if d.note}<p class="num mb-6 text-[13px] text-mute">{d.note}</p>{/if}
<a
	href={SITE.home}
	class="mt-8 flex items-center justify-between border-t border-hair py-5 text-[14px] text-foreground no-underline transition-colors hover:text-bone"
>
	Back to {SITE.home.replace('https://www.', '').replace('https://', '')}
	<ArrowRightIcon class="size-3.5 text-mute" />
</a>
