/**
 * AI-assisted metadata lookup for the admin book editor.
 * Claude searches the web for the audiobook and reports what it found through a
 * strict `submit_metadata` tool. Nothing is written here: suggestions go back
 * to the admin, who picks which fields to apply before saving.
 */
import path from "node:path";
// Named imports: the dev container runs through ts-node, which mis-resolves
// the SDK's default export under NodeNext even though tsc accepts it.
import { Anthropic, APIError, AuthenticationError, RateLimitError } from "@anthropic-ai/sdk";

import type { AiMetadataSuggestionDTO } from "../../dto/book.dto.js";
import { logger } from "../../config/logger.js";
import { ApiError } from "../../utils/api-error.js";
import { BookService } from "./book.service.js";

const MODEL = process.env.AI_METADATA_MODEL || "claude-opus-5-5";
const MAX_CONTINUATIONS = 4;

const SYSTEM_PROMPT = `You are a meticulous audiobook metadata librarian for a personal audiobook server.
Given what the server currently knows about one audiobook, search the web (publisher pages, Audible, Goodreads, Open Library, Wikipedia, the author's site) to identify the exact book and fill in accurate metadata.

Rules:
- Identify the specific book first. The current title may be a file name or contain noise like "(Unabridged)", "Book 3", narrator names or track numbers; strip that from the title.
- "author" is the book's author, never the narrator.
- "series" is the canonical series name without the number; "seriesIndex" is the book's number in that series (decimals allowed, e.g. 2.5 for novellas). Use null for both when the book is standalone.
- "genre" is one broad genre in English title case (e.g. "Fantasy", "Science Fiction", "Thriller", "LitRPG", "Biography").
- "tags" are 3 to 8 short lowercase descriptors a listener would filter by (subgenres, themes, tone), e.g. "progression fantasy", "space opera", "found family".
- "description" is a 2 to 4 sentence spoiler-free synopsis written in the book's language ("fr" or "en"), in your own words rather than copied marketing copy.
- "language" is the language of this edition: "en", "fr", or "unknown".
- Use null for anything you could not confirm. Never invent a series or number.
- Set "confidence" to "low" when you are unsure you found the right book, and explain why in "notes".

When you are done researching, call submit_metadata exactly once with your answer. Do not reply with plain text.`;

const SUBMIT_TOOL = {
	name: "submit_metadata",
	description: "Submit the researched metadata for the audiobook. Call this exactly once, after researching.",
	strict: true,
	input_schema: {
		type: "object" as const,
		properties: {
			title: { type: ["string", "null"], description: "Clean book title" },
			author: { type: ["string", "null"], description: "Author name(s), comma separated" },
			series: { type: ["string", "null"], description: "Series name without number" },
			seriesIndex: { type: ["number", "null"], description: "Position in the series" },
			genre: { type: ["string", "null"] },
			language: { type: "string", enum: ["en", "fr", "unknown"] },
			tags: { type: "array", items: { type: "string" } },
			description: { type: ["string", "null"] },
			confidence: { type: "string", enum: ["high", "medium", "low"] },
			notes: { type: ["string", "null"], description: "Caveats for the admin, or null" },
		},
		required: [
			"title",
			"author",
			"series",
			"seriesIndex",
			"genre",
			"language",
			"tags",
			"description",
			"confidence",
			"notes",
		],
		additionalProperties: false,
	},
};

type SubmittedMetadata = Omit<AiMetadataSuggestionDTO, "sources">;

let client: Anthropic | null = null;

function getClient(): Anthropic {
	client ??= new Anthropic();
	return client;
}

function cleanText(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Strict tool use guarantees the shape, but the values still come from a model,
// so they are normalised before reaching the admin UI.
function normaliseSubmission(input: unknown): SubmittedMetadata {
	const raw = (input ?? {}) as Record<string, unknown>;
	const seriesIndex = typeof raw.seriesIndex === "number" && raw.seriesIndex >= 0 ? raw.seriesIndex : null;
	const language = raw.language === "en" || raw.language === "fr" ? raw.language : null;
	const confidence =
		raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
			? raw.confidence
			: "low";

	return {
		title: cleanText(raw.title),
		author: cleanText(raw.author),
		series: cleanText(raw.series),
		seriesIndex,
		genre: cleanText(raw.genre),
		language,
		tags: Array.isArray(raw.tags)
			? Array.from(new Set(raw.tags.map((tag) => cleanText(tag)?.toLowerCase()).filter((tag): tag is string => !!tag))).slice(0, 12)
			: [],
		description: cleanText(raw.description),
		confidence,
		notes: cleanText(raw.notes),
	};
}

function collectSources(content: Anthropic.Beta.BetaContentBlock[], into: Map<string, string>): void {
	for (const block of content) {
		if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) {
			continue;
		}
		for (const result of block.content) {
			if (result.type === "web_search_result" && !into.has(result.url)) {
				into.set(result.url, result.title);
			}
		}
	}
}

export class BookAiService {
	static isEnabled(): boolean {
		return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
	}

	static async suggestMetadata(bookId: string): Promise<AiMetadataSuggestionDTO> {
		if (!BookAiService.isEnabled()) {
			throw new ApiError(503, "ai_not_configured");
		}

		const book = await BookService.getBookById(bookId);
		const known = {
			title: book.title,
			author: book.author,
			series: book.series ?? null,
			seriesIndex: book.seriesIndex ?? null,
			genre: book.genre ?? null,
			language: book.language ?? null,
			tags: book.tags,
			description: book.description.default ?? book.description.en ?? book.description.fr ?? null,
			fileName: path.basename(book.filePath),
			durationHours: Math.round((book.duration / 3600) * 10) / 10,
			firstChapters: book.chapters.slice(0, 5).map((chapter) => chapter.title),
		};

		const messages: Anthropic.Beta.BetaMessageParam[] = [
			{
				role: "user",
				content: `Here is what the server currently knows about this audiobook:\n\n${JSON.stringify(known, null, 2)}\n\nResearch it and submit the metadata.`,
			},
		];
		const sources = new Map<string, string>();

		try {
			// Server-side web search can pause long turns (pause_turn); resending the
			// conversation lets the model pick up where it stopped.
			for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt += 1) {
				const response = await getClient().beta.messages.create({
					model: MODEL,
					max_tokens: 16000,
					betas: ["server-side-fallback-2026-07-01"],
					fallbacks: "default",
					thinking: { type: "adaptive" },
					output_config: { effort: "medium" },
					system: SYSTEM_PROMPT,
					tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }, SUBMIT_TOOL],
					messages,
				});

				collectSources(response.content, sources);

				const submission = response.content.find(
					(block): block is Anthropic.Beta.BetaToolUseBlock =>
						block.type === "tool_use" && block.name === "submit_metadata",
				);
				if (submission) {
					return {
						...normaliseSubmission(submission.input),
						sources: Array.from(sources, ([url, title]) => ({ url, title })).slice(0, 8),
					};
				}

				if (response.stop_reason === "refusal") {
					throw new ApiError(422, "ai_refused");
				}

				messages.push({ role: "assistant", content: response.content });
				if (response.stop_reason !== "pause_turn") {
					// The model answered in prose instead of calling the tool; nudge it once more.
					messages.push({ role: "user", content: "Please call submit_metadata with your findings now." });
				}
			}
		} catch (error) {
			if (error instanceof ApiError) {
				throw error;
			}
			if (error instanceof AuthenticationError) {
				logger.error("AI metadata lookup: Anthropic authentication failed");
				throw new ApiError(503, "ai_auth_failed");
			}
			if (error instanceof RateLimitError) {
				throw new ApiError(429, "ai_rate_limited");
			}
			if (error instanceof APIError) {
				logger.error("AI metadata lookup failed", { status: error.status, message: error.message });
				throw new ApiError(502, "ai_upstream_error");
			}
			throw error;
		}

		throw new ApiError(502, "ai_no_result");
	}
}
