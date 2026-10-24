<script lang="ts">
	import { SITE } from '#lib/config.js';

	let { suffix = 'Portal' }: { suffix?: string } = $props();
</script>

<a
	href={SITE.home}
	class="inline-flex items-center gap-3 text-foreground no-underline transition-opacity hover:opacity-70"
	aria-label="{SITE.name}, back to {SITE.home.replace('https://', '')}"
>
	<span class="brand text-[14px]">{SITE.name}</span>
	<span class="h-3 w-px bg-hair-strong" aria-hidden="true"></span>
	<span class="eyebrow">{suffix}</span>
</a>
