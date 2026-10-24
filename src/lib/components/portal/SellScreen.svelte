<script lang="ts">
	import { onMount } from 'svelte';
	import { portal, go, back, railFor, photoCount } from '#lib/portal/state.svelte.js';
	import { busy, setBusy } from '#lib/busy.svelte.js';
	import { createLead, completeLead, putUpload } from '#lib/api/intake.js';
	import { mountWidget, getToken } from '#lib/portal/turnstile.js';
	import { vinValid } from '#lib/vin.js';
	import { digits, groupDigits, formatPhone, EMAIL_RE } from '#lib/format.js';
	import { SITE, MIN_PHOTOS } from '#lib/config.js';
	import Rail from '#lib/components/Rail.svelte';
	import FloatField from '#lib/components/FloatField.svelte';
	import Toggle from '#lib/components/Toggle.svelte';
	import VinField from './VinField.svelte';
	import PhotoSlots from './PhotoSlots.svelte';
	import Submit from './Submit.svelte';

	const f = portal.sellForm;
	const rail = $derived(railFor('sell1'));

	let error = $state('');
	// Per-field messages. A failed submit focuses the field, which on a phone
	// scrolls it under the keyboard, so the message has to sit on the field too.
	let fe = $state<Record<string, string>>({});
	let website = $state('');
	let tsEl = $state<HTMLDivElement | null>(null);
	let mileageRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let askRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let nameRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let phoneRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let emailRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	onMount(() => {
		if (tsEl) mountWidget('sell', tsEl);
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

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy.on) return;
		error = '';
		fe = {};
		const vin = f.vin.toUpperCase();
		// Already created on a previous pass through this screen: just move on.
		if (portal.sell?.id && portal.sell.vin === vin) {
			go('sell2');
			return;
		}
		if (!vinValid(vin)) {
			error = 'Enter the full 17 character VIN. It must pass the check.';
			document.getElementById('vin')?.focus();
			return;
		}
		const mi = digits(f.mileage);
		if (!mi) return fail('mileage', 'Enter the mileage.', mileageRef);
		const ask = digits(f.asking_price);
		if (!ask) return fail('asking', 'Enter what you are looking to get.', askRef);
		if (photoCount() < MIN_PHOTOS) {
			error = 'Add at least three photos.';
			document.getElementById('photos-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return;
		}
		if (!f.full_name.trim()) return fail('name', 'Enter your name.', nameRef);
		if (digits(f.phone).length < 10) return fail('phone', 'Enter a phone number with area code.', phoneRef);
		if (!EMAIL_RE.test(f.email.trim())) return fail('email', 'Enter a valid email address.', emailRef);
		if (!f.consent) {
			error = 'Check the agreement box to send this.';
			return;
		}
		const d = portal.decoded ?? { year: '', make: '', model: '', trim: '' };
		const slots = Object.keys(portal.photos);
		const body: Record<string, unknown> = {
			kind: 'sell',
			source: portal.source,
			website,
			trade_group_id: portal.tradeGroupId || '',
			vin,
			year: d.year,
			make: d.make,
			model: d.model,
			trim: d.trim,
			mileage: mi,
			asking_price: ask,
			photos: slots.map((s) => ({ slot: s, type: portal.photos[s].type })),
			full_name: f.full_name.trim(),
			phone: f.phone.trim(),
			email: f.email.trim(),
			consent: true
		};
		setBusy(true, 'Sending');
		let created = false;
		try {
			const t = await getToken('sell');
			if (t) body.turnstile_token = t;
			const r = await createLead(body);
			if (!r.ok) throw new Error(r.message || 'Could not send.');
			created = true;
			portal.sell = {
				ref: r.ref ?? '',
				id: r.lead_id ?? '',
				identity: r.identity ?? d,
				mileage: mi,
				asking: ask,
				vin
			};
			const dims: Record<string, [number, number]> = {};
			const urls = r.upload_urls ?? [];
			// Progress counts only the slots that actually hold a photo.
			const total = urls.filter((u) => !!portal.photos[u.slot]).length;
			let done = 0;
			if (total) setBusy(true, 'Uploading 0 of ' + total);
			await Promise.all(
				urls.map((u) => {
					const p = portal.photos[u.slot];
					if (!p) return Promise.resolve();
					if (p.w && p.h) dims[u.slot] = [p.w, p.h];
					return putUpload(u.url, p.blob, u.content_type || p.type).then(() => {
						done += 1;
						setBusy(true, 'Uploading ' + done + ' of ' + total);
					});
				})
			);
			setBusy(true, 'Finishing');
			const c = await completeLead(portal.sell.id, dims);
			if (c?.ok) portal.sell.photoCount = c.photo_count;
			setBusy(false);
			go('sell2');
		} catch (err) {
			setBusy(false);
			// The lead exists even if an upload failed; the details step still applies.
			if (created) {
				go('sell2');
				return;
			}
			error =
				err instanceof Error && err.message
					? err.message
					: 'Something went wrong. Check your connection and try again.';
		}
	}
</script>

<Rail label={rail.label} step={rail.step} onback={() => back('sell1')} />
<form onsubmit={submit} novalidate>
	<div class="hp" aria-hidden="true">
		<label for="sell-website">Leave this empty</label>
		<input type="text" id="sell-website" bind:value={website} tabindex="-1" autocomplete="off" />
	</div>

	<h1 class="disp mt-2 mb-5 text-[22px] leading-tight md:text-[26px]">Your car</h1>
	<VinField />
	<FloatField
		id="mileage"
		label="Mileage"
		type="text"
		inputmode="numeric"
		required
		bind:value={f.mileage}
		bind:ref={mileageRef}
		error={fe.mileage}
		oninput={() => (fe.mileage = '')}
		onblur={() => (f.mileage = groupDigits(f.mileage))}
	/>
	<FloatField
		money
		id="asking_price"
		label="What are you looking to get?"
		type="text"
		inputmode="numeric"
		required
		bind:value={f.asking_price}
		bind:ref={askRef}
		error={fe.asking}
		oninput={() => (fe.asking = '')}
		onblur={() => (f.asking_price = groupDigits(f.asking_price))}
	/>

	<h2 id="photos-h" class="disp mt-10 mb-1 scroll-mt-4 text-xs tracking-[.14em] uppercase">Photos</h2>
	<p class="mb-3 text-[15px] text-mute">Three or more. Camera or library, your choice.</p>
	<PhotoSlots />

	<h2 class="disp mt-10 mb-3 text-xs tracking-[.14em] uppercase">Your details</h2>
	<FloatField
		id="sell-full_name"
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
		id="sell-phone"
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
		id="sell-email"
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

	<Toggle id="sell-consent" consent required bind:checked={f.consent}>
		I agree to be contacted by {SITE.name} by call, text and email about this inquiry. Message and data rates may apply. Reply STOP to opt out.
	</Toggle>
	<p class="-mt-1 mb-6 text-xs text-mute">
		We use your details only to reply to this inquiry.
		<a href={SITE.privacy} target="_blank" rel="noopener" class="text-mute underline underline-offset-2 hover:text-bone">Privacy</a>
	</p>
	<div bind:this={tsEl}></div>
	<Submit disabled={busy.on}>Send my car</Submit>
	{#if error}<p class="mt-3 text-sm text-foreground" role="alert">{error}</p>{/if}
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
