"use client";

import { useCallback, useEffect, useRef } from "react";
import { getWolfLobbyChannelName, WOLF_LOBBY_UPDATED_EVENT } from "./channels";
import { createPusherBrowserClient } from "./client";

// Khoảng thời gian poll dự phòng khi realtime mất kết nối (ms).
const DISCONNECTED_POLL_INTERVAL_MS = 5000;

type LobbyChannel = {
  bind(eventName: string, callback: (data: unknown) => void): void;
  unbind_all(): void;
};

type PusherConnection = {
  state?: string;
  bind(eventName: string, callback: (data: unknown) => void): void;
  unbind(eventName: string, callback: (data: unknown) => void): void;
};

type ConnectionStateChange = {
  previous?: string;
  current?: string;
};

type UseWolfLobbyUpdatesOptions = {
  enabled: boolean;
  onLobbyUpdate: () => void | Promise<void>;
};

/**
 * Lắng nghe kênh lobby chung để danh sách phòng public tự cập nhật realtime
 * (phòng mới, phòng đóng, số người chơi thay đổi) mà không cần bấm làm mới.
 */
export function useWolfLobbyUpdates({ enabled, onLobbyUpdate }: UseWolfLobbyUpdatesOptions) {
  // Giữ callback trong ref để việc callback đổi identity không gây re-subscribe.
  const onLobbyUpdateRef = useRef(onLobbyUpdate);

  useEffect(() => {
    onLobbyUpdateRef.current = onLobbyUpdate;
  });

  const refetchRooms = useCallback(async () => {
    await Promise.resolve(onLobbyUpdateRef.current());
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;
    let subscribedChannel: LobbyChannel | null = null;
    let boundConnection: PusherConnection | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function startDisconnectedPolling() {
      if (pollTimer !== null) {
        return;
      }
      pollTimer = setInterval(() => {
        void refetchRooms();
      }, DISCONNECTED_POLL_INTERVAL_MS);
    }

    function stopDisconnectedPolling() {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function handleForegroundRefetch() {
      if (isCancelled) {
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void refetchRooms();
    }

    function handleConnectionStateChange(data: unknown) {
      if (isCancelled) {
        return;
      }
      const current = (data as ConnectionStateChange).current;

      if (current === "connected") {
        // Reconnect: dừng poll và đồng bộ lại danh sách (phòng khi đã lỡ event lúc mất kết nối).
        stopDisconnectedPolling();
        void refetchRooms();
        return;
      }

      if (current === "unavailable" || current === "disconnected" || current === "failed") {
        startDisconnectedPolling();
      }
    }

    async function subscribeToLobby() {
      const pusher = await createPusherBrowserClient();

      if (isCancelled || !pusher) {
        // Chưa cấu hình Pusher: vẫn giữ danh sách tươi bằng poll.
        if (!isCancelled) {
          startDisconnectedPolling();
        }
        return;
      }

      const connection = (pusher as unknown as { connection?: PusherConnection }).connection ?? null;
      if (connection) {
        boundConnection = connection;
        connection.bind("state_change", handleConnectionStateChange);
      }

      const channel = pusher.subscribe(getWolfLobbyChannelName()) as unknown as LobbyChannel;
      subscribedChannel = channel;

      channel.bind("pusher:subscription_succeeded", () => {
        stopDisconnectedPolling();
        // (Re)subscribe thành công: đồng bộ snapshot mới nhất để không kẹt ở danh sách cũ.
        void refetchRooms();
      });
      channel.bind("pusher:subscription_error", () => {
        startDisconnectedPolling();
      });
      channel.bind(WOLF_LOBBY_UPDATED_EVENT, () => {
        void refetchRooms();
      });
    }

    void subscribeToLobby().catch(() => {
      if (!isCancelled) {
        startDisconnectedPolling();
      }
    });

    // Tab quay lại foreground (mobile background / laptop sleep) -> đồng bộ lại danh sách.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleForegroundRefetch);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleForegroundRefetch);
    }

    return () => {
      isCancelled = true;
      stopDisconnectedPolling();

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleForegroundRefetch);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleForegroundRefetch);
      }

      if (boundConnection) {
        boundConnection.unbind("state_change", handleConnectionStateChange);
        boundConnection = null;
      }

      if (subscribedChannel) {
        const channelName = getWolfLobbyChannelName();
        subscribedChannel.unbind_all();
        void createPusherBrowserClient().then((pusher) => {
          pusher?.unsubscribe(channelName);
        });
      }
    };
  }, [enabled, refetchRooms]);
}
