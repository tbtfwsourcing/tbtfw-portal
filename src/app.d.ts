// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// Shallow-routing state: which portal screen is showing. Lets the browser
		// back button walk choice -> buy -> sell without a URL change.
		interface PageState {
			screen?: 'choice' | 'buy' | 'sell1' | 'sell2' | 'done';
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
