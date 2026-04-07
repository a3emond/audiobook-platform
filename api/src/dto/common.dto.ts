export interface IdDTO {
  id: string;
}

export interface TimestampDTO {
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginationMetaDTO {
  limit: number;
  offset: number;
  hasMore: boolean;
}
