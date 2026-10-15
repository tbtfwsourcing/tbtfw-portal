// Inventory images are published at several widths with a _1920.jpg suffix convention.
export function sized(url: string | null | undefined, w: number): string {
	return url ? String(url).replace(/_1920\.jpg$/i, '_' + w + '.jpg') : '';
}

export interface Compressed {
	blob: Blob;
	type: string;
	w: number | null;
	h: number | null;
}

// Downscales to 1600px on the long edge and re-encodes as JPEG before upload.
// Non-images (PDF records) pass through untouched.
export function compress(file: File): Promise<Compressed> {
	return new Promise((res) => {
		if (!/^image\//.test(file.type)) {
			return res({ blob: file, type: file.type || 'application/octet-stream', w: null, h: null });
		}
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			const w = img.naturalWidth;
			const h = img.naturalHeight;
			const sc = Math.min(1, 1600 / Math.max(w, h));
			const cw = Math.max(1, Math.round(w * sc));
			const ch = Math.max(1, Math.round(h * sc));
			try {
				const c = document.createElement('canvas');
				c.width = cw;
				c.height = ch;
				c.getContext('2d')!.drawImage(img, 0, 0, cw, ch);
				c.toBlob(
					(b) => {
						URL.revokeObjectURL(url);
						res({
							blob: b ?? file,
							type: b ? 'image/jpeg' : file.type || 'image/jpeg',
							w: cw,
							h: ch
						});
					},
					'image/jpeg',
					0.82
				);
			} catch {
				URL.revokeObjectURL(url);
				res({ blob: file, type: file.type || 'image/jpeg', w, h });
			}
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			res({ blob: file, type: file.type || 'image/jpeg', w: null, h: null });
		};
		img.src = url;
	});
}
