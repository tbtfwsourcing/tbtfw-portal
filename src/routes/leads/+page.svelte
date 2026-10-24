<script lang="ts">
	import { onMount, tick } from 'svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Users from '@lucide/svelte/icons/users';
	import Feather from '@lucide/svelte/icons/feather';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { crm, readKey, forgetKey, load, signedIn, type Tab } from '#lib/crm/state.svelte.js';
	import { auth, initAuth, signOut, sessionEmail } from '#lib/crm/auth.svelte.js';
	import { SITE, MS_AUTH_API } from '#lib/config.js';
	import { ago } from '#lib/format.js';
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
	// "graph:garett@tbtfw.com" when Outlook sends, "resend" on the fallback.
	const mailbox = $derived(
		ch.email_via?.startsWith('graph:') ? ch.email_via.slice(6) : ch.email_via === 'resend' ? 'Resend fallback' : ''
	);
	const who = $derived(sessionEmail() || (crm.key ? 'Portal key' : ''));

	// `now` is bumped every 10s so the "Updated …" label re-derives; the
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

	const tabs = $derived([
		{ id: 'queue' as Tab, label: 'Queue', icon: Inbox, count: crm.data ? String(drafts) : '' },
		{ id: 'leads' as Tab, label: 'Leads', icon: Users, count: crm.data ? String(leads) : '' },
		{ id: 'voice' as Tab, label: 'Voice', icon: Feather, count: crm.voice?.v ? 'v' + crm.voice.v : '' }
	]);

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

	function go(t: Tab) {
		crm.tab = t;
		window.scrollTo({ top: 0 });
	}

	onMount(() => {
		readKey();
		const start = async () => {
			if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
				(await import('#lib/crm/demo.js')).installDemo();
			}
			await initAuth();
			await load();
		};
		start();
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

	// "Open lead" from a draft lands on the Leads tab with that lead selected;
	// on a wide screen its row is brought into view in the list.
	$effect(() => {
		const id = crm.openId;
		if (crm.tab === 'leads' && id) {
			tick().then(() => document.getElementById('l-' + id)?.scrollIntoView({ block: 'nearest' }));
		}
	});
</script>

<svelte:head>
	<title>{SITE.name} // Leads</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet dot(on: boolean | undefined)}
	<i
		class="block size-1.5 shrink-0 rounded-full {on
			? 'bg-bone shadow-[0_0_0_3px_color-mix(in_oklab,var(--bone)_18%,transparent)]'
			: 'border border-hair-strong'}"
		aria-hidden="true"
	></i>
{/snippet}

{#snippet channel(name: string, on: boolean | undefined, detail: string)}
	<div class="flex gap-3 py-2">
		<span class="pt-[6px]">{@render dot(on)}</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-baseline justify-between gap-3 text-[13px]">
				<span>{name}</span><span class="mlabel {on ? 'text-bone' : ''}">{on ? 'On' : 'Off'}</span>
			</div>
			<div class="mt-0.5 truncate text-[12px] text-mute" title={detail}>{detail}</div>
		</div>
	</div>
{/snippet}

{#snippet iconButton(label: string, onclick: () => void, Icon: typeof RefreshCw, spin = false, title = '')}
	<Button
		variant="ghost"
		size="icon-xs"
		class="size-11 rounded-none text-mute hover:bg-transparent hover:text-foreground active:text-foreground lg:size-8"
		aria-label={label}
		title={title || label}
		{onclick}
	>
		<Icon class="size-3.5 {spin ? 'animate-spin' : ''}" />
	</Button>
{/snippet}

{#if showSignIn}
	<div class="mx-auto max-w-[980px] px-4 sm:px-6">
		<header class="border-b border-hair pt-[calc(14px+env(safe-area-inset-top))] pb-2 sm:pt-[calc(18px+env(safe-area-inset-top))]">
			<Wordmark suffix="Leads" />
		</header>
		<SignIn onsignedin={afterSignIn} />
	</div>
{:else}
	<div class="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
		<!-- Desktop rail: where you are, what is switched on, who you are. -->
		<aside class="sticky top-0 hidden h-dvh flex-col border-r border-hair px-4 pt-7 pb-5 lg:flex">
			<div class="px-2"><Wordmark suffix="Leads" /></div>

			<nav class="mt-9 flex flex-col gap-0.5" aria-label="CRM">
				{#each tabs as t (t.id)}
					{@const active = crm.tab === t.id}
					<button
						type="button"
						class="relative flex h-10 cursor-pointer items-center gap-3 px-3 text-left text-[13.5px] transition-colors {active
							? 'bg-surface-2 text-foreground'
							: 'text-mute hover:bg-surface hover:text-foreground'}"
						aria-current={active ? 'page' : undefined}
						onclick={() => go(t.id)}
					>
						{#if active}<span class="absolute inset-y-2 left-0 w-px bg-bone" aria-hidden="true"></span>{/if}
						<t.icon class="size-4 {active ? 'text-bone' : ''}" strokeWidth={1.5} />
						<span class="flex-1">{t.label}</span>
						<span class="mono text-[11px] {active && t.id === 'queue' && drafts ? 'text-bone' : 'text-mute'}">{t.count}</span>
					</button>
				{/each}
			</nav>

			{#if ready}
				<section class="mt-10 px-2" aria-label="Channels">
					<p class="mlabel mb-1.5">Sending</p>
					{@render channel('Email', ch.email, ch.email ? mailbox || 'Connected' : 'Mailbox not connected')}
					{@render channel('Text', ch.sms, ch.sms ? 'Twilio' : 'Waiting on number approval')}
					{#if !ch.email && crm.key}
						<a
							href="{MS_AUTH_API}/start?k={encodeURIComponent(crm.key)}"
							class="mt-2 inline-flex items-center gap-1.5 text-[12px] text-bone underline decoration-bone/40 underline-offset-4 hover:decoration-bone"
						>
							Connect the mailbox <ArrowUpRight class="size-3" />
						</a>
					{/if}
				</section>
			{/if}

			<div class="mt-auto border-t border-hair px-2 pt-4">
				{#if who}<p class="truncate text-[12.5px]" title={who}>{who}</p>{/if}
				<div class="-mr-2 mt-1 flex items-center justify-between gap-2">
					<span class="mlabel normal-case tracking-normal">{updated ? 'Updated ' + updated : ''}</span>
					<div class="flex">
						{#if signedIn()}{@render iconButton('Refresh', refresh, RefreshCw, refreshing)}{/if}
						{#if auth.session}{@render iconButton('Sign out', leave, LogOut, false, 'Sign out ' + who)}{/if}
					</div>
				</div>
			</div>
		</aside>

		<div class="min-w-0">
			<!-- Phone and tablet: wordmark, channel state and the three tabs, pinned. -->
			<header
				class="sticky top-0 z-20 border-b border-hair bg-background/85 px-4 pt-[calc(10px+env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 lg:hidden"
			>
				<div class="flex items-center justify-between gap-3">
					<Wordmark suffix="Leads" />
					<div class="-mr-3 flex items-center">
						{#if ready}
							<div class="mlabel mr-1.5 flex items-center gap-3.5">
								<span class="inline-flex items-center gap-1.5">{@render dot(ch.email)}Email</span>
								<span class="inline-flex items-center gap-1.5">{@render dot(ch.sms)}Text</span>
							</div>
						{/if}
						{#if signedIn()}{@render iconButton('Refresh', refresh, RefreshCw, refreshing)}{/if}
						{#if auth.session}{@render iconButton('Sign out', leave, LogOut, false, 'Sign out ' + who)}{/if}
					</div>
				</div>
				<nav class="mt-1 flex" aria-label="CRM">
					{#each tabs as t (t.id)}
						{@const active = crm.tab === t.id}
						<button
							type="button"
							class="relative flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 pb-1 text-[11px] font-medium tracking-[.18em] uppercase transition-colors sm:flex-none sm:justify-start sm:pr-8 {active
								? 'text-foreground'
								: 'text-mute'}"
							aria-current={active ? 'page' : undefined}
							onclick={() => go(t.id)}
						>
							{t.label}
							{#if t.count && t.id !== 'voice'}<span class="mono text-[11px] tracking-normal {t.id === 'queue' && drafts ? 'text-bone' : ''}">{t.count}</span>{/if}
							{#if active}<span class="absolute inset-x-0 bottom-[-1px] h-px bg-foreground sm:right-8" aria-hidden="true"></span>{/if}
						</button>
					{/each}
				</nav>
			</header>

			<main class="mx-auto max-w-[1180px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-10">
				{#if crm.loading || !auth.ready}
					<div class="pt-6 lg:pt-0" aria-busy="true" aria-label="Loading">
						<Skeleton class="mb-8 hidden h-8 w-40 rounded-none bg-muted lg:block" />
						{#each [0, 1] as i (i)}
							<div class="mb-4 grid border border-hair bg-surface lg:grid-cols-[5fr_7fr]">
								<div class="p-5 lg:p-6">
									<Skeleton class="h-3 w-40 rounded-none bg-muted" />
									<Skeleton class="mt-5 h-6 w-2/3 rounded-none bg-muted" />
									<Skeleton class="mt-3 h-3 w-1/2 rounded-none bg-muted" />
									<Skeleton class="mt-6 h-3 w-5/6 rounded-none bg-muted" />
									<Skeleton class="mt-2.5 h-3 w-2/3 rounded-none bg-muted" />
								</div>
								<div class="border-t border-hair p-5 lg:border-t-0 lg:border-l lg:p-6">
									<Skeleton class="h-3 w-48 rounded-none bg-muted" />
									<Skeleton class="mt-4 h-[150px] w-full rounded-none bg-muted" />
									<div class="mt-4 flex gap-2.5">
										<Skeleton class="h-10 w-36 rounded-none bg-muted" />
										<Skeleton class="h-10 w-28 rounded-none bg-muted" />
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else if crm.blocked}
					<div class="max-w-[52ch] py-12 text-[14px] leading-relaxed text-mute lg:py-4">
						<p class="disp mb-3 text-[22px] text-foreground">{crm.blocked.title}</p>
						{crm.blocked.body}
						{#if auth.session}
							<div class="mt-6">
								<Button variant="hairline" size="house" onclick={leave}>Sign out</Button>
							</div>
						{/if}
					</div>
				{:else}
					<!-- All three stay mounted, so an edited draft or voice survives a look at another tab. -->
					<div hidden={crm.tab !== 'queue'}><QueueTab /></div>
					<div hidden={crm.tab !== 'leads'}><LeadsTab /></div>
					<div hidden={crm.tab !== 'voice'}><VoiceTab /></div>
				{/if}
			</main>
		</div>
	</div>
{/if}
