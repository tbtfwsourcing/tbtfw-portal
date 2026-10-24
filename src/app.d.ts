// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// Shallow-routing state: which portal screen is showing, and which sheet is
		// open over it. Lets the browser back button walk the flow without a URL change.
		interface PageState {
			screen?: import('#lib/portal/state.svelte.js').Screen;
			sheet?: import('#lib/portal/state.svelte.js').Sheet;
			// Set when leaving the confirmation on purpose (see browseAgain).
			restart?: boolean;
		}
	}
	interface Window {
		turnstile?: {
			render: (el: HTMLElement | string, opts: Record<string, unknown>) => string;
			execute: (id: string, opts?: Record<string, unknown>) => void;
			remove: (id: string) => void;
		};
	}
}

export {};
