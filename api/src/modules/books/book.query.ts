import type { ListBooksQueryDTO } from "../../dto/book.dto.js";

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toContainsRegex(value: string): RegExp {
	return new RegExp(escapeRegex(value.trim()), "i");
}

export function buildBookFilterConditions(
	filters: ListBooksQueryDTO,
): Record<string, unknown>[] {
	const conditions: Record<string, unknown>[] = [];

	if (filters.q && filters.q.trim()) {
		const matcher = toContainsRegex(filters.q);
		conditions.push({
			$or: [
				{ title: matcher },
				{ author: matcher },
				{ series: matcher },
				{ genre: matcher },
				{ tags: matcher },
			],
		});
	}

	if (filters.title && filters.title.trim()) {
		conditions.push({ title: toContainsRegex(filters.title) });
	}

	if (filters.author && filters.author.trim()) {
		conditions.push({ author: toContainsRegex(filters.author) });
	}

	if (filters.series && filters.series.trim()) {
		conditions.push({ series: toContainsRegex(filters.series) });
	}

	if (filters.genre && filters.genre.trim()) {
		conditions.push({ genre: toContainsRegex(filters.genre) });
	}

	if (filters.language && filters.language.trim()) {
		conditions.push({ language: toContainsRegex(filters.language) });
	}

	return conditions;
}

export function buildBookQuery(filters: ListBooksQueryDTO): Record<string, unknown> {
	const conditions = buildBookFilterConditions(filters);

	if (conditions.length === 0) {
		return {};
	}

	if (conditions.length === 1) {
		return conditions[0];
	}

	return { $and: conditions };
}