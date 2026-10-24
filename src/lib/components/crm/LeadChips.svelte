<script lang="ts">
	import type { Lead } from '#lib/api/crm.js';
	import Chip from './Chip.svelte';

	interface Props {
		lead: Partial<Lead>;
		stage?: boolean;
		purpose?: string;
	}
	let { lead, stage = false, purpose }: Props = $props();

	const isSell = $derived(lead.kind === 'sell');
	const status = $derived(lead.status ?? 'new');
	const verdict = $derived(lead.verdict ?? '');
</script>

{#if stage}
	<Chip variant={status === 'new' || status === 'replied' ? 'solid' : 'dim'}>{status}</Chip>
{/if}
<Chip variant={isSell && !stage ? 'default' : 'dim'}>{isSell ? 'SELL' : 'BUY'}</Chip>
{#if lead.classification}
	<Chip variant={lead.classification === 'JUNK' ? 'dim' : 'default'}>{lead.classification}</Chip>
{/if}
{#if purpose}
	<Chip variant="dim">{purpose.replace(/_/g, ' ')}</Chip>
{/if}
{#if isSell}
	{#if !verdict}
		<Chip variant="dim">UNGRADED</Chip>
	{:else if verdict === 'CHASE' || verdict === 'WATCH'}
		<Chip variant="solid">{verdict}</Chip>
	{:else if verdict === 'FLAG'}
		<Chip>{verdict}</Chip>
	{:else}
		<Chip variant="dim">{verdict}</Chip>
	{/if}
	{#if lead.desirability_tier}<Chip variant="accent">{lead.desirability_tier}</Chip>{/if}
{/if}
