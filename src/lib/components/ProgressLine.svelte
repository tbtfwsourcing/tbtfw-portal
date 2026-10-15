<script lang="ts">
	import { busy } from '#lib/busy.svelte.js';

	let width = $state('0');
	let visible = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (busy.on) {
			clearTimeout(hideTimer);
			visible = true;
			width = '0';
			// Next frame so the width transition actually runs from zero.
			requestAnimationFrame(() => {
				width = '85%';
			});
		} else if (visible) {
			width = '100%';
			hideTimer = setTimeout(() => {
				visible = false;
				width = '0';
			}, 300);
		}
	});
</script>

<div
	aria-hidden="true"
	class="fixed top-0 left-0 z-50 h-0.5 bg-bone transition-[width,opacity] duration-[1200ms,300ms] ease-out"
	class:opacity-0={!visible}
	style:width
></div>
