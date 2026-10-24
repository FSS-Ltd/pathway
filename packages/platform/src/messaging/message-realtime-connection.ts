import type { MessageRealtimeSubscription } from "./realtime-events";

export type MessageRealtimeStatus = "connecting" | "live" | "disconnected";
export interface MessageRealtimeObserver {
  onState(state: "connected" | "disconnected"): void;
  onEvent(event: { notificationId?: string }): void;
}
export interface MessageRealtimeTransport {
  setAuth(token: string): Promise<void>;
  close(): void;
}
interface MessageRealtimeConnectionOptions {
  issueSubscription(signal: AbortSignal): Promise<MessageRealtimeSubscription>;
  openTransport(
    subscription: MessageRealtimeSubscription,
    observer: MessageRealtimeObserver,
  ): Promise<MessageRealtimeTransport>;
  onStatus(status: MessageRealtimeStatus): void;
  onInvalidate(signal: AbortSignal): Promise<void>;
  isAccessDenied(error: unknown): boolean;
  onAccessDenied(): void;
  onRefreshError(error: unknown): void;
}
export interface MessageRealtimeConnection {
  foreground(): void;
  refresh(): void;
  stop(): void;
}
export function createMessageRealtimeConnection(
  options: MessageRealtimeConnectionOptions,
): MessageRealtimeConnection {
  let stopped = false;
  let connected = false;
  let connectionGeneration = 0;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let transport: MessageRealtimeTransport | undefined;
  let previousSubscription: MessageRealtimeSubscription | undefined;
  let initialReadRequested = false;
  let reading = false;
  let dirty = false;
  let readRequest: AbortController | undefined;
  const seenNotifications = new Set<string>();

  function schedule(delay: number): void {
    clearTimeout(timer);
    timer = setTimeout(() => void authenticate(), delay);
  }

  function closeTransport(): void {
    connectionGeneration += 1;
    connected = false;
    const previous = transport;
    transport = undefined;
    previousSubscription = undefined;
    previous?.close();
  }

  async function read(): Promise<void> {
    if (reading || stopped) return;
    reading = true;
    try {
      while (dirty && !stopped) {
        dirty = false;
        const controller = new AbortController();
        readRequest = controller;
        try {
          await options.onInvalidate(controller.signal);
        } catch (error) {
          if (!stopped && !controller.signal.aborted)
            options.onRefreshError(error);
        }
      }
    } finally {
      reading = false;
      readRequest = undefined;
    }
  }

  function refresh(): void {
    if (stopped) return;
    initialReadRequested = true;
    dirty = true;
    void read();
  }

  function disconnected(): void {
    if (stopped) return;
    request?.abort();
    request = undefined;
    closeTransport();
    options.onStatus("disconnected");
    if (!initialReadRequested) refresh();
    schedule(Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5)));
  }

  function observer(generation: number): MessageRealtimeObserver {
    const current = () => !stopped && generation === connectionGeneration;
    return {
      onState(state) {
        if (!current()) return;
        if (state === "disconnected") {
          disconnected();
        } else if (!connected) {
          connected = true;
          attempts = 0;
          options.onStatus("live");
          refresh();
        }
      },
      onEvent(event) {
        if (!current()) return;
        if (event.notificationId) {
          if (seenNotifications.has(event.notificationId)) return;
          seenNotifications.add(event.notificationId);
          if (seenNotifications.size > 512) {
            const oldest = seenNotifications.values().next().value;
            if (oldest !== undefined) seenNotifications.delete(oldest);
          }
        }
        if (connected) refresh();
      },
    };
  }

  async function authenticate(): Promise<void> {
    if (stopped || request) return;
    const controller = new AbortController();
    request = controller;
    try {
      const subscription = await options.issueSubscription(controller.signal);
      if (stopped || controller.signal.aborted) return;
      const expiresAt = Date.parse(subscription.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error("Realtime subscription has expired");
      if (
        transport &&
        previousSubscription &&
        (previousSubscription.topic !== subscription.topic ||
          previousSubscription.url !== subscription.url ||
          previousSubscription.publishableKey !== subscription.publishableKey)
      ) {
        closeTransport();
        options.onStatus("connecting");
      }
      if (transport) {
        await transport.setAuth(subscription.token);
      } else {
        const generation = ++connectionGeneration;
        const opened = await options.openTransport(
          subscription,
          observer(generation),
        );
        if (stopped || generation !== connectionGeneration) {
          opened.close();
          return;
        }
        transport = opened;
      }
      if (stopped || controller.signal.aborted) return;
      previousSubscription = subscription;
      schedule(Math.max(1_000, expiresAt - Date.now() - 30_000));
    } catch (error) {
      if (stopped || controller.signal.aborted) return;
      if (options.isAccessDenied(error)) {
        options.onStatus("disconnected");
        stop();
        options.onAccessDenied();
      } else {
        disconnected();
      }
    } finally {
      if (request === controller) request = undefined;
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    dirty = false;
    request?.abort();
    readRequest?.abort();
    clearTimeout(timer);
    closeTransport();
    seenNotifications.clear();
  }

  options.onStatus("connecting");
  void authenticate();
  return {
    foreground: () => {
      if (connected || initialReadRequested) refresh();
    },
    refresh,
    stop,
  };
}
