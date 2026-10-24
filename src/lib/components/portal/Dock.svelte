<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		// A quiet line under the button: a hint, or a secondary action.
		below?: Snippet;
		// Pinned to the bottom of a fixed-height parent (the showroom) instead of sticking in the flow.
		pinned?: boolean;
		children: Snippet;
	}
	let { below, pinned = false, children }: Props = $props();
</script>

<!-- The one call to action on every screen, always under the thumb. -->
<div class="dock" class:pinned>
	<div class="inner">
		{@render children()}
		<!-- Always there, empty or not, so the button sits at the same height on every step. -->
		<div class="below">{@render below?.()}</div>
	</div>
</div>

<style>
	.dock {
		position: sticky;
		bottom: 0;
		z-index: 5;
		margin-top: auto;
		padding: 28px 20px calc(10px + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--bg) 62%, rgba(5, 5, 5, 0));
	}
	.dock.pinned {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
	}
	.inner {
		max-width: 520px;
		margin: 0 auto;
	}
	.inner > :global(*:first-child) {
		margin-top: 0;
	}
	.below {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.55em;
		min-height: 40px;
		font-size: 12px;
		color: var(--mute);
		text-align: center;
	}
	.below :global(button),
	.below :global(label) {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		color: var(--fg);
		text-decoration: underline;
		text-decoration-color: var(--hair-strong);
		text-underline-offset: 4px;
		cursor: pointer;
		transition: text-decoration-color 0.2s;
	}
	.below :global(button:hover),
	.below :global(label:hover) {
		text-decoration-color: var(--bone);
	}
	/* Desktop has no thumb to stay under: the button follows the fields, in their column. */
	@media (min-width: 900px) {
		.dock:not(.pinned) {
			position: static;
			margin-top: 0;
			padding: 28px 24px 64px;
			background: none;
		}
		.dock:not(.pinned) .inner {
			max-width: 512px;
		}
	}
</style>
