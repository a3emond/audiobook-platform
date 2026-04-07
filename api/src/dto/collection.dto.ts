import { IdDTO, PaginationMetaDTO, TimestampDTO } from './common.dto.js';

export interface CollectionDTO extends IdDTO, TimestampDTO {
  name: string;
  bookIds: string[];
  cover?: string | null;
}

export interface CreateCollectionDTO {
  name: string;
}

export interface UpdateCollectionDTO {
  name?: string;
  bookIds?: string[];
}

export interface ListCollectionsQueryDTO {
  limit?: number;
  offset?: number;
}

export interface ListCollectionsResponseDTO extends PaginationMetaDTO {
  collections: CollectionDTO[];
  total: number;
}
