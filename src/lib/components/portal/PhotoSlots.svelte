<script lang="ts">
	import { portal, photoCount } from '#lib/portal/state.svelte.js';
	import { compress } from '#lib/images.js';
	import { SLOT_ORDER, SLOT_NAMES, MAX_PHOTOS, MAX_EXTRA_SLOTS, type NamedSlot } from '#lib/config.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CheckIcon from '@lucide/svelte/icons/check';

	interface Props {
		// The slot the guide points at next; the step's button opens this one.
		next: NamedSlot | null;
	}
	let { next }: Props = $props();

	// Short labels for the tiles; the full names stay on the inputs for screen readers.
	const SHORT: Record<NamedSlot, string> = {
		front34: 'Front ¾',
		rear34: 'Rear ¾',
		interior: 'Interior',
		odometer: 'Odometer',
		vin_plate: 'VIN plate',
		sticker: 'Build sheet'
	};

	const extras = $derived(
		Object.keys(portal.photos)
			.filter((k) => k.startsWith('extra_'))
			.sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
	);

	function nextExtraSlot(): string | null {
		for (let i = 1; i <= MAX_EXTRA_SLOTS; i++) if (!portal.photos['extra_' + i]) return 'extra_' + i;
		return null;
	}

	async function placeFile(slot: string | null, file: File) {
		if (!slot) return;
		const c = await compress(file);
		const old = portal.photos[slot];
		if (old?.url) URL.revokeObjectURL(old.url);
		portal.photos[slot] = { ...c, url: URL.createObjectURL(c.blob) };
	}

	function onSlot(slot: string, e: Event) {
		const inp = e.currentTarget as HTMLInputElement;
		if (inp.files?.[0]) placeFile(slot, inp.files[0]);
		inp.value = '';
	}

	// "Choose several" fills the named slots in order first, then the extras.
	async function onMany(e: Event) {
		const inp = e.currentTarget as HTMLInputElement;
		const files = Array.from(inp.files ?? []);
		for (const f of files) {
			if (photoCount() >= MAX_PHOTOS) break;
			let slot: string | null = SLOT_ORDER.find((s) => !portal.photos[s]) ?? null;
			if (!slot) slot = nextExtraSlot();
			await placeFile(slot, f);
		}
		inp.value = '';
	}
</script>

<div class="slots">
	{#each SLOT_ORDER as slot (slot)}
		{@const p = portal.photos[slot]}
		<label class="slot" class:filled={!!p} class:next={slot === next} for="ph-{slot}">
			<input type="file" id="ph-{slot}" accept="image/*" aria-label={SLOT_NAMES[slot]} onchange={(e) => onSlot(slot, e)} />
			{#if p}
				<img src={p.url} alt="" />
			{:else}
				<span class="plus" aria-hidden="true"><PlusIcon class="size-5" /></span>
			{/if}
			<span class="n" aria-hidden="true">
				{SHORT[slot]}
				{#if p}<CheckIcon class="size-3 text-bone" />{/if}
			</span>
		</label>
	{/each}
</div>
{#if extras.length}
	<div class="mt-2 flex flex-wrap gap-1.5">
		{#each extras as k (k)}
			<img src={portal.photos[k].url} alt="" class="size-[52px] border border-hair object-cover" />
		{/each}
	</div>
{/if}
<input type="file" id="photos" class="many" multiple accept="image/*" aria-label="Choose several photos" onchange={onMany} />

<style>
	.slots {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}
	.slot {
		position: relative;
		display: block;
		aspect-ratio: 4 / 3;
		border: 1px solid var(--hair-strong);
		background: var(--surface);
		cursor: pointer;
		overflow: hidden;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		transition: border-color 0.3s;
	}
	/* The guide: the angle to shoot next wears the bone accent. */
	.slot.next {
		border-color: var(--bone);
	}
	.slot.next .plus {
		color: var(--bone);
	}
	.slot.filled {
		border-color: transparent;
	}
	.plus {
		position: absolute;
		inset: 0 0 18px;
		display: grid;
		place-items: center;
		color: var(--mute);
		transition: color 0.2s;
	}
	.slot input,
	.many {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		left: 0;
		top: 0;
		pointer-events: none;
	}
	.slot img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: fade 400ms ease-out;
	}
	.n {
		position: absolute;
		left: 10px;
		bottom: 9px;
		right: 10px;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--mute);
	}
	.slot.next .n {
		color: var(--fg);
	}
	.slot.filled .n {
		left: 0;
		right: 0;
		bottom: 0;
		padding: 22px 10px 9px;
		color: var(--fg);
		background: linear-gradient(to top, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
	}
	@media (hover: hover) {
		.slot:hover {
			border-color: var(--fg);
		}
		.slot:hover .plus {
			color: var(--fg);
		}
	}
	.slot:has(input:focus-visible) {
		outline: 1px solid var(--bone);
		outline-offset: 2px;
	}
	.slot:active {
		border-color: var(--bone);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@media (min-width: 900px) {
		.slots {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
