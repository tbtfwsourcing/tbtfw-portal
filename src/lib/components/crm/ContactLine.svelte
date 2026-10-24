<script lang="ts">
	import type { Lead } from '#lib/api/crm.js';
	import { dialable, formatPhone } from '#lib/format.js';

	// Name, phone, email, ZIP, preference. Phone and email are real links, so on a
	// phone one tap opens the dialer or mail app with the lead already filled in.
	// The links sit inside spans so the dots between items are not underlined.
	let { lead, class: className = '' }: { lead: Partial<Lead>; class?: string } = $props();
	const link = 'underline decoration-hair-strong underline-offset-4 transition-colors hover:text-bone hover:decoration-bone active:text-bone';
</script>

<div class="dots text-[13px] text-mute {className}">
	<span class="font-medium text-foreground">{lead.full_name ?? ''}</span>{#if lead.phone}<span class="whitespace-nowrap"><a href="tel:{dialable(lead.phone)}" class="mono {link}">{formatPhone(lead.phone) || lead.phone}</a></span>{/if}{#if lead.email}<span class="min-w-0 break-all"><a href="mailto:{lead.email}" class={link}>{lead.email}</a></span>{/if}{#if lead.zip}<span class="mono">{lead.zip}</span>{/if}{#if lead.contact_pref}<span>prefers {lead.contact_pref.toLowerCase()}</span>{/if}
</div>
