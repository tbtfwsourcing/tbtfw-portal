<script lang="ts">
	import { SITE } from '#lib/config.js';

	let { suffix = 'PORTAL' }: { suffix?: string } = $props();
</script>

<a
	href={SITE.home}
	class="disp text-[13px] tracking-[.12em] text-foreground no-underline"
	aria-label="{SITE.name}, back to {SITE.home.replace('https://', '')}"
>
	{SITE.name} <span class="text-mute">// {suffix}</span>
</a>
