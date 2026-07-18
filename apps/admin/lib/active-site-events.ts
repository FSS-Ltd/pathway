const ACTIVE_SITE_CHANGED_EVENT = "pathway:active-site-changed";

function getBrowserEventTarget(): EventTarget | null {
  return typeof window === "undefined" ? null : window;
}

export function notifyActiveSiteChanged(
  target: EventTarget | null = getBrowserEventTarget(),
): void {
  if (target) {
    target.dispatchEvent(new Event(ACTIVE_SITE_CHANGED_EVENT));
  }
}

export function subscribeToActiveSiteChanges(
  listener: () => void,
  target: EventTarget | null = getBrowserEventTarget(),
): () => void {
  if (!target) {
    return () => undefined;
  }

  target.addEventListener(ACTIVE_SITE_CHANGED_EVENT, listener);
  return () => target.removeEventListener(ACTIVE_SITE_CHANGED_EVENT, listener);
}
