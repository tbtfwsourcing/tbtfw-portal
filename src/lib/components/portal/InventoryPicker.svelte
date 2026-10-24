<script lang="ts">
	import { portal } from '#lib/portal/state.svelte.js';
	import { sized } from '#lib/images.js';
	import { money, miles } from '#lib/format.js';
	import FloatField from '#lib/components/FloatField.svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';

	// Desktop shows the first PREVIEW cards until the customer asks for the rest.
	// Mirrored by the :nth-child(n + 11) rule in the desktop media query below.
	const PREVIEW = 10;

	// 'all' is the Select's "no filter" value; the filter itself is the empty string.
	let makeSel = $state('all');
	const make = $derived(makeSel === 'all' ? '' : makeSel);
	let collapsed = $state(true);
	let wantedRef = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

	const makes = $derived(
		[...new Set(portal.inv.map((i) => i.make).filter((m): m is string => !!m))].sort()
	);
	const notListed = $derived(portal.buyForm.stock_id === 'other');
	// A make filter overrides the collapse so a filtered view is never clipped.
	const canCollapse = $derived(portal.invLoaded && !make && portal.inv.length > PREVIEW);

	function toggleNotListed(on: boolean) {
		portal.buyForm.stock_id = on ? 'other' : '';
		if (on) queueMicrotask(() => wantedRef?.focus());
	}

	function fallback(e: Event, full: string | null | undefined) {
		const img = e.currentTarget as HTMLImageElement;
		if (full && img.src !== full) img.src = full;
	}
</script>

<div class="mb-6">
	<span class="eyebrow mb-1 block" id="make-label">Make</span>
	<Select.Root type="single" bind:value={makeSel}>
		<Select.Trigger
			aria-labelledby="make-label"
			class="h-11 w-full rounded-none border-0 border-b border-hair bg-transparent px-0 text-base tracking-normal normal-case hover:bg-transparent focus-visible:border-bone data-[state=open]:border-bone"
		>
			{make || 'All makes'}
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all" label="All makes">All makes</Select.Item>
			{#each makes as m (m)}
				<Select.Item value={m} label={m}>{m}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>

<div
	class="picker"
	class:collapsed={collapsed && canCollapse}
	role="radiogroup"
	aria-label="Vehicle of interest"
	aria-busy={!portal.invLoaded}
>
	{#if !portal.invLoaded}
		<!-- Same .car box as the real cards, so the scroller / grid does not jump when inventory lands. -->
		{#each { length: 6 } as _, n (n)}
			<div class="car sk" aria-hidden="true">
				<Skeleton class="aspect-[4/3] w-full rounded-none border-b border-hair bg-muted" />
				<span class="txt">
					<Skeleton class="h-3 w-3/4 rounded-none bg-muted" />
					<Skeleton class="h-3 w-1/2 rounded-none bg-muted" />
				</span>
			</div>
		{/each}
	{:else}
		{#each portal.inv as i (i.stock_id)}
			<label class="car" class:hide={!!make && i.make !== make}>
				<input type="radio" class="sr-only" name="stock_id" value={i.stock_id} bind:group={portal.buyForm.stock_id} />
				<span class="ph">
					{#if i.image_url}
						<img
							src={sized(i.image_url, 800)}
							alt={[i.year, i.make, i.model, i.trim].filter(Boolean).join(' ')}
							loading="lazy"
							decoding="async"
							onerror={(e) => fallback(e, i.image_url)}
						/>
					{/if}
				</span>
				<span class="tick" aria-hidden="true"><CheckIcon class="size-3" /></span>
				<span class="yr num">{i.year ?? ''}</span>
				<span class="id disp-sm">{i.model}{i.trim ? ' ' + i.trim : ''}</span>
				<span class="pr num dots">
					<span>{money(i.price)}</span>{#if i.mileage != null}<span class="mi">{miles(i.mileage)}</span>{/if}
				</span>
			</label>
		{/each}
	{/if}
</div>
{#if canCollapse}
	<button
		type="button"
		class="more hidden cursor-pointer border-t border-hair py-4 text-[13px] tracking-[.04em] text-mute transition-colors hover:text-foreground min-[720px]:block"
		aria-expanded={!collapsed}
		onclick={() => (collapsed = !collapsed)}
	>
		{collapsed ? `Show all ${portal.inv.length} cars` : 'Show fewer'}
	</button>
{/if}
{#if portal.invLoaded && !portal.inv.length}
	<p class="py-3 text-sm text-mute">
		Inventory is loading. If it does not appear, tell us what you are looking for below.
	</p>
{/if}

<label for="stock-other" class="mt-2 flex min-h-11 cursor-pointer items-start gap-3.5 py-2.5 text-[15px]">
	<Checkbox id="stock-other" checked={notListed} onCheckedChange={toggleNotListed} class="mt-0.5" />
	<span>I am looking for something not listed</span>
</label>
{#if notListed}
	<FloatField
		textarea
		id="wanted_text"
		label="What should we find for you"
		rows={3}
		bind:value={portal.buyForm.wanted_text}
		bind:ref={wantedRef}
	/>
{/if}

<style>
	/* On phones the scroller runs edge to edge: cards peek in from the right so
	   the row reads as swipeable, and snap points line up with the 20px gutter. */
	.picker {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: 20px;
		overscroll-behavior-x: contain;
		-webkit-overflow-scrolling: touch;
		padding: 2px 20px 8px;
		margin: 0 -20px;
		scrollbar-width: none;
	}
	.picker::-webkit-scrollbar {
		display: none;
	}
	.car {
		position: relative;
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		flex: 0 0 72%;
		max-width: 260px;
		scroll-snap-align: start;
		border: 1px solid var(--hair);
		background: var(--surface);
		cursor: pointer;
		-webkit-user-select: none;
		user-select: none;
		transition:
			border-color 200ms,
			background-color 200ms;
	}
	.car .ph {
		display: block;
		aspect-ratio: 4 / 3;
		background: var(--bg);
		overflow: hidden;
		border-bottom: 1px solid var(--hair);
	}
	.car .ph img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 900ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.car .yr {
		display: block;
		padding: 13px 14px 0;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.26em;
		color: var(--mute);
	}
	/* Two lines max for the car line, so every card in a row is the same height. */
	.car .id {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		font-size: 14px;
		min-height: calc(14px * 1.25 * 2);
		padding: 5px 14px 8px;
	}
	.car .pr {
		display: block;
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0 14px 13px;
		color: var(--fg);
	}
	.car .pr .mi {
		color: var(--mute);
	}
	.car .tick {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: var(--bone);
		color: var(--bg);
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 200ms,
			transform 300ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	@media (hover: hover) {
		.car:hover {
			border-color: var(--hair-strong);
		}
		.car:hover .ph img {
			transform: scale(1.04);
		}
	}
	.car:has(input:checked) {
		border-color: var(--bone);
	}
	.car:has(input:checked) .tick {
		opacity: 1;
		transform: none;
	}
	.car:has(input:focus-visible) {
		outline: 1px solid var(--bone);
		outline-offset: 2px;
	}
	.car.hide {
		display: none;
	}
	.car.sk {
		pointer-events: none;
	}
	/* Same box as .id + .pr (two clamped lines, then the price line) so rows are the same height before and after load. */
	.car.sk .txt {
		display: grid;
		align-content: space-between;
		min-height: calc(15px + 14px * 1.25 * 2 + 13px + 13px * 1.5 + 13px);
		padding: 12px 14px;
	}
	@media (min-width: 720px) {
		/* Break the grid (and its Show-all control) out of the 560px form column so cards get room to breathe. */
		.picker,
		.more {
			--w: min(1120px, 100vw - 40px);
			width: var(--w);
			margin-inline: calc((560px - var(--w)) / 2);
		}
		.picker {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: 12px;
			overflow: visible;
			scroll-snap-type: none;
			scroll-padding-inline: 0;
			padding: 2px 0 8px;
		}
		.car {
			flex: none;
			max-width: none;
		}
		/* Collapsed: the first PREVIEW (10) cards only, plus the chosen one so a pick made while expanded
		   (or under a make filter) never disappears. Mobile keeps its scroller, so this lives inside the desktop query. */
		.picker.collapsed .car:nth-child(n + 11):not(:has(input:checked)) {
			display: none;
		}
	}
</style>
