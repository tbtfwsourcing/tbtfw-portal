// Global "something is in flight" flag. Drives the hairline progress bar and
// lets every submit handler bail if another request is already running.
// When a label is set ("Sending", "Uploading 2 of 5") the primary submit
// button shows it in place of its call to action.
export const busy = $state({ on: false, label: '' });

export function setBusy(on: boolean, label = ''): void {
	busy.on = on;
	busy.label = label;
}
