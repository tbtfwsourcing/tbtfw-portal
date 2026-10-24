<script lang="ts">
	import { onMount } from 'svelte';
	import { portal, go, back, finish, railFor } from '#lib/portal/state.svelte.js';
	import { busy, setBusy } from '#lib/busy.svelte.js';
	import { createLead } from '#lib/api/intake.js';
	import { mountWidget, getToken } from '#lib/portal/turnstile.js';
	import { sized } from '#lib/images.js';
	import { digits, identityLine, formatPhone, EMAIL_RE } from '#lib/format.js';
	import { SITE } from '#lib/config.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import Rail from '#lib/components/Rail.svelte';
	import FloatField from '#lib/components/FloatField.svelte';
	import ChipGroup from '#lib/components/ChipGroup.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import InventoryPicker from './InventoryPicker.svelte';
	import Submit from './Submit.svelte';

	const f = portal.buyForm;
	const rail = $derived(railFor('buy'));

	// The car the customer picked, for the summary pinned above the submit button.
	const picked = $derived(
		f.stock_id && f.stock_id !== 'other' ? (portal.inv.find((i) => i.stock_id === f.stock_id) ?? null) : null
	);

	let error = $state('');
	// Per-field messages. A failed submit focuses the field, which on a phone
	// scrolls it under the keyboard, so the message has to sit on the field too.
	let fe = $state<Record<string, string>>({});
	let website = $state(''); // honeypot
	let tsEl = $state<HTMLDivElement | null>(null);
	let nameRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let phoneRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let emailRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	onMount(() => {
		if (tsEl) mountWidget('buy', tsEl);
	});

	// Inline checks on blur. Submit re-validates everything regardless.
	function checkPhone() {
		fe.phone = f.phone && digits(f.phone).length < 10 ? 'Enter a phone number with area code.' : '';
	}
	function checkEmail() {
		const v = f.email.trim();
		fe.email = v && !EMAIL_RE.test(v) ? 'Enter a valid email address.' : '';
	}
	function fail(field: string, msg: string, ref: { focus(): void } | null) {
		error = msg;
		fe[field] = msg;
		ref?.focus();
	}

	// The 400px rendition may not exist for every car; fall back to the full image.
	function thumbFallback(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		const full = picked?.image_url;
		if (full && img.src !== full) img.src = full;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy.on) return;
		error = '';
		fe = {};
		const stockId = f.stock_id && f.stock_id !== 'other' ? f.stock_id : '';
		const wanted = f.wanted_text.trim();
		if (!stockId && !wanted) {
			error = 'Pick a car, or choose "something not listed" and tell us what you want.';
			return;
		}
		if (!f.full_name.trim()) return fail('name', 'Enter your name.', nameRef);
		if (digits(f.phone).length < 10) return fail('phone', 'Enter a phone number with area code.', phoneRef);
		if (!EMAIL_RE.test(f.email.trim())) return fail('email', 'Enter a valid email address.', emailRef);
		if (!f.consent) {
			error = 'Check the agreement box to send this.';
			return;
		}
		const body: Record<string, unknown> = {
			kind: 'buy',
			source: portal.source,
			website,
			stock_id: stockId,
			wanted_text: stockId ? '' : wanted,
			full_name: f.full_name.trim(),
			phone: f.phone.trim(),
			email: f.email.trim(),
			message: f.message.trim(),
			has_trade: f.has_trade,
			timeline: f.timeline,
			wants_financing: f.wants_financing,
			zip: digits(f.zip),
			contact_pref: f.contact_pref,
			best_time: f.best_time.trim(),
			consent: true
		};
		setBusy(true, 'Sending');
		try {
			const t = await getToken('buy');
			if (t) body.turnstile_token = t;
			const r = await createLead(body);
			if (!r.ok) throw new Error(r.message || 'Could not send.');
			const inv = portal.inv.find((i) => i.stock_id === stockId);
			portal.buy = {
				ref: r.ref ?? '',
				id: r.lead_id ?? '',
				identity: r.identity ?? {},
				stock: stockId,
				wanted,
				photo: inv ? sized(inv.image_url, 1280) : null
			};
			setBusy(false);
			if (f.has_trade) {
				portal.mode = 'trade';
				portal.tradeGroupId = r.trade_group_id ?? '';
				portal.sellForm.full_name = body.full_name as string;
				portal.sellForm.phone = body.phone as string;
				portal.sellForm.email = body.email as string;
				portal.sellForm.consent = true;
				go('sell1');
			} else {
				finish(
					portal.buy.ref,
					portal.buy.photo,
					identityLine(portal.buy.identity) || (wanted ? 'Wanted // ' + wanted : ''),
					''
				);
			}
		} catch (err) {
			setBusy(false);
			error =
				err instanceof Error && err.message
					? err.message
					: 'Something went wrong. Check your connection and try again.';
		}
	}
</script>

<Rail label={rail.label} step={rail.step} onback={() => back('buy')} />
<form onsubmit={submit} novalidate>
	<div class="hp" aria-hidden="true">
		<label for="buy-website">Leave this empty</label>
		<input type="text" id="buy-website" bind:value={website} tabindex="-1" autocomplete="off" />
	</div>

	<h1 class="disp mt-3 mb-7 text-[32px] md:text-[42px]">Which car</h1>
	<InventoryPicker />

	<h2 class="section-head mb-5">Your details</h2>
	<FloatField
		id="buy-full_name"
		label="Name"
		type="text"
		autocomplete="name"
		autocapitalize="words"
		required
		bind:value={f.full_name}
		bind:ref={nameRef}
		error={fe.name}
		oninput={() => (fe.name = '')}
	/>
	<FloatField
		id="buy-phone"
		label="Phone"
		type="tel"
		autocomplete="tel"
		inputmode="tel"
		required
		bind:value={f.phone}
		bind:ref={phoneRef}
		error={fe.phone}
		oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
			f.phone = formatPhone(e.currentTarget.value);
			fe.phone = '';
		}}
		onblur={checkPhone}
	/>
	<FloatField
		id="buy-email"
		label="Email"
		type="email"
		autocomplete="email"
		autocapitalize="none"
		autocorrect="off"
		inputmode="email"
		required
		bind:value={f.email}
		bind:ref={emailRef}
		error={fe.email}
		oninput={() => (fe.email = '')}
		onblur={checkEmail}
	/>
	<FloatField
		textarea
		id="buy-message"
		label="Message"
		rows={3}
		hint="Is it still available, can I see it Saturday, what is the service history"
		bind:value={f.message}
	/>

	<Collapsible.Root class="my-2 mb-8 border-y border-hair">
		<Collapsible.Trigger
			class="flex min-h-[56px] w-full cursor-pointer items-center justify-between text-[14px] text-foreground transition-colors hover:text-bone [&[data-state=open]>svg]:rotate-180"
		>
			A few more details
			<ChevronDownIcon class="size-3.5 text-mute transition-transform duration-300" />
		</Collapsible.Trigger>
		<Collapsible.Content class="pt-1 pb-4">
			<Toggle id="has_trade" bind:checked={f.has_trade}>I have a trade-in</Toggle>
			<ChipGroup name="timeline" label="Timeline" options={['This week', '30 days', 'Just looking']} bind:value={f.timeline} />
			<Toggle id="wants_financing" bind:checked={f.wants_financing}>I would like financing options</Toggle>
			<FloatField id="buy-zip" label="ZIP" type="text" inputmode="numeric" maxlength={5} autocomplete="postal-code" bind:value={f.zip} />
			<ChipGroup name="contact_pref" label="Reach me by" options={['Text', 'Call', 'Email']} bind:value={f.contact_pref} />
			<FloatField id="buy-best_time" label="Best time" type="text" bind:value={f.best_time} />
		</Collapsible.Content>
	</Collapsible.Root>

	<Card.Root size="sm" class="mb-6 gap-3">
		<Card.Content>
		<p class="eyebrow mb-3">Asking about</p>
		<div class="flex items-center gap-4">
			{#if picked?.image_url}
				<img
					src={sized(picked.image_url, 400)}
					alt=""
					width="64"
					height="48"
					class="h-12 w-16 shrink-0 object-cover"
					onerror={thumbFallback}
				/>
			{/if}
			{#if picked}
				<p class="disp-sm text-[15px]">{identityLine(picked)}</p>
			{:else if f.stock_id === 'other'}
				<p class="disp-sm text-[15px]">Something not listed</p>
			{:else}
				<p class="disp-sm text-[15px] text-mute">Pick a car above</p>
			{/if}
		</div>
		</Card.Content>
	</Card.Root>

	<Toggle id="buy-consent" consent required bind:checked={f.consent}>
		I agree to be contacted by {SITE.name} by call, text and email about this inquiry. Message and data rates may apply. Reply STOP to opt out.
	</Toggle>
	<p class="-mt-1 mb-6 pl-[34px] text-xs text-mute">
		We use your details only to reply to this inquiry.
		<a href={SITE.privacy} target="_blank" rel="noopener" class="text-mute underline underline-offset-2 hover:text-bone">Privacy</a>
	</p>
	<div bind:this={tsEl}></div>
	{#if error}<p class="mb-4 border-l border-bone pl-3 text-[13px] leading-relaxed text-foreground" role="alert">{error}</p>{/if}
	<Submit disabled={busy.on}>Ask about this car</Submit>
</form>

<style>
	.hp {
		position: absolute;
		left: -9999px;
		top: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
</style>
