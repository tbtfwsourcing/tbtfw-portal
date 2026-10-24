<script lang="ts">
	import '../app.css';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The CRM gets its own manifest so "Add to Home Screen" on /leads opens the
	// queue, not the customer portal.
	const manifest = $derived(page.route.id === '/leads' ? 'leads.webmanifest' : 'site.webmanifest');
	const title = $derived(page.route.id === '/leads' ? 'Leads' : 'TBTFW');
</script>

<svelte:head>
	<link rel="icon" href={asset('favicon.svg')} type="image/svg+xml" />
	<link rel="apple-touch-icon" href={asset('apple-touch-icon.png')} />
	<link rel="manifest" href={asset(manifest)} />
	<meta name="apple-mobile-web-app-title" content={title} />
</svelte:head>

{@render children()}

<!-- Toasts clear the home indicator on phones and sit a thumb's reach from the bottom. -->
<Toaster
	theme="dark"
	position="bottom-center"
	mobileOffset={{ bottom: 'calc(16px + env(safe-area-inset-bottom))', left: '16px', right: '16px' }}
/>
