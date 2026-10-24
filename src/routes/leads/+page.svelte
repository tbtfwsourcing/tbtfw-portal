<script lang="ts">
	import { onMount, tick } from 'svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { crm, readKey, forgetKey, load, signedIn, type Tab } from '#lib/crm/state.svelte.js';
	import { auth, initAuth, signOut, sessionEmail } from '#lib/crm/auth.svelte.js';
	import { SITE } from '#lib/config.js';
	import { ago } from '#lib/format.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import QueueTab from '#lib/components/crm/QueueTab.svelte';
	import LeadsTab from '#lib/components/crm/LeadsTab.svelte';
	import VoiceTab from '#lib/components/crm/VoiceTab.svelte';
	import SignIn from '#lib/components/crm/SignIn.svelte';

	const drafts = $derived(crm.data?.drafts.length ?? 0);
	const leads = $derived(crm.data?.leads.length ?? 0);
	const ch = $derived(crm.data?.channels ?? {});

	// `now` is bumped every 10s so the "UPDATED …" label re-derives; the
	// clamp covers the moment right after a load, when lastLoaded is newer than now.
	let now = $state(Date.now());
	const updated = $derived.by(() => {
		if (!crm.lastLoaded) return '';
		const s = Math.max(0, Math.floor((now - crm.lastLoaded) / 1000));
		if (s < 10) return 'just now';
		if (s < 60) return s + 's ago';
		return ago(new Date(crm.lastLoaded).toISOString());
	});
	const ready = $derived(!crm.loading && !crm.blocked && signedIn());
	const showSignIn = $derived(auth.ready && !crm.loading && !signedIn());

	// The sticky header's height, so a lead scrolled into view lands below it (see LeadRow).
	let headerH = $state(0);
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

	// After sign-in or sign-out the queue is reloaded from scratch.
	async function afterSignIn() {
		crm.loading = true;
		await load();
	}
	async function leave() {
		await signOut();
		forgetKey();
		crm.data = null;
		crm.blocked = null;
		crm.openId = null;
		crm.loading = false;
	}

	onMount(() => {
		readKey();
		initAuth().then(load);
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
			tick().then(() => document.getElementById('l-' + id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
		}
	});

	// On phones the three tabs share the width as thumb-height segments; from sm: they hug their labels.
	const trigger =
		'eyebrow h-auto min-h-11 flex-1 rounded-none border-0 px-0 pt-2.5 pb-3.5 text-[11px] tracking-[.18em] text-mute transition-colors data-active:bg-transparent data-active:text-foreground data-active:shadow-none hover:text-foreground active:text-foreground after:bottom-[-1px] after:h-px after:bg-foreground sm:min-h-0 sm:flex-none';
</script>

<svelte:head>
	<title>{SITE.name} // Leads</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-[980px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-5" style:--hdr="{headerH}px">
	<Tabs.Root bind:value={crm.tab as string} onValueChange={(v) => (crm.tab = v as Tab)}>
		<header bind:clientHeight={headerH} class="sticky top-0 z-10 border-b border-hair bg-background pt-[calc(14px+env(safe-area-inset-top))] sm:pt-[calc(18px+env(safe-area-inset-top))]">
			<!-- On a phone the status row drops under the wordmark; from sm: it sits on the same line. -->
			<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
				<Wordmark suffix="Leads" />
				<!-- Refresh and sign out are 44px squares on phones; the negative margins keep the icons where they sit at 24px. -->
				<div class="-mr-2.5 flex min-w-0 items-center gap-1 sm:mr-0 sm:gap-4">
					{#if ready}
						<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tracking-[.16em] text-mute uppercase">
							<span class="num hidden sm:inline"><b class="font-medium text-foreground">{drafts}</b> to approve</span>
							<span class="inline-flex items-center gap-1.5">
								<i class="size-1.5 rounded-full {ch.email ? 'bg-bone' : 'border border-hair-strong'}" aria-hidden="true"></i>
								Email {ch.email ? 'on' : 'off'}
							</span>
							<span class="inline-flex items-center gap-1.5">
								<i class="size-1.5 rounded-full {ch.sms ? 'bg-bone' : 'border border-hair-strong'}" aria-hidden="true"></i>
								Text {ch.sms ? 'on' : 'off'}
							</span>
							{#if updated}<span class="num hidden md:inline">Updated {updated}</span>{/if}
						</div>
					{/if}
					{#if signedIn()}
						<Button
							variant="ghost"
							size="icon-xs"
							class="-my-2.5 size-11 rounded-none text-mute hover:bg-transparent hover:text-foreground active:text-foreground sm:my-0 sm:size-6"
							aria-label="Refresh"
							onclick={refresh}
						>
							<RefreshCw class="size-3.5 {refreshing ? 'animate-spin' : ''}" />
						</Button>
					{/if}
					{#if auth.session}
						<Button
							variant="ghost"
							size="icon-xs"
							class="-my-2.5 size-11 rounded-none text-mute hover:bg-transparent hover:text-foreground active:text-foreground sm:my-0 sm:size-6"
							aria-label="Sign out {sessionEmail()}"
							title={sessionEmail()}
							onclick={leave}
						>
							<LogOut class="size-3.5" />
						</Button>
					{/if}
				</div>
			</div>
			<Tabs.List data-variant="line" class="mt-3 flex h-auto w-full justify-start gap-7 rounded-none bg-transparent p-0 sm:mt-4 sm:inline-flex sm:w-auto {signedIn() ? '' : 'invisible'}">
				<Tabs.Trigger value="queue" class={trigger}>
					Queue{#if drafts}<span class="ml-2 text-bone">{drafts}</span>{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="leads" class={trigger}>
					Leads{#if crm.data}<span class="ml-2 text-bone">{leads}</span>{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="voice" class={trigger}>Voice</Tabs.Trigger>
			</Tabs.List>
		</header>

		{#if showSignIn}
			<SignIn onsignedin={afterSignIn} />
		{:else if crm.loading || !auth.ready}
			<div class="pt-6" aria-busy="true" aria-label="Loading">
				{#each [0, 1] as i (i)}
					<div class="mb-4 border border-hair bg-surface p-5">
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
			<div class="max-w-[52ch] py-12 text-[14px] leading-relaxed text-mute">
				<p class="disp mb-3 text-[22px] text-foreground">{crm.blocked.title}</p>
				{crm.blocked.body}
				{#if auth.session}
					<div class="mt-6">
						<Button variant="hairline" size="house" onclick={leave}>Sign out</Button>
					</div>
				{/if}
			</div>
		{:else}
			<Tabs.Content value="queue"><QueueTab /></Tabs.Content>
			<Tabs.Content value="leads"><LeadsTab /></Tabs.Content>
			<Tabs.Content value="voice"><VoiceTab /></Tabs.Content>
		{/if}
	</Tabs.Root>
</div>
