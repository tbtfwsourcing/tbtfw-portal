<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';

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
	<AlertDialog.Content class="rounded-none border-hair-strong bg-surface p-6 shadow-none sm:max-w-[420px]">
		<AlertDialog.Header>
			<AlertDialog.Title class="disp text-[20px]">{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description class="text-[13px] leading-relaxed text-mute">{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer class="mt-3 gap-2">
			<AlertDialog.Cancel class={buttonVariants({ variant: 'hairline', size: 'house' })}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirm} class={buttonVariants({ variant: 'house', size: 'house' })}>
				{action}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
