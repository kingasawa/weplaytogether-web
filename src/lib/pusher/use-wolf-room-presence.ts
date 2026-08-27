"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getWolfRoomChannelName,
  getWolfRoomPublicChannelName,
  WOLF_PLAY_UPDATED_EVENT,
  WOLF_ROOM_UPDATED_EVENT,
} from "./channels";
import { createPusherBrowserClient, reconnectPusherBrowserClient } from "./client";
import type { PusherConnectionLike } from "./client";

// Poll dự phòng khi realtime đang khỏe (chỉ để bắt event bị rơi).
const HEALTHY_POLL_INTERVAL_MS = 8000;
// Poll dự phòng khi realtime đã mất kết nối.
const DISCONNECTED_POLL_INTERVAL_MS = 2500;

// Thang khôi phục tự động, tính từ lần đồng bộ thành công gần nhất:
// - quá SOFT: ép pusher reconnect + kéo lại state ngay.
// - quá HARD: reload cứng cả trang (lối thoát duy nhất khi server action đã hỏng,
//   ví dụ client cũ còn mở sau khi deploy bản mới -> action id không còn tồn tại).
const SOFT_RECOVERY_THRESHOLD_MS = 20000;
const HARD_RELOAD_THRESHOLD_MS = 45000;
const RECOVERY_CHECK_INTERVAL_MS = 3000;
// Chặn vòng lặp reload vô hạn khi lỗi nằm ở phía server.
const MIN_AUTO_RELOAD_GAP_MS = 90000;
const AUTO_RELOAD_STORAGE_KEY = "wpt:last-auto-reload-at";

// Rải ngẫu nhiên thời điểm mỗi client gọi lại server action sau một broadcast, để tránh
// tất cả người chơi cùng gọi getWolfPlayState trong cùng một khoảnh khắc (ví dụ lúc bỏ phiếu
// gần cuối ván, nhiều người vote dồn dập) — nguyên nhân chính gây lỗi Cloudflare 1102 do
// quá nhiều request đồng thời dồn vào cùng một isolate.
const REALTIME_EVENT_JITTER_MS = 700;

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
  // Tắt poll + tự khôi phục khi không còn gì để chờ (ví dụ ván đã có kết quả).
  pollingEnabled?: boolean;
};

function collectMemberIds(members: PresenceMembers) {
  const memberIds: string[] = [];
  members.each((member) => memberIds.push(member.id));
  return memberIds;
}

// Reload cứng, nhưng chỉ khi lần reload tự động gần nhất đã đủ xa để không tạo vòng lặp.
function tryHardReload() {
  if (typeof window === "undefined") {
    return;
  }

  // Đang mất mạng thì reload chỉ cho ra trang lỗi và mất luôn màn chơi.
  // Cứ giữ nguyên state cũ, poll sẽ tự bắt lại khi có mạng.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  const now = Date.now();

  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY) ?? "0");

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < MIN_AUTO_RELOAD_GAP_MS) {
      return;
    }

    window.sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // sessionStorage bị chặn (private mode...) -> vẫn reload, chấp nhận không có guard.
  }

  window.location.reload();
}

export function useWolfRoomPresence({
  enabled,
  mode = "presence",
  roomCode,
  onRoomUpdate,
  onPlayUpdate,
  pollingEnabled = true,
}: UseWolfRoomPresenceOptions) {
  const [connectionStatus, setConnectionStatus] = useState("Đang kết nối Người chơi...");
  const [isPresenceReady, setIsPresenceReady] = useState(false);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>([]);
  const [isRealtimeDown, setIsRealtimeDown] = useState(false);

  // Giữ callback trong ref để việc callback đổi identity không gây re-subscribe.
  const onRoomUpdateRef = useRef(onRoomUpdate);
  const onPlayUpdateRef = useRef(onPlayUpdate);
  // Mốc đồng bộ thành công gần nhất — cơ sở để phát hiện "kẹt phase".
  // Khởi tạo 0 và set trong effect: Date.now() không được gọi lúc render.
  const lastSyncedAtRef = useRef(0);
  const isSoftRecoveringRef = useRef(false);
  // Timer đang chờ để gọi refetchState sau một broadcast (xem REALTIME_EVENT_JITTER_MS).
  const pendingEventRefetchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onRoomUpdateRef.current = onRoomUpdate;
    onPlayUpdateRef.current = onPlayUpdate;
  });

  // Kéo lại snapshot mới nhất từ server (dùng khi (re)subscribe, reconnect, foreground, poll).
  const refetchState = useCallback(async () => {
    try {
      await Promise.all([
        Promise.resolve(onRoomUpdateRef.current?.()),
        Promise.resolve(onPlayUpdateRef.current?.()),
      ]);
      lastSyncedAtRef.current = Date.now();
      return true;
    } catch {
      // Nuốt lỗi để interval không chết; lastSyncedAt không đổi -> thang khôi phục sẽ tự leo.
      return false;
    }
  }, []);

  // Gộp nhiều broadcast liên tiếp (nhiều người cùng vote/thao tác) thành một lần refetch,
  // và rải thời điểm gọi ra trong REALTIME_EVENT_JITTER_MS để không dồn request đồng thời.
  const scheduleRefetchFromEvent = useCallback(() => {
    if (pendingEventRefetchTimerRef.current != null) {
      return;
    }

    pendingEventRefetchTimerRef.current = window.setTimeout(() => {
      pendingEventRefetchTimerRef.current = null;
      void refetchState();
    }, Math.random() * REALTIME_EVENT_JITTER_MS);
  }, [refetchState]);

  // --- Subscribe realtime ---
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isCancelled = false;
    let subscribedChannelName: string | null = null;
    let subscribedChannel: PresenceChannel | null = null;
    let boundConnection: PusherConnectionLike | null = null;

    function handleConnectionStateChange(data: unknown) {
      if (isCancelled) {
        return;
      }
      const current = (data as ConnectionStateChange).current;

      if (current === "connected") {
        // Reconnect: đồng bộ lại state (phòng khi đã lỡ event lúc mất kết nối).
        setIsRealtimeDown(false);
        void refetchState();
        return;
      }

      if (current === "unavailable" || current === "disconnected" || current === "failed") {
        setConnectionStatus("Mất kết nối, đang kết nối lại...");
        setIsPresenceReady(false);
        setIsRealtimeDown(true);
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

      const connection = pusher.connection ?? null;
      if (connection) {
        boundConnection = connection;
        connection.bind("state_change", handleConnectionStateChange);
      }

      const channelName =
        mode === "presence" ? getWolfRoomChannelName(roomCode) : getWolfRoomPublicChannelName(roomCode);
      const channel = pusher.subscribe(channelName) as unknown as PresenceChannel;

      subscribedChannelName = channelName;
      subscribedChannel = channel;

      channel.bind("pusher:subscription_succeeded", (members: unknown) => {
        setConnectionStatus("Người chơi đã kết nối");
        setIsPresenceReady(true);
        setIsRealtimeDown(false);
        setOnlinePlayerIds(mode === "presence" ? collectMemberIds(members as PresenceMembers) : []);
        // (Re)subscribe thành công: luôn đồng bộ snapshot mới nhất để không kẹt ở state cũ.
        void refetchState();
      });
      channel.bind("pusher:subscription_error", () => {
        setConnectionStatus("Không thể xác thực Người chơi");
        setIsPresenceReady(false);
        setIsRealtimeDown(true);
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
        scheduleRefetchFromEvent();
      });
      channel.bind(WOLF_PLAY_UPDATED_EVENT, () => {
        scheduleRefetchFromEvent();
      });
    }

    void subscribeToPresence().catch(() => {
      if (!isCancelled) {
        setConnectionStatus("Không thể kết nối Người chơi");
        setIsPresenceReady(false);
        setIsRealtimeDown(true);
        setOnlinePlayerIds([]);
      }
    });

    return () => {
      isCancelled = true;

      if (pendingEventRefetchTimerRef.current != null) {
        window.clearTimeout(pendingEventRefetchTimerRef.current);
        pendingEventRefetchTimerRef.current = null;
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
  }, [enabled, mode, roomCode, refetchState, scheduleRefetchFromEvent]);

  // --- Poll dự phòng ---
  // Luôn chạy khi còn đang chờ state đổi. Đây là lưới an toàn cho trường hợp iOS PWA
  // giết socket im lặng: pusher vẫn báo "connected" nhưng không còn event nào tới.
  useEffect(() => {
    if (!enabled || !pollingEnabled) {
      return;
    }

    const intervalMs = isRealtimeDown ? DISCONNECTED_POLL_INTERVAL_MS : HEALTHY_POLL_INTERVAL_MS;
    const pollTimer = window.setInterval(() => {
      void refetchState();
    }, intervalMs);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [enabled, pollingEnabled, isRealtimeDown, refetchState]);

  // --- Quay lại foreground ---
  // Trên iOS standalone, quay lại app có thể khôi phục từ bfcache (chỉ bắn `pageshow`),
  // nên phải nghe cả ba sự kiện.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    function handleForeground() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void reconnectPusherBrowserClient().catch(() => undefined);
      void refetchState();
    }

    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("focus", handleForeground);
    window.addEventListener("pageshow", handleForeground);

    return () => {
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("focus", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
    };
  }, [enabled, refetchState]);

  // --- Tự khôi phục khi kẹt ---
  // Không cần người chơi bấm gì: quá SOFT -> ép reconnect + kéo state,
  // quá HARD (kể cả server action cũng hỏng) -> reload cứng cả trang.
  useEffect(() => {
    if (!enabled || !pollingEnabled || typeof window === "undefined") {
      return;
    }

    // Đếm lại từ lúc effect chạy (mount, hoặc khi bật lại polling sau phase result)
    // để không reload oan bằng một mốc đã cũ từ lúc polling còn tắt.
    lastSyncedAtRef.current = Date.now();

    const recoveryTimer = window.setInterval(() => {
      const stuckForMs = Date.now() - lastSyncedAtRef.current;

      if (stuckForMs >= HARD_RELOAD_THRESHOLD_MS) {
        tryHardReload();
        return;
      }

      if (stuckForMs >= SOFT_RECOVERY_THRESHOLD_MS && !isSoftRecoveringRef.current) {
        isSoftRecoveringRef.current = true;
        setConnectionStatus("Mất đồng bộ, đang tự khôi phục...");
        void reconnectPusherBrowserClient()
          .catch(() => undefined)
          .then(() => refetchState())
          .finally(() => {
            isSoftRecoveringRef.current = false;
          });
      }
    }, RECOVERY_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(recoveryTimer);
    };
  }, [enabled, pollingEnabled, refetchState]);

  return {
    connectionStatus: !enabled ? "Vào phòng để kết nối Người chơi" : connectionStatus,
    isPresenceReady: enabled && isPresenceReady,
    onlinePlayerIds: enabled && mode === "presence" ? onlinePlayerIds : [],
  };
}
