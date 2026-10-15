<script lang="ts">
	import { portal } from '#lib/portal/state.svelte.js';
	import { SITE } from '#lib/config.js';
	import Rail from '#lib/components/Rail.svelte';

	const d = $derived(portal.done);
</script>

<Rail label="SENT" />
{#if d.photo}
	<div class="my-1 mb-6 aspect-[4/3] overflow-hidden border border-hair bg-background">
		<img src={d.photo} alt="" class="size-full object-cover" />
	</div>
{/if}
<div class="disp num mb-1.5 text-[26px] tracking-[.04em]">{d.ref}</div>
{#if d.spec}<div class="num mb-[18px] text-sm text-mute">{d.spec}</div>{/if}
<p class="mb-7 text-base">A salesperson will respond within the hour.</p>
{#if d.note}<p class="num mb-[18px] text-sm text-mute">{d.note}</p>{/if}
<a href={SITE.home} class="block border-t border-hair py-4 text-[15px] text-foreground no-underline hover:text-bone">
	Back to {SITE.home.replace('https://www.', '').replace('https://', '')}
</a>
