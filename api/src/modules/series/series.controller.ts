/**
 * HTTP controller for series-level catalog browsing and grouping.
 * Controllers in this API are intentionally thin: they translate Express
 * request data into validated service inputs and choose response status codes,
 * while the real business rules live below in the service/model layer.
 */
import { type Request, type Response } from "express";

import { parseListBooksQuery } from "../books/book.query.js";
import { SeriesService } from "./series.service.js";


export class SeriesController {
	static async listSeries(
		req: Request<unknown, unknown, unknown, Record<string, string | undefined>>,
		res: Response,
	) {
		const result = await SeriesService.listSeries(parseListBooksQuery(req.query));
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
		const filters = parseListBooksQuery(req.query);
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