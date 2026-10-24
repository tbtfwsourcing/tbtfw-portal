<script lang="ts">
	import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';

	type Shared = {
		id: string;
		label: string;
		value?: string;
		hint?: string;
		error?: string;
		money?: boolean;
		ref?: HTMLInputElement | HTMLTextAreaElement | null;
		class?: string;
	};
	type Props = Shared &
		(
			| ({ textarea: true } & Omit<HTMLTextareaAttributes, 'value' | 'class'>)
			| ({ textarea?: false } & Omit<HTMLInputAttributes, 'value' | 'class'>)
		);

	let {
		id,
		label,
		value = $bindable(''),
		hint,
		error,
		money = false,
		ref = $bindable(null),
		class: className = '',
		textarea = false,
		...rest
	}: Props = $props();

	const invalid = $derived(error ? 'true' : undefined);

	// The phone keyboard's return key reads "next" and moves to the next field,
	// the way a native form does, instead of submitting a half-filled form.
	// A field that passes its own enterkeyhint ("done", "send") keeps the default.
	const inputRest = $derived(rest as HTMLInputAttributes);
	const hint_ = $derived(inputRest.enterkeyhint ?? 'next');

	function onkeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		inputRest.onkeydown?.(e);
		if (e.defaultPrevented || e.key !== 'Enter' || hint_ !== 'next') return;
		const form = e.currentTarget.form;
		if (!form) return;
		const fields = Array.from(
			form.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([tabindex="-1"]), textarea, select')
		).filter((el) => !el.hidden && el.offsetParent !== null);
		const next = fields[fields.indexOf(e.currentTarget) + 1];
		if (!next) return;
		e.preventDefault();
		next.focus();
	}
</script>

<div class="field {className}" class:money>
	{#if textarea}
		<textarea
			bind:this={ref}
			{id}
			bind:value
			placeholder=" "
			aria-invalid={invalid}
			aria-describedby={hint ? id + '-hint' : undefined}
			{...rest as HTMLTextareaAttributes}
		></textarea>
	{:else}
		<input
			bind:this={ref}
			{id}
			bind:value
			placeholder=" "
			aria-invalid={invalid}
			aria-describedby={hint ? id + '-hint' : undefined}
			{...inputRest}
			enterkeyhint={hint_}
			{onkeydown}
		/>
	{/if}
	<label for={id}>{label}</label>
	{#if error}
		<span class="fe" role="alert">{error}</span>
	{:else if hint}
		<span class="hint" id="{id}-hint">{hint}</span>
	{/if}
</div>

<style>
	/* The portal's one bespoke control: an underline field whose label lifts
	   into an eyebrow on focus or once it holds a value. */
	.field {
		position: relative;
		margin: 0 0 24px;
	}
	.field label {
		position: absolute;
		left: 0;
		top: 16px;
		color: var(--mute);
		font-size: 16px;
		line-height: 1.45;
		pointer-events: none;
		transition:
			transform 0.15s ease-out,
			color 0.15s,
			font-size 0.15s,
			letter-spacing 0.15s;
		transform-origin: left top;
	}
	.field input,
	.field textarea {
		display: block;
		width: 100%;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--hair);
		border-radius: 0;
		padding: 22px 0 10px;
		font: inherit;
		font-size: 16px;
		line-height: 1.45;
		color: var(--fg);
		outline: none;
	}
	.field textarea {
		min-height: 88px;
		resize: vertical;
	}
	.field input::placeholder,
	.field textarea::placeholder {
		color: transparent;
	}
	.field input:focus,
	.field textarea:focus {
		border-bottom-color: var(--bone);
	}
	.field input:focus + label,
	.field input:not(:placeholder-shown) + label,
	.field textarea:focus + label,
	.field textarea:not(:placeholder-shown) + label {
		transform: translateY(-16px);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.field input:focus + label,
	.field textarea:focus + label {
		color: var(--bone);
	}
	.field input[aria-invalid='true'],
	.field textarea[aria-invalid='true'] {
		border-bottom-color: var(--fg);
	}
	.hint {
		display: block;
		margin-top: 8px;
		color: var(--mute);
		font-size: 13px;
	}
	.fe {
		display: block;
		margin-top: 8px;
		color: var(--fg);
		font-size: 14px;
	}
	.money input {
		padding-left: 14px;
	}
	.money::before {
		content: '$';
		position: absolute;
		left: 0;
		top: 23px;
		color: var(--mute);
		font-size: 16px;
	}
	.money label {
		left: 14px;
	}
	.money input:focus + label,
	.money input:not(:placeholder-shown) + label {
		left: 0;
	}
</style>
