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

<div class="eyebrow dots mt-7 mb-3">
	<span>The drafting prompt</span><span class="normal-case tracking-normal">Every first touch, follow-up and reply is written under it</span>
</div>
{#if !crm.voice}
	<div class="text-xs text-mute">Loading.</div>
{:else}
	<Textarea bind:value={text} class="min-h-[420px] px-4 py-3.5 text-[13.5px] sm:text-[13.5px]" />
	<div class="mt-3.5 flex flex-wrap items-center gap-4">
		<Button variant="house" size="house" disabled={saving} onclick={() => (pending = true)}>Save voice</Button>
		{#if crm.voice.updated_at}
			<span class="dots text-xs text-mute"><span class="num">Version {crm.voice.v ?? ''}</span><span>saved {ago(crm.voice.updated_at)}</span></span>
		{/if}
	</div>
	<p class="mt-5 max-w-[66ch] text-xs leading-relaxed text-mute">
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
