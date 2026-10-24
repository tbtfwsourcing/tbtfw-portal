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
	<!-- A bottom sheet on phones (slides up, clears the home indicator); a centred dialog from sm:. -->
	<AlertDialog.Content
		class="rounded-none border-hair bg-surface p-6 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:data-[size=default]:max-w-none max-sm:translate-y-0 max-sm:border-t max-sm:pb-[calc(24px+env(safe-area-inset-bottom))] max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-8 max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom-8 sm:max-w-[420px]"
	>
		<AlertDialog.Header>
			<AlertDialog.Title class="disp text-base font-normal tracking-[.02em]">{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description class="text-sm text-mute">{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer class="mt-2 gap-2">
			<AlertDialog.Cancel
				class="h-auto min-h-12 rounded-none border-hair bg-transparent px-4 py-3 text-[11px] tracking-[.14em] uppercase text-foreground hover:border-bone hover:bg-transparent hover:text-bone active:text-bone sm:min-h-0"
			>
				Cancel
			</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={confirm}
				class="h-auto min-h-12 rounded-none bg-foreground px-4 py-3 text-[11px] tracking-[.14em] uppercase text-background hover:bg-bone active:bg-bone sm:min-h-0"
			>
				{action}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
