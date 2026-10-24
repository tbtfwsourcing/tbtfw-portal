<script lang="ts">
	import { portal, browseAgain } from '#lib/portal/state.svelte.js';
	import { SITE } from '#lib/config.js';
	import TopBar from './TopBar.svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	const d = $derived(portal.done);
</script>

<div class="done">
	{#if d.photo}
		<div class="photo" aria-hidden="true">
			<img src={d.photo} alt="" />
			<div class="fade"></div>
		</div>
	{/if}
	<TopBar overlay={!!d.photo} />
	<div class="body rise" class:lift={!!d.photo}>
		<p class="eyebrow ok"><span class="tick" aria-hidden="true">&#10003;</span>Received <span class="num ref">{d.ref}</span></p>
		<h1 class="disp q">Thank you. A specialist will reply within the hour.</h1>
		{#if d.spec}<p class="eyebrow spec">{d.spec}</p>{/if}
		{#if d.note}<p class="num note">{d.note}</p>{/if}
		<nav class="links" aria-label="Next">
			<button type="button" class="link" onclick={browseAgain}>
				<span class="disp-sm">Find another car</span>
				<ArrowRightIcon class="size-4 text-mute" aria-hidden="true" />
			</button>
			<a href={SITE.home} class="link">
				<span class="disp-sm">Back to {SITE.home.replace('https://www.', '').replace('https://', '')}</span>
				<ArrowRightIcon class="size-4 text-mute" aria-hidden="true" />
			</a>
		</nav>
	</div>
</div>

<style>
	.done {
		position: relative;
		min-height: 100dvh;
		padding-bottom: env(safe-area-inset-bottom);
	}
	.photo {
		position: relative;
		height: 52dvh;
		min-height: 300px;
		overflow: hidden;
	}
	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 64%;
		animation: settle 2400ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	.fade {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			rgba(5, 5, 5, 0.86) 0%,
			rgba(5, 5, 5, 0.15) 30%,
			rgba(5, 5, 5, 0.3) 60%,
			var(--bg) 100%
		);
	}
	.body {
		position: relative;
		max-width: 560px;
		margin: 0 auto;
		padding: 40px 24px 32px;
	}
	.body.lift {
		margin-top: -48px;
		padding-top: 0;
	}
	.ok {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--bone);
	}
	.ref {
		color: var(--mute);
		letter-spacing: 0.16em;
	}
	.tick {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border: 1px solid var(--bone);
		border-radius: 999px;
		font-size: 10px;
		letter-spacing: 0;
	}
	.q {
		margin-top: 16px;
		font-size: 34px;
		text-wrap: balance;
	}
	.spec {
		margin-top: 18px;
	}
	.note {
		margin-top: 14px;
		font-size: 13px;
		color: var(--mute);
	}
	.links {
		margin-top: 44px;
	}
	.link {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		min-height: 60px;
		border-top: 1px solid var(--hair-strong);
		color: var(--fg);
		font-size: 16px;
		text-decoration: none;
		text-align: left;
		cursor: pointer;
		transition: color 0.2s;
	}
	.link:last-child {
		border-bottom: 1px solid var(--hair-strong);
	}
	.link:hover,
	.link:active {
		color: var(--bone);
	}
	@keyframes settle {
		from {
			transform: scale(1.06);
		}
	}
	@media (min-width: 900px) {
		.photo {
			height: 60dvh;
		}
		.q {
			font-size: 52px;
		}
		.body.lift {
			margin-top: -96px;
		}
	}
</style>
