<script lang="ts">
	import { portal, photoCount } from '#lib/portal/state.svelte.js';
	import { compress } from '#lib/images.js';
	import { SLOT_ORDER, SLOT_NAMES, MAX_PHOTOS, MIN_PHOTOS, MAX_EXTRA_SLOTS } from '#lib/config.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CheckIcon from '@lucide/svelte/icons/check';

	const count = $derived(photoCount());
	const countLabel = $derived(
		count < MIN_PHOTOS
			? count + ' of ' + MIN_PHOTOS + ' required'
			: count + (count === 1 ? ' photo' : ' photos') + (count >= MAX_PHOTOS ? ', maximum' : '')
	);
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
	}

	// "Add photos" fills the named slots in order first, then the extras.
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
		<label class="slot" class:filled={!!p} for="ph-{slot}">
			<input type="file" id="ph-{slot}" accept="image/*" onchange={(e) => onSlot(slot, e)} />
			{#if p}
				<img src={p.url} alt="" class="ready" />
				<span class="tick" aria-hidden="true"><CheckIcon class="size-3" /></span>
			{:else}
				<span class="plus" aria-hidden="true"><PlusIcon class="size-4" /></span>
			{/if}
			<span class="n">{SLOT_NAMES[slot]}</span>
		</label>
	{/each}
</div>
{#if extras.length}
	<div class="mb-2 flex flex-wrap gap-1.5">
		{#each extras as k (k)}
			<img src={portal.photos[k].url} alt="" class="size-[52px] border border-hair object-cover" />
		{/each}
	</div>
{/if}
<div class="addrow">
	<label for="photos">Add photos</label>
	<input type="file" id="photos" multiple accept="image/*" onchange={onMany} />
	<span class="num text-[12.5px] tracking-[.02em] text-mute">{countLabel}</span>
</div>

<style>
	.slots {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 8px 0 6px;
	}
	.slot {
		position: relative;
		display: block;
		aspect-ratio: 1 / 1;
		border: 1px solid var(--hair);
		background: var(--surface);
		cursor: pointer;
		overflow: hidden;
		transition: border-color 0.2s;
	}
	.slot .plus {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--mute);
		transition: color 0.2s;
	}
	.slot .tick {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		background: var(--bone);
		color: var(--bg);
	}
	@media (hover: hover) {
		.slot:hover {
			border-color: var(--hair-strong);
		}
		.slot:hover .plus {
			color: var(--fg);
		}
	}
	.slot input,
	.addrow input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		left: 0;
		top: 0;
	}
	.slot img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: fade 350ms ease-out;
	}
	.slot .n {
		position: absolute;
		left: 10px;
		bottom: 9px;
		right: 8px;
		font-size: 11px;
		line-height: 1.3;
		letter-spacing: 0.02em;
		color: var(--mute);
	}
	.slot.filled .n {
		left: 0;
		right: 0;
		bottom: 0;
		padding: 18px 10px 8px;
		color: var(--fg);
		background: linear-gradient(to top, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
	}
	.slot:has(input:focus-visible) {
		outline: 1px solid var(--bone);
		outline-offset: 2px;
	}
	.slot:active {
		border-color: var(--bone);
	}
	.addrow {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
		margin-bottom: 6px;
	}
	.addrow label {
		font-size: 13px;
		letter-spacing: 0.04em;
		text-decoration: underline;
		text-underline-offset: 5px;
		text-decoration-color: var(--hair-strong);
		cursor: pointer;
		padding: 10px 0;
		transition: text-decoration-color 0.2s;
	}
	.addrow label:hover {
		text-decoration-color: var(--bone);
	}
	.addrow:has(input:focus-visible) label {
		outline: 1px solid var(--bone);
		outline-offset: 4px;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
