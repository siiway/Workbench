import { useEffect } from "react";

type TodoPayload = {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  completed: boolean;
  sortOrder: number;
  commentCount: number;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedByAvatar: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WsEvent =
  | { type: "todo:created"; setId: string; todo: TodoPayload }
  | {
      type: "todo:updated";
      setId: string;
      todo: Partial<TodoPayload> & { id: string };
    }
  | { type: "todo:deleted"; setId: string; id: string }
  | {
      type: "todo:reordered";
      setId: string;
      items: { id: string; sortOrder: number }[];
    }
  | {
      type: "todo:claimed";
      setId: string;
      id: string;
      claimedBy: string | null;
      claimedByName: string | null;
      claimedByAvatar: string | null;
    };

type Options = {
  teamId: string;
  setId: string;
  onEvent: (event: WsEvent) => void;
  enabled?: boolean;
};

/**
 * Subscribes to realtime todo events for a set. Tries WebSocket first, falls
 * back to SSE if the upgrade fails. Both transports are proxied through
 * /api/glint/... so the BFF injects the bearer token.
 */
export function useRealtimeSync({
  teamId,
  setId,
  onEvent,
  enabled = true,
}: Options) {
  useEffect(() => {
    if (!enabled || !teamId || !setId) return;

    let unmounted = false;
    let cleanup: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 500;

    const scheduleRetry = (fn: () => void) => {
      const delay = retryDelay;
      retryDelay = Math.min(delay * 2, 30000);
      retry = setTimeout(fn, delay);
    };

    const sseUrl = `/api/glint/teams/${teamId}/sets/${setId}/sse`;
    const wsUrl = (() => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}/api/glint/teams/${teamId}/sets/${setId}/ws`;
    })();

    const connectSse = () => {
      if (unmounted) return;
      const es = new EventSource(sseUrl);
      es.onopen = () => {
        retryDelay = 500;
      };
      es.onmessage = (ev) => {
        try {
          onEvent(JSON.parse(ev.data as string) as WsEvent);
        } catch (error) {
          void error;
        }
      };
      es.onerror = () => {
        es.close();
        if (unmounted) return;
        scheduleRetry(connectSse);
      };
      cleanup = () => es.close();
    };

    const connectWs = (fallbackToSse: boolean) => {
      if (unmounted) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        if (fallbackToSse) connectSse();
        return;
      }
      socket.onopen = () => {
        retryDelay = 500;
      };
      socket.onmessage = (ev) => {
        try {
          onEvent(JSON.parse(ev.data as string) as WsEvent);
        } catch (error) {
          void error;
        }
      };
      socket.onclose = () => {
        if (unmounted) return;
        if (fallbackToSse) {
          connectSse();
          return;
        }
        scheduleRetry(() => connectWs(false));
      };
      socket.onerror = () => socket.close();
      cleanup = () => socket.close();
    };

    connectWs(true);

    return () => {
      unmounted = true;
      if (retry) clearTimeout(retry);
      cleanup?.();
    };
  }, [teamId, setId, onEvent, enabled]);
}
