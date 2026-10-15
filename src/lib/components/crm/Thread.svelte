<script lang="ts">
	import type { Message } from '#lib/api/crm.js';
	import { ago } from '#lib/format.js';

	let { messages = [] }: { messages?: Message[] } = $props();
</script>

{#if !messages.length}
	<div class="mt-2.5 text-xs text-mute">No messages yet.</div>
{:else}
	<div class="mt-3 border-t border-hair">
		{#each messages as m, i (i)}
			{@const isIn = m.direction === 'in'}
			{@const ok = m.status === 'sent' || m.status === 'received'}
			<div class="border-b border-hair py-2.5 text-[13.5px]">
				<div class="eyebrow mb-1 text-[10px] tracking-[.14em]" class:text-bone={isIn}>
					{isIn ? 'Customer' : 'Garett'} // {m.channel} // {(m.purpose ?? '').replace(/_/g, ' ')} //
					<span class:text-bone={ok}>{m.status}{m.provider === 'manual' ? ' by hand' : ''}</span>
					// {ago(m.sent_at ?? m.created_at)}{m.error ? ' // ' + m.error : ''}
				</div>
				{#if m.subject && m.channel === 'email'}
					<div class="text-xs text-mute">{m.subject}</div>
				{/if}
				<div class="whitespace-pre-wrap" class:border-l-2={isIn} class:border-bone={isIn} class:pl-2.5={isIn}>
					{m.body ?? ''}
				</div>
			</div>
		{/each}
	</div>
{/if}
