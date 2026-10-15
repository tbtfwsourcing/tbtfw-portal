<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		action?: string;
		onconfirm: () => void;
	}
	let { open = $bindable(false), title, description, action = 'Confirm', onconfirm }: Props = $props();

	function confirm() {
		open = false;
		onconfirm();
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content class="rounded-none border-hair bg-surface p-6 sm:max-w-[420px]">
		<AlertDialog.Header>
			<AlertDialog.Title class="disp text-base font-normal tracking-[.02em]">{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description class="text-sm text-mute">{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer class="mt-2 gap-2">
			<AlertDialog.Cancel
				class="h-auto rounded-none border-hair bg-transparent px-4 py-3 text-[11px] tracking-[.14em] uppercase text-foreground hover:border-bone hover:bg-transparent hover:text-bone"
			>
				Cancel
			</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={confirm}
				class="h-auto rounded-none bg-foreground px-4 py-3 text-[11px] tracking-[.14em] uppercase text-background hover:bg-bone"
			>
				{action}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
