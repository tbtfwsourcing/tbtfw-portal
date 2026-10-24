<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { crm as api } from '#lib/api/crm.js';
	import { crm, loadVoice } from '#lib/crm/state.svelte.js';
	import { ago } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import Confirm from './Confirm.svelte';
	import PageHead from './PageHead.svelte';

	// lead-crm rejects a prompt outside these bounds.
	const MIN = 100;
	const MAX = 8000;

	let text = $state('');
	let seeded = false;
	let saving = $state(false);
	let pending = $state(false);

	const dirty = $derived(!!crm.voice && text !== (crm.voice.text ?? ''));
	const n = $derived(text.trim().length);
	const valid = $derived(n >= MIN && n <= MAX);

	$effect(() => {
		if (!crm.voice) {
			loadVoice();
			return;
		}
		if (!seeded) {
			text = crm.voice.text ?? '';
			seeded = true;
		}
	});

	async function save() {
		saving = true;
		try {
			const r = await api.saveVoice(crm.key, text);
			if (r.json?.ok) {
				crm.voice = { text, v: r.json.v, updated_at: new Date().toISOString() };
				toast.success('Saved as version ' + r.json.v + '. Applies to the next draft.');
			} else toast.error(r.json?.message ?? 'Failed.');
		} catch {
			toast.error('No response from the backend.');
		} finally {
			saving = false;
		}
	}

	const rules = [
		'A person approves every send',
		'Never names a price or money figure first',
		'Uses only facts from the lead',
		'Asks one question',
		'Never says AI, automated, bot or system'
	];
</script>

<PageHead title="Voice">
	<span>The prompt every draft is written under</span>
</PageHead>

{#if !crm.voice}
	<Skeleton class="h-[420px] w-full rounded-none bg-muted" />
{:else}
	<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
		<div>
			<div class="border border-hair bg-surface focus-within:border-hair-strong">
				<div class="flex items-center justify-between gap-3 border-b border-hair px-4 py-2.5">
					<span class="mlabel dots"><span class="text-foreground">Version {crm.voice.v ?? ''}</span>{#if dirty}<span class="text-bone">Unsaved changes</span>{/if}</span>
					<span class="mlabel {valid ? '' : 'text-bone'}">{n.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}</span>
				</div>
				<!-- text-base (16px) on phones from the Textarea default, so iOS does not zoom; the denser 14px from sm:. -->
				<Textarea
					bind:value={text}
					aria-label="Voice prompt"
					class="min-h-[460px] border-0 bg-transparent px-4 py-4 leading-[1.7] sm:text-[14px] lg:min-h-[560px]"
				/>
			</div>
			<div class="mt-4 flex flex-wrap items-center gap-2.5">
				<Button variant="house" size="house" disabled={saving || !dirty || !valid} onclick={() => (pending = true)}>
					{saving ? 'Saving' : 'Save voice'}
				</Button>
				{#if dirty}
					<Button variant="quiet" size="house" disabled={saving} onclick={() => (text = crm.voice?.text ?? '')}>Discard changes</Button>
				{/if}
				{#if !valid}
					<span class="text-[12px] text-bone">{n < MIN ? 'At least ' + MIN + ' characters.' : 'Under ' + MAX.toLocaleString('en-US') + ' characters.'}</span>
				{/if}
			</div>
		</div>

		<aside class="grid content-start gap-7 border-t border-hair pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
			<div>
				<p class="mlabel">Live version</p>
				<p class="mt-2 text-[28px] leading-none font-medium">v{crm.voice.v ?? '—'}</p>
				{#if crm.voice.updated_at}<p class="mt-2 text-[12.5px] text-mute">Saved {ago(crm.voice.updated_at)}</p>{/if}
			</div>
			<div>
				<p class="mlabel">Applies to</p>
				<p class="mt-2 text-[13px] leading-relaxed text-mute">
					Every first touch, follow-up and reply written after you save. Drafts already in the queue keep their wording.
				</p>
			</div>
			<div>
				<p class="mlabel">Always on</p>
				<ul class="mt-2.5 grid gap-2 text-[13px] leading-snug text-mute">
					{#each rules as r (r)}
						<li class="flex gap-2.5"><i class="mt-[7px] size-1 shrink-0 rounded-full bg-hair-strong" aria-hidden="true"></i>{r}</li>
					{/each}
				</ul>
				<p class="mt-3 text-[12px] leading-relaxed text-mute/80">The system adds these on top of the prompt; they cannot be turned off here.</p>
			</div>
		</aside>
	</div>
{/if}

<Confirm
	bind:open={pending}
	title="Save this as the voice for every future draft?"
	action="Save voice"
	onconfirm={save}
/>
