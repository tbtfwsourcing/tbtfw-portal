<script lang="ts">
	import type { Lead } from '#lib/api/crm.js';
	import { digits } from '#lib/format.js';

	// Name, phone, email, ZIP, preference. Phone and email are real links, so on a
	// phone one tap opens the dialer or mail app with the lead already filled in.
	let { lead }: { lead: Partial<Lead> } = $props();
	const link = 'underline decoration-hair underline-offset-4 hover:text-bone active:text-bone';
</script>

<div class="mt-2 text-[12.5px] text-mute">
	<b class="font-medium text-foreground">{lead.full_name ?? ''}</b>
	{#if lead.phone}
		// <a href="tel:{digits(lead.phone)}" class="num {link}">{lead.phone}</a>
	{/if}
	{#if lead.email}
		// <a href="mailto:{lead.email}" class={link}>{lead.email}</a>
	{/if}
	{#if lead.zip}
		// {lead.zip}
	{/if}
	{#if lead.contact_pref}
		// prefers {lead.contact_pref}
	{/if}
</div>
