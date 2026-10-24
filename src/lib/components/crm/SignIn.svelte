<script lang="ts">
	import { sendCode, verifyCode, allowedEmail } from '#lib/crm/auth.svelte.js';
	import { CRM_EMAIL_DOMAIN } from '#lib/config.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import FloatField from '#lib/components/FloatField.svelte';

	let { onsignedin }: { onsignedin: () => void } = $props();

	let email = $state('');
	let code = $state('');
	let step = $state<'email' | 'code'>('email');
	let busy = $state(false);
	let error = $state('');
	let codeRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	async function send(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!allowedEmail(email)) {
			error = 'Use your @' + CRM_EMAIL_DOMAIN + ' address.';
			return;
		}
		busy = true;
		const err = await sendCode(email);
		busy = false;
		if (err) {
			error = err;
			return;
		}
		step = 'code';
		queueMicrotask(() => codeRef?.focus());
	}

	async function verify(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (code.replace(/\D/g, '').length < 6) {
			error = 'Enter the six-digit code from the email.';
			return;
		}
		busy = true;
		const err = await verifyCode(email, code);
		busy = false;
		if (err) {
			error = /expired|invalid/i.test(err) ? 'That code is not right or has expired. Send a new one.' : err;
			return;
		}
		onsignedin();
	}

	function restart() {
		step = 'email';
		code = '';
		error = '';
	}
</script>

<section class="mx-auto max-w-[400px] pt-14 pb-24" aria-label="Sign in">
	<p class="section-head mt-0 mb-5">Sign in</p>
	{#if step === 'email'}
		<h1 class="disp mb-3 text-[32px]">Your TBTFW email</h1>
		<p class="mb-8 text-[14px] leading-relaxed text-mute">We will send a six-digit code. No password.</p>
		<form onsubmit={send} novalidate>
			<FloatField
				id="si-email"
				label="Email"
				type="email"
				autocomplete="email"
				inputmode="email"
				required
				bind:value={email}
				oninput={() => (error = '')}
			/>
			{#if error}<p class="mb-4 border-l border-bone pl-3 text-[13px] leading-relaxed" role="alert">{error}</p>{/if}
			<Button type="submit" variant="house" size="cta" disabled={busy}>{busy ? 'Sending' : 'Send code'}</Button>
		</form>
	{:else}
		<h1 class="disp mb-3 text-[32px]">Check your email</h1>
		<p class="mb-8 text-[14px] leading-relaxed text-mute">
			A code is on its way to <span class="text-foreground">{email.trim()}</span>. Enter it here, or tap the link in the email.
		</p>
		<form onsubmit={verify} novalidate>
			<FloatField
				id="si-code"
				label="Six-digit code"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength={6}
				required
				class="num"
				bind:value={code}
				bind:ref={codeRef}
				oninput={() => (error = '')}
			/>
			{#if error}<p class="mb-4 border-l border-bone pl-3 text-[13px] leading-relaxed" role="alert">{error}</p>{/if}
			<Button type="submit" variant="house" size="cta" disabled={busy}>{busy ? 'Checking' : 'Sign in'}</Button>
			<Button type="button" variant="quiet" class="mt-2 h-auto min-h-[52px] w-full border-t border-t-hair text-[13px] font-normal" disabled={busy} onclick={restart}>
				Use a different email or send a new code
			</Button>
		</form>
	{/if}
</section>
