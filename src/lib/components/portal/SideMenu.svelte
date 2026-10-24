<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { page } from '$app/state';
	import { portal, openSheet, closeSheet } from '#lib/portal/state.svelte.js';
	import type { InventoryItem } from '#lib/api/intake.js';
	import { sized } from '#lib/images.js';
	import { photoOk } from '#lib/portal/photos.svelte.js';
	import { money } from '#lib/format.js';
	import XIcon from '@lucide/svelte/icons/x';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	interface Props {
		// Index into portal.inv of the car on screen, highlighted in the list.
		active?: number;
		onpick: (index: number) => void;
		// "Something else": the screen decides what that means (focus the ask field, or go to the last slide).
		onany: () => void;
	}
	let { active = -1, onpick, onany }: Props = $props();

	let panel = $state<HTMLElement | null>(null);
	// The tab shows itself on arrival, then tucks away to a bone sliver on the edge.
	let tucked = $state(false);

	onMount(() => {
		const t = setTimeout(() => (tucked = true), 4200);
		return () => clearTimeout(t);
	});

	// By make, in showroom order (price, high to low) within each.
	const groups = $derived.by(() => {
		const by = new Map<string, { car: InventoryItem; i: number }[]>();
		portal.inv.forEach((car, i) => {
			const k = car.make || 'Other';
			if (!by.has(k)) by.set(k, []);
			by.get(k)!.push({ car, i });
		});
		return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});

	const slug = (make: string) => 'menu-' + make.toLowerCase().replace(/[^a-z0-9]+/g, '-');

	function jump(make: string) {
		panel?.querySelector('#' + slug(make))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function thumbFailed(e: Event, url: string | null | undefined) {
		const img = e.currentTarget as HTMLImageElement;
		const mid = sized(url, 800);
		if (mid && img.src !== mid) img.src = mid;
	}
</script>

<!-- The showroom waits off the right edge: a slim vertical tab, like the side label on tbtfw.com.
     It peeks out when the screen opens, then tucks away; hovering the sliver brings it back. -->
<button
	type="button"
	class="edge"
	class:tucked
	class:hidden={!portal.invLoaded || !portal.inv.length}
	onclick={() => openSheet('menu')}
	onmouseenter={() => (tucked = false)}
	onmouseleave={() => (tucked = true)}
	aria-haspopup="dialog"
	aria-label="Open the showroom"
>
	<span class="label">Showroom</span>
</button>

<Dialog.Root open={page.state.sheet === 'menu'} onOpenChange={(o) => !o && closeSheet()}>
	<Dialog.Portal>
		<Dialog.Overlay class="menu-overlay" />
		<Dialog.Content
			bind:ref={panel}
			class="menu-panel"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				panel?.focus();
			}}
		>
			<div class="head">
				<div class="top">
					<Dialog.Title class="eyebrow">The showroom</Dialog.Title>
					<Dialog.Close class="close" aria-label="Close the showroom">
						<XIcon class="size-[18px]" aria-hidden="true" />
					</Dialog.Close>
				</div>
				<nav class="makes" aria-label="Makes">
					{#each groups as [make] (make)}
						<button type="button" onclick={() => jump(make)}>{make}</button>
					{/each}
				</nav>
			</div>

			<button type="button" class="any" onclick={onany}>
				<span>
					<span class="disp-sm block text-[17px]">Something else in mind?</span>
					<span class="mt-1 block text-[12px] text-mute">Ask about any car. We'll find it.</span>
				</span>
				<ArrowRightIcon class="size-4 shrink-0" aria-hidden="true" />
			</button>

			{#each groups as [make, rows] (make)}
				<h3 class="section-head mb-1 scroll-mt-[120px]" id={slug(make)}>{make}</h3>
				<ul>
					{#each rows as { car, i } (car.stock_id)}
						<li>
							<button type="button" class="row" class:on={i === active} onclick={() => onpick(i)}>
								<span class="thumb">
									{#if photoOk[car.stock_id]}
										<img
											src={sized(car.image_url, 400)}
											alt=""
											loading="lazy"
											decoding="async"
											onerror={(e) => thumbFailed(e, car.image_url)}
										/>
									{/if}
								</span>
								<span class="min-w-0 flex-1">
									<span class="disp-sm block truncate text-[15px]">{car.model}{car.trim ? ' ' + car.trim : ''}</span>
									<span class="num dots mt-1 text-[12px] text-mute">
										<span>{car.year}</span><span class="text-bone">{money(car.price, 'Price on request')}</span>
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/each}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.edge {
		position: fixed;
		right: 0;
		top: 50%;
		z-index: 30;
		padding: 18px 6px;
		margin-top: -64px;
		background: rgba(12, 12, 12, 0.9);
		border: 1px solid var(--hair-strong);
		border-right: 0;
		color: var(--fg);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		cursor: pointer;
		animation: peek 700ms cubic-bezier(0.2, 0.7, 0.2, 1) 900ms both;
		transition:
			transform 650ms cubic-bezier(0.2, 0.7, 0.2, 1),
			box-shadow 650ms,
			color 0.2s;
	}
	/* Read bottom to top, as on tbtfw.com. */
	.label {
		display: flex;
		align-items: center;
		gap: 12px;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		transition: opacity 400ms;
	}
	/* The bone rule that opens every section on the site, turned on its side. */
	.label::before {
		content: '';
		width: 1px;
		height: 18px;
		background: var(--bone);
	}
	/* Tucked: only a sliver shows, lit bone. The hit area runs 18px further in so a thumb still finds it. */
	.edge.tucked {
		transform: translateX(calc(100% - 4px));
		box-shadow: inset 2px 0 0 var(--bone);
	}
	.edge.tucked .label {
		opacity: 0;
	}
	.edge::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: -18px;
		width: 18px;
	}
	.edge:hover,
	.edge:active {
		color: var(--bone);
	}
	.edge.hidden {
		display: none;
	}
	:global(.menu-overlay) {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.6);
	}
	:global(.menu-overlay[data-state='open']) {
		animation: menu-fade 300ms ease-out;
	}
	:global(.menu-overlay[data-state='closed']) {
		animation: menu-fade 220ms ease-in reverse forwards;
	}
	:global(.menu-panel) {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 51;
		width: min(88vw, 420px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--surface);
		border-left: 1px solid var(--hair-strong);
		padding: 0 24px calc(24px + env(safe-area-inset-bottom));
		outline: none;
	}
	:global(.menu-panel[data-state='open']) {
		animation: menu-slide 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	:global(.menu-panel[data-state='closed']) {
		animation: menu-slide 260ms ease-in reverse forwards;
	}
	.head {
		position: sticky;
		top: 0;
		z-index: 2;
		margin: 0 -24px;
		padding: env(safe-area-inset-top) 24px 0;
		background: var(--surface);
		border-bottom: 1px solid var(--hair);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
	}
	.head :global(.close) {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin-right: -12px;
		color: var(--fg);
		cursor: pointer;
	}
	.makes {
		display: flex;
		gap: 18px;
		overflow-x: auto;
		margin: 0 -24px;
		padding: 0 24px;
		scrollbar-width: none;
	}
	.makes::-webkit-scrollbar {
		display: none;
	}
	.makes button {
		flex: none;
		min-height: 44px;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--mute);
		cursor: pointer;
		transition: color 0.2s;
	}
	.makes button:hover,
	.makes button:active {
		color: var(--fg);
	}
	.any {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 20px;
		padding: 18px;
		border: 1px solid var(--hair-strong);
		text-align: left;
		color: var(--fg);
		cursor: pointer;
		transition: border-color 0.2s;
	}
	.any:hover {
		border-color: var(--bone);
	}
	.row {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 14px;
		min-height: 64px;
		padding: 10px 0;
		border-bottom: 1px solid var(--hair);
		text-align: left;
		color: var(--fg);
		cursor: pointer;
		transition: color 0.2s;
	}
	.row:hover,
	.row:active,
	.row.on {
		color: var(--bone);
	}
	.thumb {
		flex: none;
		width: 64px;
		height: 43px;
		overflow: hidden;
		background: var(--bg);
		border: 1px solid var(--hair);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: menu-fade 400ms ease-out;
	}
	@keyframes peek {
		from {
			transform: translateX(100%);
		}
	}
	@keyframes menu-slide {
		from {
			transform: translateX(100%);
		}
	}
	@keyframes menu-fade {
		from {
			opacity: 0;
		}
	}
</style>
