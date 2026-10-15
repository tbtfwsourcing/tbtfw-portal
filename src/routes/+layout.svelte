<script lang="ts">
	import '../app.css';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { asset } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={asset('favicon.svg')} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={asset('apple-touch-icon.png')} />
	<link rel="manifest" href={asset('site.webmanifest')} />
</svelte:head>

{@render children()}

<Toaster theme="dark" position="bottom-center" />
