<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import { SITE } from '#lib/config.js';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? 'Not found' : 'Error'} // {SITE.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="border-b border-hair pt-[env(safe-area-inset-top)]">
	<div class="mx-auto flex h-14 max-w-[560px] items-center justify-center px-5">
		<Wordmark />
	</div>
</header>

<main class="mx-auto max-w-[560px] px-5 pt-16 pb-24">
	<p class="eyebrow mb-3">{page.status}</p>
	<h1 class="disp mb-5 text-[34px] md:text-[44px]">
		{notFound ? 'Nothing here.' : 'Something broke.'}
	</h1>
	<p class="mb-10 max-w-[36em] text-[15px] text-mute">
		{#if notFound}
			That address does not match a page on the portal.
		{:else}
			{page.error?.message ?? 'Try again in a minute.'}
		{/if}
	</p>
	<a href={resolve('/')} class="block border-t border-hair py-5 text-[14px] text-foreground no-underline transition-colors hover:text-bone">
		Start over
	</a>
	<a href={SITE.home} class="block border-t border-hair py-5 text-[14px] text-foreground no-underline transition-colors hover:text-bone">
		Back to {SITE.home.replace('https://www.', '')}
	</a>
</main>
