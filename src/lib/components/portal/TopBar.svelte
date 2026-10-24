<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { go } from '#lib/portal/state.svelte.js';
	import { SITE } from '#lib/config.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';

	interface Props {
		onback?: () => void;
		// Over a photo: no ground of its own, the photo's scrim keeps it legible.
		overlay?: boolean;
		// 0..1. Draws the bone hairline under the bar on the sell steps.
		progress?: number;
		right?: Snippet;
	}
	let { onback, overlay = false, progress, right }: Props = $props();

	// The wordmark keeps the customer in the portal: it goes to the portal's own
	// home screen. A modified click (new tab) still gets the real link.
	function home(e: MouseEvent) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		if ((page.state.screen ?? 'choice') === 'choice') window.scrollTo({ top: 0, behavior: 'smooth' });
		else go('choice');
	}
</script>

<header class="bar" class:overlay>
	<div class="row">
		<div class="side">
			{#if onback}
				<!-- 44px hit area that runs past the icon, so a thumb at the screen edge still lands. -->
				<button type="button" class="back" onclick={onback} aria-label="Back">
					<ArrowLeftIcon class="size-[18px]" aria-hidden="true" />
				</button>
			{/if}
		</div>
		<a href={resolve('/')} class="brand mark" aria-label="{SITE.name}, home" onclick={home}>
			{SITE.name}
		</a>
		<div class="side r">{@render right?.()}</div>
	</div>
	{#if progress !== undefined}
		<div class="track" aria-hidden="true"><i style:transform="scaleX({progress})"></i></div>
	{/if}
</header>

<style>
	.bar {
		position: relative;
		z-index: 10;
		padding: env(safe-area-inset-top) 12px 0;
	}
	.bar.overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		height: 56px;
	}
	.side {
		display: flex;
		align-items: center;
		min-width: 0;
		font-size: 11px;
		letter-spacing: 0.18em;
		color: #c4c4c2;
	}
	.side.r {
		justify-content: flex-end;
		padding-right: 12px;
	}
	.back {
		display: inline-grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--fg);
		cursor: pointer;
		transition: color 0.2s;
	}
	.back:hover,
	.back:active {
		color: var(--bone);
	}
	.mark {
		font-size: 13px;
		letter-spacing: 0.16em;
		color: var(--fg);
		text-decoration: none;
		padding: 12px 4px;
		transition: opacity 0.2s;
	}
	.mark:hover {
		opacity: 0.7;
	}
	.track {
		height: 1px;
		margin: 0 12px;
		background: var(--hair-strong);
		overflow: hidden;
	}
	.track i {
		display: block;
		height: 1px;
		background: var(--bone);
		transform-origin: left;
		transition: transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	@media (min-width: 900px) {
		.bar {
			padding-left: 28px;
			padding-right: 28px;
		}
		.row {
			height: 72px;
		}
		.mark {
			font-size: 14px;
		}
	}
</style>
