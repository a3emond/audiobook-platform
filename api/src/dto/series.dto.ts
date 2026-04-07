import type { BookDTO } from "./book.dto.js";
import type { PaginationMetaDTO } from "./common.dto.js";

export interface SeriesListItemDTO {
	id: string;
	name: string;
	bookCount: number;
	totalDuration: number;
	authors: string[];
	genres: string[];
	coverPath?: string | null;
}

export interface SeriesListResponseDTO extends PaginationMetaDTO {
	series: SeriesListItemDTO[];
	total: number;
}

export interface SeriesDetailDTO {
	id: string;
	name: string;
	bookCount: number;
	totalDuration: number;
	authors: string[];
	genres: string[];
	books: BookDTO[];
}