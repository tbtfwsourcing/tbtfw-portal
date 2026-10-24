<script lang="ts">
	import type { Snippet } from 'svelte';
	import TopBar from './TopBar.svelte';

	interface Props {
		eyebrow: string;
		title: string;
		lede?: string;
		// "1 / 4" and the progress hairline. Left out on the optional step.
		step?: { n: number; of: number };
		// Shown where the step counter would be, on a step without one.
		aside?: string;
		error?: string;
		onback?: () => void;
		onsubmit: (e: SubmitEvent) => void;
		children: Snippet;
		dock: Snippet;
	}
	let { eyebrow, title, lede, step, aside, error = '', onback, onsubmit, children, dock }: Props = $props();
</script>

<!-- One question per screen: the question in display type, its fields, and one button under the thumb. -->
<form class="step" {onsubmit} novalidate>
	<TopBar {onback} progress={step ? step.n / step.of : undefined}>
		{#snippet right()}
			{#if step}<span class="num">{step.n} / {step.of}</span>{:else if aside}<span>{aside}</span>{/if}
		{/snippet}
	</TopBar>
	<div class="body rise">
		<p class="eyebrow">{eyebrow}</p>
		<h1 class="disp q">{title}</h1>
		{#if lede}<p class="lede">{lede}</p>{/if}
		<div class="fields">{@render children()}</div>
		{#if error}<p class="err" role="alert">{error}</p>{/if}
	</div>
	{@render dock()}
</form>

<style>
	.step {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	.body {
		width: 100%;
		max-width: 560px;
		margin: 0 auto;
		padding: 40px 24px 8px;
	}
	.q {
		margin-top: 14px;
		font-size: 36px;
		text-wrap: balance;
	}
	.lede {
		margin-top: 14px;
		max-width: 30em;
		font-size: 14px;
		line-height: 1.55;
		color: var(--mute);
	}
	.fields {
		margin-top: 36px;
	}
	.err {
		margin-top: 4px;
		border-left: 1px solid var(--bone);
		padding-left: 12px;
		font-size: 13px;
		line-height: 1.6;
	}
	@media (min-width: 900px) {
		.body {
			padding-top: 9vh;
		}
		.q {
			font-size: 52px;
		}
		.lede {
			font-size: 15px;
		}
		.fields {
			margin-top: 48px;
		}
	}
</style>
