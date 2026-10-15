<script lang="ts">
	import { SITE } from '#lib/config.js';

	const year = new Date().getFullYear();
	const contact = [SITE.address, SITE.phone, SITE.hours].filter(Boolean);
</script>

<footer class="mt-16 border-t border-hair px-5 pt-8 pb-[calc(32px+env(safe-area-inset-bottom))]">
	<div class="mx-auto flex max-w-[560px] flex-col gap-6 md:max-w-[1120px] md:flex-row md:items-end md:justify-between">
		<div class="flex flex-col gap-2">
			<span class="disp text-[13px] tracking-[.12em]">{SITE.name}</span>
			<span class="text-[13px] text-mute">{SITE.tagline}</span>
			{#if contact.length}
				<span class="num text-[13px] text-mute">{contact.join(' // ')}</span>
			{/if}
		</div>
		<nav class="flex flex-wrap gap-x-6 gap-y-2 text-[13px]" aria-label="Footer">
			<a href={SITE.home} class="text-foreground hover:text-bone">tbtfw.com</a>
			<a href="{SITE.home}/collections/all" class="text-foreground hover:text-bone">Inventory</a>
			<a href={SITE.privacy} target="_blank" rel="noopener" class="text-mute hover:text-bone">Privacy</a>
			<span class="text-mute">&copy; {year} {SITE.name}</span>
		</nav>
	</div>
</footer>
