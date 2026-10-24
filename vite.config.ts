import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves this repo from /tbtfw-portal. Set BASE_PATH='' for a root deploy.
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: '404.html' }),
			paths: { base, relative: false },
			// Inline the CSS into each page so first paint does not wait on a stylesheet
			// round trip. GitHub Pages caches assets for only ten minutes, so a separate
			// file buys almost nothing; ~100 KB raw is ~20 KB gzipped in the HTML.
			inlineStyleThreshold: 150_000,
			prerender: { handleHttpError: 'warn' }
		})
	]
});
