import { type Request, type Response } from "express";

import type { ListBooksQueryDTO } from "../../dto/book.dto.js";
import { SeriesService } from "./series.service.js";

function parseFilters(query: Record<string, string | undefined>): ListBooksQueryDTO {
	return {
		q: query.q,
		title: query.title,
		author: query.author,
		series: query.series,
		genre: query.genre,
		language: query.language,
		limit: query.limit ? Number(query.limit) : undefined,
		offset: query.offset ? Number(query.offset) : undefined,
	};
}

export class SeriesController {
	static async listSeries(
		req: Request<unknown, unknown, unknown, Record<string, string | undefined>>,
		res: Response,
	) {
		const result = await SeriesService.listSeries(parseFilters(req.query));
		res.status(200).json(result);
	}

	static async getSeries(
		req: Request<
			{ seriesName?: string },
			unknown,
			unknown,
			Record<string, string | undefined>
		>,
		res: Response,
	) {
		const filters = parseFilters(req.query);
		const result = await SeriesService.getSeriesByName(
			String(req.params.seriesName),
			{
				q: filters.q,
				title: filters.title,
				author: filters.author,
				genre: filters.genre,
				language: filters.language,
			},
		);
		res.status(200).json(result);
	}
}