export const GLOBAL_SEARCH_OPEN_EVENT = "politica:open-global-search";

export function openGlobalSearch() {
  window.dispatchEvent(new Event(GLOBAL_SEARCH_OPEN_EVENT));
}
