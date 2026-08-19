"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getWolfRoomChannelName,
  getWolfRoomPublicChannelName,
  WOLF_PLAY_UPDATED_EVENT,
  WOLF_ROOM_UPDATED_EVENT,
} from "./channels";
import { createPusherBrowserClient } from "./client";

// Khoảng thời gian poll dự phòng khi realtime mất kết nối (ms).
const DISCONNECTED_POLL_INTERVAL_MS = 5000;

type PresenceMember = {
  id: string;
};

type PresenceMembers = {
  each(callback: (member: PresenceMember) => void): void;
};

type PresenceChannel = {
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

type UseWolfRoomPresenceOptions = {
  enabled: boolean;
  mode?: "presence" | "public";
  roomCode: string;
  onRoomUpdate?: () => void | Promise<void>;
  onPlayUpdate?: () => void | Promise<void>;
};

function collectMemberIds(members: PresenceMembers) {
  const memberIds: string[] = [];
  members.each((member) => memberIds.push(member.id));
  return memberIds;
}

export function useWolfRoomPresence({
  enabled,
  mode = "presence",
  roomCode,
  onRoomUpdate,
  onPlayUpdate,
}: UseWolfRoomPresenceOptions) {
  const [connectionStatus, setConnectionStatus] = useState("Đang kết nối Người chơi...");
  const [isPresenceReady, setIsPresenceReady] = useState(false);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>([]);

  // Giữ callback trong ref để việc callback đổi identity không gây re-subscribe.
  const onRoomUpdateRef = useRef(onRoomUpdate);
  const onPlayUpdateRef = useRef(onPlayUpdate);

  useEffect(() => {
    onRoomUpdateRef.current = onRoomUpdate;
    onPlayUpdateRef.current = onPlayUpdate;
  });

  // Kéo lại snapshot mới nhất từ server (dùng khi (re)subscribe, reconnect, tab foreground, poll).
  const refetchState = useCallback(async () => {
    await Promise.all([
      Promise.resolve(onRoomUpdateRef.current?.()),
      Promise.resolve(onPlayUpdateRef.current?.()),
    ]);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;
    let subscribedChannelName: string | null = null;
    let subscribedChannel: PresenceChannel | null = null;
    let boundConnection: PusherConnection | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function startDisconnectedPolling() {
      if (pollTimer !== null) {
        return;
      }
      pollTimer = setInterval(() => {
        void refetchState();
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
      void refetchState();
    }

    function handleConnectionStateChange(data: unknown) {
      if (isCancelled) {
        return;
      }
      const current = (data as ConnectionStateChange).current;

      if (current === "connected") {
        // Reconnect: dừng poll và đồng bộ lại state (phòng khi đã lỡ event lúc mất kết nối).
        stopDisconnectedPolling();
        void refetchState();
        return;
      }

      if (current === "unavailable" || current === "disconnected" || current === "failed") {
        setConnectionStatus("Mất kết nối, đang kết nối lại...");
        setIsPresenceReady(false);
        startDisconnectedPolling();
      }
    }

    async function subscribeToPresence() {
      const pusher = await createPusherBrowserClient();

      if (isCancelled) {
        return;
      }

      if (!pusher) {
        setConnectionStatus("Người chơi chưa cấu hình");
        setIsPresenceReady(false);
        setOnlinePlayerIds([]);
        return;
      }

      const connection = (pusher as unknown as { connection?: PusherConnection }).connection ?? null;
      if (connection) {
        boundConnection = connection;
        connection.bind("state_change", handleConnectionStateChange);
      }

      const channelName = mode === "presence" ? getWolfRoomChannelName(roomCode) : getWolfRoomPublicChannelName(roomCode);
      const channel = pusher.subscribe(channelName) as unknown as PresenceChannel;

      subscribedChannelName = channelName;
      subscribedChannel = channel;

      channel.bind("pusher:subscription_succeeded", (members: unknown) => {
        setConnectionStatus("Người chơi đã kết nối");
        setIsPresenceReady(true);
        setOnlinePlayerIds(mode === "presence" ? collectMemberIds(members as PresenceMembers) : []);
        stopDisconnectedPolling();
        // (Re)subscribe thành công: luôn đồng bộ snapshot mới nhất để không kẹt ở state cũ.
        void refetchState();
      });
      channel.bind("pusher:subscription_error", () => {
        setConnectionStatus("Không thể xác thực Người chơi");
        setIsPresenceReady(false);
        setOnlinePlayerIds([]);
      });
      channel.bind("pusher:member_added", (member: unknown) => {
        const nextMember = member as PresenceMember;
        setOnlinePlayerIds((current) =>
          current.includes(nextMember.id) ? current : [...current, nextMember.id]
        );
      });
      channel.bind("pusher:member_removed", (member: unknown) => {
        const nextMember = member as PresenceMember;
        setOnlinePlayerIds((current) => current.filter((memberId) => memberId !== nextMember.id));
      });
      channel.bind(WOLF_ROOM_UPDATED_EVENT, () => {
        onRoomUpdateRef.current?.();
      });
      channel.bind(WOLF_PLAY_UPDATED_EVENT, () => {
        onPlayUpdateRef.current?.();
      });
    }

    void subscribeToPresence().catch(() => {
      if (!isCancelled) {
        setConnectionStatus("Không thể kết nối Người chơi");
        setIsPresenceReady(false);
        setOnlinePlayerIds([]);
      }
    });

    // Tab quay lại foreground (mobile background / laptop sleep) -> đồng bộ lại state.
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

      if (subscribedChannel && subscribedChannelName) {
        const channelNameToUnsubscribe = subscribedChannelName;
        subscribedChannel.unbind_all();
        void createPusherBrowserClient().then((pusher) => {
          pusher?.unsubscribe(channelNameToUnsubscribe);
        });
      }
    };
  }, [enabled, mode, roomCode, refetchState]);

  return {
    connectionStatus: !enabled ? "Vào phòng để kết nối Người chơi" : connectionStatus,
    isPresenceReady: enabled && isPresenceReady,
    onlinePlayerIds: enabled && mode === "presence" ? onlinePlayerIds : [],
  };
}
