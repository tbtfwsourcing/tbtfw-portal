<script lang="ts">
	import { portal, go, finish, closeSheet } from '#lib/portal/state.svelte.js';
	import { busy, setBusy } from '#lib/busy.svelte.js';
	import { createLead, type InventoryItem } from '#lib/api/intake.js';
	import { mountWidget, getToken } from '#lib/portal/turnstile.js';
	import { sized } from '#lib/images.js';
	import { FULL, photoOk } from '#lib/portal/photos.svelte.js';
	import { digits, identityLine, formatPhone, money, EMAIL_RE } from '#lib/format.js';
	import { SITE } from '#lib/config.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import FloatField from '#lib/components/FloatField.svelte';
	import ChipGroup from '#lib/components/ChipGroup.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import Submit from './Submit.svelte';

	interface Props {
		open: boolean;
		// The car on screen when the sheet opened; null when asking for any car.
		car: InventoryItem | null;
	}
	let { open, car }: Props = $props();

	const f = portal.buyForm;

	let error = $state('');
	// Per-field messages. A failed submit focuses the field, which on a phone
	// scrolls it under the keyboard, so the message has to sit on the field too.
	let fe = $state<Record<string, string>>({});
	let website = $state(''); // honeypot
	let wantedRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let nameRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let phoneRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let emailRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	// The sheet's content mounts each time it opens, so the widget is bound per opening.
	function turnstile(el: HTMLElement) {
		mountWidget('buy', el);
	}

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
		if (car?.image_url && img.src !== car.image_url) img.src = car.image_url;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy.on) return;
		error = '';
		fe = {};
		const stockId = car ? car.stock_id : '';
		const wanted = f.wanted_text.trim();
		if (!stockId && !wanted) return fail('wanted', 'Tell us the car you are looking for.', wantedRef);
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
			portal.buy = {
				ref: r.ref ?? '',
				id: r.lead_id ?? '',
				identity: r.identity ?? {},
				stock: stockId,
				wanted,
				photo: car && photoOk[car.stock_id] ? sized(car.image_url, FULL) : null
			};
			setBusy(false);
			// Both exits replace the sheet's history entry: Back never reopens a sent form.
			if (f.has_trade) {
				portal.mode = 'trade';
				portal.tradeGroupId = r.trade_group_id ?? '';
				portal.sellForm.full_name = body.full_name as string;
				portal.sellForm.phone = body.phone as string;
				portal.sellForm.email = body.email as string;
				portal.sellForm.consent = true;
				go('sell-car', true);
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

<BottomSheet {open} title={car ? 'Ask about this car' : 'Tell us what you want'} onclose={closeSheet}>
	<form onsubmit={submit} novalidate>
		<div class="hp" aria-hidden="true">
			<label for="buy-website">Leave this empty</label>
			<input type="text" id="buy-website" bind:value={website} tabindex="-1" autocomplete="off" />
		</div>

		{#if car}
			<p class="eyebrow">Asking about</p>
			<div class="mt-3 mb-8 flex items-center gap-4">
				{#if photoOk[car.stock_id]}
					<img
						src={sized(car.image_url, 400)}
						alt=""
						width="72"
						height="48"
						class="h-12 w-[72px] shrink-0 object-cover"
						onerror={thumbFallback}
					/>
				{/if}
				<div class="min-w-0">
					<p class="disp-sm truncate text-[16px]">{[car.year, car.model, car.trim].filter(Boolean).join(' ')}</p>
					<p class="num mt-1 text-[13px] text-bone">{money(car.price, 'Price on request')}</p>
				</div>
			</div>
		{:else}
			<p class="eyebrow">Any car</p>
			<p class="disp mt-3 mb-7 text-[26px]">What should we find for you?</p>
			<FloatField
				textarea
				id="wanted_text"
				label="The car, the spec, the colour"
				rows={2}
				bind:value={f.wanted_text}
				bind:ref={wantedRef}
				error={fe.wanted}
				oninput={() => (fe.wanted = '')}
			/>
		{/if}

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
		{#if car}
			<FloatField
				textarea
				id="buy-message"
				label="Message"
				rows={2}
				hint="Can I see it Saturday? What is the service history?"
				bind:value={f.message}
			/>
		{/if}

		<Toggle id="has_trade" bind:checked={f.has_trade}>I have a car to trade in</Toggle>

		<Collapsible.Root class="my-2 mb-2 border-y border-hair">
			<Collapsible.Trigger
				class="flex min-h-[52px] w-full cursor-pointer items-center justify-between text-[14px] text-mute transition-colors hover:text-foreground [&[data-state=open]>svg]:rotate-180"
			>
				More details, if you like
				<ChevronDownIcon class="size-3.5 transition-transform duration-300" />
			</Collapsible.Trigger>
			<Collapsible.Content class="pt-1 pb-4">
				<ChipGroup name="timeline" label="Timeline" options={['This week', '30 days', 'Just looking']} bind:value={f.timeline} />
				<Toggle id="wants_financing" bind:checked={f.wants_financing}>I would like financing options</Toggle>
				<FloatField id="buy-zip" label="ZIP" type="text" inputmode="numeric" maxlength={5} autocomplete="postal-code" bind:value={f.zip} />
				<ChipGroup name="contact_pref" label="Reach me by" options={['Text', 'Call', 'Email']} bind:value={f.contact_pref} />
				<FloatField id="buy-best_time" label="Best time" type="text" bind:value={f.best_time} />
			</Collapsible.Content>
		</Collapsible.Root>

		<Toggle id="buy-consent" consent required bind:checked={f.consent}>
			I agree to be contacted by {SITE.name} by call, text and email about this inquiry. Message and data rates may apply. Reply STOP to opt out.
		</Toggle>
		<p class="-mt-1 mb-6 pl-[34px] text-xs text-mute">
			We use your details only to reply to this inquiry.
			<a href={SITE.privacy} target="_blank" rel="noopener" class="text-mute underline underline-offset-2 hover:text-bone">Privacy</a>
		</p>
		<div {@attach turnstile}></div>
		{#if error}<p class="mb-4 border-l border-bone pl-3 text-[13px] leading-relaxed text-foreground" role="alert">{error}</p>{/if}
		<Submit disabled={busy.on}>{f.has_trade ? 'Send, then my trade-in' : 'Send'}</Submit>
		<p class="mt-3 text-center text-[12px] text-mute">Usually answered within the hour.</p>
	</form>
</BottomSheet>

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
