<script lang="ts">
	import { onMount, tick } from 'svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { crm, readKey, load, type Tab } from '#lib/crm/state.svelte.js';
	import { SITE } from '#lib/config.js';
	import { ago } from '#lib/format.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import QueueTab from '#lib/components/crm/QueueTab.svelte';
	import LeadsTab from '#lib/components/crm/LeadsTab.svelte';
	import VoiceTab from '#lib/components/crm/VoiceTab.svelte';

	const drafts = $derived(crm.data?.drafts.length ?? 0);
	const leads = $derived(crm.data?.leads.length ?? 0);
	const ch = $derived(crm.data?.channels ?? {});

	// `now` is bumped every 10s so the "UPDATED …" label re-derives; the
	// clamp covers the moment right after a load, when lastLoaded is newer than now.
	let now = $state(Date.now());
	const updated = $derived.by(() => {
		if (!crm.lastLoaded) return '';
		const s = Math.max(0, Math.floor((now - crm.lastLoaded) / 1000));
		if (s < 10) return 'JUST NOW';
		if (s < 60) return s + 'S AGO';
		return ago(new Date(crm.lastLoaded).toISOString()).toUpperCase();
	});

	const stat = $derived(
		crm.loading
			? 'loading'
			: crm.blocked
				? ''
				: drafts +
					' TO APPROVE // EMAIL ' +
					(ch.email ? 'ON' : 'OFF') +
					' // TEXT ' +
					(ch.sms ? 'ON' : 'OFF') +
					(updated ? ' // UPDATED ' + updated : '')
	);

	let refreshing = $state(false);
	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			await load();
		} finally {
			refreshing = false;
			now = Date.now();
		}
	}

	onMount(() => {
		readKey();
		load();
		// Refresh every minute while visible, never mid-edit, never over the voice prompt.
		const id = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			if (document.activeElement?.matches('textarea, input')) return;
			if (crm.tab === 'voice') return;
			load();
		}, 60000);
		const tickId = setInterval(() => (now = Date.now()), 10000);
		return () => {
			clearInterval(id);
			clearInterval(tickId);
		};
	});

	// "Open lead" from a draft lands on the row and scrolls it into view.
	$effect(() => {
		const id = crm.openId;
		if (crm.tab === 'leads' && id) {
			tick().then(() => document.getElementById('l-' + id)?.scrollIntoView({ block: 'start' }));
		}
	});

	const trigger =
		'eyebrow h-auto flex-none rounded-none border-0 px-4 pt-2.5 pb-3 text-[11px] tracking-[.16em] text-mute data-active:bg-transparent data-active:text-foreground data-active:shadow-none hover:text-foreground after:bottom-[-1px] after:h-0.5 after:bg-foreground';
</script>

<svelte:head>
	<title>{SITE.name} // Leads</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-[980px] px-4 pb-24">
	<Tabs.Root bind:value={crm.tab as string} onValueChange={(v) => (crm.tab = v as Tab)}>
		<header class="sticky top-0 z-10 border-b border-hair bg-background pt-[calc(18px+env(safe-area-inset-top))]">
			<div class="flex items-baseline justify-between gap-4">
				<Wordmark suffix="LEADS" />
				<div class="flex items-center gap-1.5">
					<div class="eyebrow num whitespace-nowrap">{stat}</div>
					<Button
						variant="ghost"
						size="icon-xs"
						class="rounded-none text-mute hover:bg-transparent hover:text-foreground"
						aria-label="Refresh"
						onclick={refresh}
					>
						<RefreshCw class="size-3.5 {refreshing ? 'animate-spin' : ''}" />
					</Button>
				</div>
			</div>
			<Tabs.List data-variant="line" class="mt-3 h-auto w-auto justify-start gap-0 rounded-none bg-transparent p-0">
				<Tabs.Trigger value="queue" class={trigger}>
					Queue{#if drafts}<span class="ml-1.5 text-bone">{drafts}</span>{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="leads" class={trigger}>
					Leads{#if crm.data}<span class="ml-1.5 text-bone">{leads}</span>{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="voice" class={trigger}>Voice</Tabs.Trigger>
			</Tabs.List>
		</header>

		{#if crm.loading}
			<div class="pt-6" aria-busy="true" aria-label="Loading">
				{#each [0, 1] as i (i)}
					<div class="mb-3 border border-hair bg-surface p-4">
						<div class="flex gap-2">
							<Skeleton class="h-4 w-14 rounded-none bg-muted" />
							<Skeleton class="h-4 w-14 rounded-none bg-muted" />
							<Skeleton class="h-4 w-14 rounded-none bg-muted" />
						</div>
						<Skeleton class="mt-3 h-4 w-2/3 rounded-none bg-muted" />
						<Skeleton class="mt-2.5 h-3 w-1/2 rounded-none bg-muted" />
						<Skeleton class="mt-2 h-3 w-1/3 rounded-none bg-muted" />
						<Skeleton class="mt-2.5 h-[150px] w-full rounded-none bg-muted" />
						<div class="mt-3 flex gap-2.5">
							<Skeleton class="h-9 w-28 rounded-none bg-muted" />
							<Skeleton class="h-9 w-28 rounded-none bg-muted" />
						</div>
					</div>
				{/each}
			</div>
		{:else if crm.blocked}
			<div class="py-10 text-sm text-mute">
				<b class="font-medium text-foreground">{crm.blocked.title}</b><br />{crm.blocked.body}
			</div>
		{:else}
			<Tabs.Content value="queue"><QueueTab /></Tabs.Content>
			<Tabs.Content value="leads"><LeadsTab /></Tabs.Content>
			<Tabs.Content value="voice"><VoiceTab /></Tabs.Content>
		{/if}
	</Tabs.Root>
</div>
