<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
	}
	let { open, title, onclose, children }: Props = $props();

	let panel = $state<HTMLElement | null>(null);
</script>

<!-- A house sheet: square, hairline top, rises from the bottom on phones and sits centred on desktop. -->
<Dialog.Root {open} onOpenChange={(o) => !o && onclose()}>
	<Dialog.Portal>
		<Dialog.Overlay class="sheet-overlay" />
		<Dialog.Content
			bind:ref={panel}
			class="sheet-panel"
			onOpenAutoFocus={(e) => {
				// Focusing the first field would throw the keyboard up before the customer has read the sheet.
				e.preventDefault();
				panel?.focus();
			}}
		>
			<div class="grab" aria-hidden="true"></div>
			<Dialog.Title class="sr-only">{title}</Dialog.Title>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.sheet-overlay) {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.62);
	}
	:global(.sheet-overlay[data-state='open']) {
		animation: sheet-fade 300ms ease-out;
	}
	:global(.sheet-overlay[data-state='closed']) {
		animation: sheet-fade 200ms ease-in reverse forwards;
	}
	:global(.sheet-panel) {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 51;
		max-height: 92dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface);
		border-top: 1px solid var(--hair-strong);
		padding: 12px 24px calc(16px + env(safe-area-inset-bottom));
		outline: none;
	}
	:global(.sheet-panel[data-state='open']) {
		animation: sheet-rise 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	:global(.sheet-panel[data-state='closed']) {
		animation: sheet-rise 240ms ease-in reverse forwards;
	}
	.grab {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		margin: 0 auto 22px;
		background: var(--hair-strong);
	}
	@keyframes sheet-rise {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes sheet-fade {
		from {
			opacity: 0;
		}
	}
	@media (min-width: 900px) {
		:global(.sheet-panel) {
			left: 50%;
			right: auto;
			width: 560px;
			margin-left: -280px;
			border-left: 1px solid var(--hair-strong);
			border-right: 1px solid var(--hair-strong);
			padding: 16px 40px 28px;
		}
	}
</style>
