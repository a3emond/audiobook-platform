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

//used to evercome issues with sting-based free-form tags (e.g. "Sci-Fi", "sci fi", "sci_fi" should all be normalized to "sci-fi")
export function normalizeTagToken(value: string): string { 
	return value
		.trim()
		.toLocaleLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function normalizeTagList(values: unknown): string[] {
	if (!Array.isArray(values)) {
		return [];
	}

	const normalized = values
		.filter((value): value is string => typeof value === "string")
		.map((value) => normalizeTagToken(value))
		.filter(Boolean);

	return Array.from(new Set(normalized));
}