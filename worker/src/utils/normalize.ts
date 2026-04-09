export function normalizeWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = normalizeWhitespace(value);
	return normalized ? normalized : null;
}