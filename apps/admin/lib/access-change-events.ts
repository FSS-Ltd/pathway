const EVENT_NAME = "pathway:access-changed";

export function notifyAccessChanged(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeToAccessChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
