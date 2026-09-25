export const MOBILE_NAVIGATION_OPEN_EVENT = "politica:open-mobile-navigation";

export function openMobileNavigation() {
  window.dispatchEvent(new Event(MOBILE_NAVIGATION_OPEN_EVENT));
}
