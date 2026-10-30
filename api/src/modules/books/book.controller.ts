/**
 * HTTP controller for audiobook catalog reads and admin-side metadata maintenance.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import { type Request, type Response } from "express";

import { ApiError } from "../../utils/api-error.js";
import { BookAiService } from "./book-ai.service.js";
import { BookReportService } from "./book-report.service.js";
import { parseListBooksQuery } from "./book.query.js";
import { BookService } from "./book.service.js";
import type {
	BulkBookUpdateDTO,
	UpdateBookMetadataDTO,
	UpdateChaptersDTO,
} from "../../dto/book.dto.js";

export class BookController {
	static async listBooks(
		req: Request<unknown, unknown, unknown, Record<string, string | undefined>>,
		res: Response,
	) {
		const result = await BookService.listBooks(parseListBooksQuery(req.query));

		res.status(200).json(result);
	}

	static async getFacets(
		req: Request<unknown, unknown, unknown, Record<string, string | undefined>>,
		res: Response,
	) {
		const result = await BookService.getFacets(parseListBooksQuery(req.query));
		res.status(200).json(result);
	}

	static async bulkUpdate(req: Request<unknown, unknown, BulkBookUpdateDTO>, res: Response) {
		const result = await BookService.bulkUpdate(req.body);
		res.status(200).json(result);
	}

	static async exportReport(
		req: Request<unknown, unknown, unknown, Record<string, string | undefined>>,
		res: Response,
	) {
		const language = req.query.language === "en" || req.query.language === "fr" ? req.query.language : undefined;
		const report = await BookReportService.buildReport({ includeAll: req.query.all === "true", language });
		const stamp = report.generatedAt.slice(0, 10);
		res.setHeader("Content-Disposition", `attachment; filename="metadata-report-${stamp}.json"`);
		res.status(200).type("application/json").send(JSON.stringify(report, null, 2));
	}

	// The filled report arrives as an uploaded file so large reports are not
	// constrained by the global JSON body limit.
	static async importReport(
		req: Request<unknown, unknown, { dryRun?: string }> & { file?: Express.Multer.File },
		res: Response,
	) {
		if (!req.file) {
			throw new ApiError(400, "report_file_required");
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(req.file.buffer.toString("utf8").replace(/^\uFEFF/, ""));
		} catch {
			throw new ApiError(400, "report_json_invalid");
		}

		const result = await BookReportService.importReport(parsed, { dryRun: req.body.dryRun !== "false" });
		res.status(200).json(result);
	}

	static async aiStatus(_req: Request, res: Response) {
		res.status(200).json({ enabled: BookAiService.isEnabled() });
	}

	static async aiSuggest(req: Request<{ bookId?: string }>, res: Response) {
		const result = await BookAiService.suggestMetadata(String(req.params.bookId));
		res.status(200).json(result);
	}

	static async getBook(req: Request<{ bookId?: string }>, res: Response) {
		const result = await BookService.getBookById(String(req.params.bookId));
		res.status(200).json(result);
	}

	static async updateMetadata(
		req: Request<{ bookId?: string }, unknown, UpdateBookMetadataDTO>,
		res: Response,
	) {
		const result = await BookService.updateMetadata(String(req.params.bookId), req.body);
		res.status(200).json(result);
	}

	static async updateChapters(
		req: Request<{ bookId?: string }, unknown, UpdateChaptersDTO>,
		res: Response,
	) {
		const result = await BookService.updateChapters(String(req.params.bookId), req.body);
		res.status(200).json(result);
	}

	static async extractCover(req: Request<{ bookId?: string }>, res: Response) {
		const jobId = await BookService.enqueueExtractCover(String(req.params.bookId));
		res.status(202).json({ queued: true, jobId });
	}

	static async deleteBook(req: Request<{ bookId?: string }>, res: Response) {
		const jobId = await BookService.enqueueDeleteBook(String(req.params.bookId));
		res.status(202).json({ queued: true, jobId });
	}
}
