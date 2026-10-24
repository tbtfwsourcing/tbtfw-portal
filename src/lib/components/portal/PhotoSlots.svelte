<script lang="ts">
	import { portal, photoCount } from '#lib/portal/state.svelte.js';
	import { compress } from '#lib/images.js';
	import { SLOT_ORDER, SLOT_NAMES, MAX_PHOTOS, MIN_PHOTOS, MAX_EXTRA_SLOTS } from '#lib/config.js';

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
			{#if p}<img src={p.url} alt="" class="ready" />{/if}
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
	<span class="num text-[13px] text-mute">{countLabel}</span>
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
		background: var(--bg);
		cursor: pointer;
		overflow: hidden;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
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
		font-size: 12px;
		line-height: 1.25;
		color: var(--fg);
	}
	.slot.filled .n {
		background: var(--bg);
		display: inline-block;
		left: 0;
		bottom: 0;
		right: auto;
		padding: 5px 10px 6px;
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
		font-size: 14px;
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
		padding: 10px 0;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.addrow label:active {
		color: var(--bone);
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
