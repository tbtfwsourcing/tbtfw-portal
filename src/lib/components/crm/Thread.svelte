<script lang="ts">
	import type { Message } from '#lib/api/crm.js';
	import { ago, purposeLabel } from '#lib/format.js';

	// The conversation as a timeline: a dot per message on one hairline,
	// bone for the customer, grey for us.
	let { messages = [] }: { messages?: Message[] } = $props();
</script>

{#if !messages.length}
	<p class="text-[13px] text-mute">No messages yet.</p>
{:else}
	<ol class="border-l border-hair">
		{#each messages as m, i (i)}
			{@const isIn = m.direction === 'in'}
			{@const failed = m.status === 'failed'}
			<li class="relative pb-5 pl-5 last:pb-0">
				<i class="absolute top-[5px] left-[-3.5px] size-1.5 rounded-full {isIn ? 'bg-bone' : 'bg-hair-strong'}" aria-hidden="true"></i>
				<div class="mlabel dots">
					<span class={isIn ? 'text-bone' : 'text-foreground'}>{isIn ? 'Customer' : 'Garett'}</span><span>{m.channel === 'sms' ? 'text' : m.channel}</span>{#if m.purpose && !isIn}<span>{purposeLabel(m.purpose)}</span>{/if}{#if !isIn}<span class={failed || m.status === 'approved' ? 'text-bone' : ''}>{m.status === 'approved' ? 'auto-email queued' : m.status}{m.provider === 'manual' ? ' by hand' : ''}</span>{/if}<span>{ago(m.sent_at ?? m.created_at)}</span>
				</div>
				{#if m.subject && m.channel === 'email'}
					<p class="mt-1.5 text-[12.5px] text-mute">{m.subject}</p>
				{/if}
				<p class="mt-1.5 text-[13.5px] leading-relaxed whitespace-pre-wrap {isIn ? '' : 'text-foreground/80'}">{m.body ?? ''}</p>
				{#if m.error}<p class="mt-1.5 text-[12px] leading-relaxed text-bone">{m.error}</p>{/if}
			</li>
		{/each}
	</ol>
{/if}
