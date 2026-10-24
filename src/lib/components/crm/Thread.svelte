<script lang="ts">
	import type { Message } from '#lib/api/crm.js';
	import { ago } from '#lib/format.js';

	let { messages = [] }: { messages?: Message[] } = $props();
</script>

{#if !messages.length}
	<div class="mt-4 text-xs text-mute">No messages yet.</div>
{:else}
	<div class="mt-5 border-t border-hair">
		{#each messages as m, i (i)}
			{@const isIn = m.direction === 'in'}
			{@const ok = m.status === 'sent' || m.status === 'received'}
			<div class="border-b border-hair py-3.5 text-[13.5px] leading-relaxed">
				<div class="eyebrow dots mb-1.5 text-[10px]" class:text-bone={isIn}>
					<span>{isIn ? 'Customer' : 'Garett'}</span><span>{m.channel}</span>{#if m.purpose}<span>{m.purpose.replace(/_/g, ' ')}</span>{/if}<span class:text-bone={ok}>{m.status}{m.provider === 'manual' ? ' by hand' : ''}</span><span>{ago(m.sent_at ?? m.created_at)}</span>{#if m.error}<span>{m.error}</span>{/if}
				</div>
				{#if m.subject && m.channel === 'email'}
					<div class="mb-1 text-xs text-mute">{m.subject}</div>
				{/if}
				<div class="whitespace-pre-wrap" class:border-l={isIn} class:border-bone={isIn} class:pl-3={isIn}>
					{m.body ?? ''}
				</div>
			</div>
		{/each}
	</div>
{/if}
