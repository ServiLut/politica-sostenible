import { listVotingPlaces, type VotingPlace } from "./election-api";

export const INVENTORY_PLACE_PAGE_SIZE = 20;
export interface InventoryPlaceQuery {
  search: string;
  page: number;
}
export function changeInventoryPlaceSearch(
  search: string,
): InventoryPlaceQuery {
  return { search: search.trim(), page: 1 };
}
export function loadInventoryVotingPlaces(
  query: InventoryPlaceQuery,
  signal: AbortSignal,
) {
  return listVotingPlaces(
    { ...query, limit: INVENTORY_PLACE_PAGE_SIZE },
    signal,
  );
}
export function inventoryPlaceOptions(
  items: VotingPlace[],
  selected: VotingPlace | null,
) {
  return selected && !items.some((item) => item.id === selected.id)
    ? [selected, ...items]
    : items;
}
