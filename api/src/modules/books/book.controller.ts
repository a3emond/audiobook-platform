import { type Request, type Response } from "express";

import { BookService } from "./book.service.js";
import type {
	ListBooksQueryDTO,
	UpdateBookMetadataDTO,
	UpdateChaptersDTO,
} from "../../dto/book.dto.js";

export class BookController {
	static async listBooks(
		req: Request<unknown, unknown, unknown, Record<string, string | undefined>>,
		res: Response,
	) {
		const filters: ListBooksQueryDTO = {
			q: req.query.q,
			title: req.query.title,
			author: req.query.author,
			series: req.query.series,
			genre: req.query.genre,
			language: req.query.language,
			limit: req.query.limit ? Number(req.query.limit) : undefined,
			offset: req.query.offset ? Number(req.query.offset) : undefined,
		};

		const result = await BookService.listBooks(filters);

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
