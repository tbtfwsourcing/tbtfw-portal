<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { crm as api } from '#lib/api/crm.js';
	import { crm, loadVoice } from '#lib/crm/state.svelte.js';
	import { ago } from '#lib/format.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Confirm from './Confirm.svelte';

	let text = $state('');
	let seeded = false;
	let saving = $state(false);
	let pending = $state(false);

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
</script>

<div class="eyebrow mt-6 mb-2.5 text-[10.5px]">
	The drafting prompt // every first touch, follow-up and reply is written under it
</div>
{#if !crm.voice}
	<div class="text-xs text-mute">Loading.</div>
{:else}
	<Textarea
		bind:value={text}
		class="min-h-[420px] rounded-none border-hair bg-background px-3 py-3 text-[13.5px] leading-normal focus-visible:border-foreground focus-visible:ring-0"
	/>
	<div class="mt-3 flex flex-wrap items-center gap-2.5">
		<Button
			class="h-auto rounded-none border border-foreground bg-foreground px-4 py-3 text-[11px] font-normal tracking-[.14em] uppercase text-background hover:border-bone hover:bg-bone"
			disabled={saving}
			onclick={() => (pending = true)}
		>
			Save voice
		</Button>
		{#if crm.voice.updated_at}
			<span class="text-xs text-mute">Version {crm.voice.v ?? ''} // saved {ago(crm.voice.updated_at)}</span>
		{/if}
	</div>
	<p class="mt-3.5 max-w-[70ch] text-xs text-mute">
		Changes apply to the next draft the system writes. Existing drafts in the queue are not rewritten. Hard rules the
		system adds on top of this and that you cannot turn off here: a human approves every send; no price or money
		figure first; only facts from the lead; one question; never AI, automated, bot or system.
	</p>
{/if}

<Confirm
	bind:open={pending}
	title="Save this as the voice for every future draft?"
	action="Save voice"
	onconfirm={save}
/>
