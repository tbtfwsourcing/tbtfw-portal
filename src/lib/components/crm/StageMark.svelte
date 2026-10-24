<script lang="ts">
	// A lead's stage as a dot and a label. Filled bone: the ball is in our court
	// (new, replied). Filled ivory: won. Ring: in motion. Dim: closed out.
	let { status = 'new', class: className = '' }: { status?: string; class?: string } = $props();

	const dot = $derived(
		status === 'new' || status === 'replied'
			? 'bg-bone'
			: status === 'won'
				? 'bg-foreground'
				: status === 'contacted' || status === 'offered'
					? 'border border-foreground/70'
					: 'border border-hair-strong'
	);
	const ink = $derived(
		status === 'new' || status === 'replied' ? 'text-bone' : status === 'lost' || status === 'junk' || status === 'duplicate' ? 'text-mute' : 'text-foreground'
	);
</script>

<span class="mlabel inline-flex items-center gap-1.5 {ink} {className}">
	<i class="size-1.5 rounded-full {dot}" aria-hidden="true"></i>{status}
</span>
