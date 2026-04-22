export type EditorialScope = "library";

export type EditorialDisplayType = "fan_cards";

export type EditorialItemType = "series" | "book";

export interface EditorialBlockItemAdminDTO {
  id: string;
  itemType: EditorialItemType;
  target: string;
  position: number;
  badge?: string | null;
  kicker?: string | null;
  customTitle?: string | null;
  customImage?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
}

export interface EditorialBlockAdminDTO {
  id: string;
  slug: string;
  scope: EditorialScope;
  title: string;
  subtitle?: string | null;
  displayType: EditorialDisplayType;
  theme?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder: number;
  maxItems: number;
  items: EditorialBlockItemAdminDTO[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateEditorialBlockDTO {
  slug: string;
  scope?: EditorialScope;
  title: string;
  subtitle?: string | null;
  displayType?: EditorialDisplayType;
  theme?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
  maxItems?: number;
}

export interface UpdateEditorialBlockDTO {
  slug?: string;
  scope?: EditorialScope;
  title?: string;
  subtitle?: string | null;
  displayType?: EditorialDisplayType;
  theme?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
  maxItems?: number;
}

export interface UpsertEditorialBlockItemDTO {
  id?: string;
  itemType: EditorialItemType;
  target: string;
  position?: number;
  badge?: string | null;
  kicker?: string | null;
  customTitle?: string | null;
  customImage?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export interface ReplaceEditorialBlockItemsDTO {
  items: UpsertEditorialBlockItemDTO[];
}

export interface EditorialResolvedBookDTO {
  type: "book";
  id: string;
  title: string;
  author: string;
  series?: string | null;
  coverPath?: string | null;
}

export interface EditorialResolvedSeriesDTO {
  type: "series";
  name: string;
  bookCount: number;
  previewBooks: Array<{
    id: string;
    title: string;
    coverPath?: string | null;
  }>;
}

export interface EditorialBlockItemPublicDTO {
  id: string;
  itemType: EditorialItemType;
  target: string;
  position: number;
  badge?: string | null;
  kicker?: string | null;
  title?: string | null;
  image?: string | null;
  entity: EditorialResolvedBookDTO | EditorialResolvedSeriesDTO;
}

export interface EditorialBlockPublicDTO {
  id: string;
  slug: string;
  scope: EditorialScope;
  title: string;
  subtitle?: string | null;
  displayType: EditorialDisplayType;
  theme?: string | null;
  items: EditorialBlockItemPublicDTO[];
}

export interface ListEditorialBlocksPublicResponseDTO {
  blocks: EditorialBlockPublicDTO[];
}

export interface EditorialSeriesOptionDTO {
  name: string;
  bookCount: number;
}

export interface EditorialBookOptionDTO {
  id: string;
  title: string;
  author: string;
  series?: string | null;
}

export interface EditorialCatalogOptionsDTO {
  series: EditorialSeriesOptionDTO[];
  books: EditorialBookOptionDTO[];
}
