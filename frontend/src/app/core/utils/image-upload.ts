const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.86;

interface ImageBitmapInfo {
	width: number;
	height: number;
}

function ensureImageType(file: File): void {
	if (!ACCEPTED_MIME_TYPES.has(file.type)) {
		throw new Error('Unsupported image type. Use JPG, PNG, or WEBP.');
	}
}

function ensureImageSize(file: File): void {
	if (file.size > MAX_INPUT_BYTES) {
		throw new Error('Image is too large. Maximum size is 20 MB.');
	}
}

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(objectUrl);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error('Failed to decode image file.'));
		};
		image.src = objectUrl;
	});
}

function computeTargetDimensions({ width, height }: ImageBitmapInfo): ImageBitmapInfo {
	if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
		return { width, height };
	}

	const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
	return {
		width: Math.max(1, Math.round(width * ratio)),
		height: Math.max(1, Math.round(height * ratio)),
	};
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Failed to process image for upload.'));
					return;
				}
				resolve(blob);
			},
			'image/jpeg',
			JPEG_QUALITY,
		);
	});
}

function normalizeName(fileName: string): string {
	const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
	return `${base || 'cover'}.jpg`;
}

export async function prepareCoverImageFile(file: File): Promise<File> {
	ensureImageType(file);
	ensureImageSize(file);

	const image = await loadImage(file);
	const target = computeTargetDimensions({ width: image.naturalWidth, height: image.naturalHeight });

	const canvas = document.createElement('canvas');
	canvas.width = target.width;
	canvas.height = target.height;

	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Unable to process image in this browser.');
	}

	context.drawImage(image, 0, 0, target.width, target.height);
	const blob = await canvasToBlob(canvas);

	return new File([blob], normalizeName(file.name), {
		type: 'image/jpeg',
		lastModified: Date.now(),
	});
}
