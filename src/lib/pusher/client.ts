"use client";

// iOS (nhất là PWA standalone) giết WebSocket khi app bị treo/nền mà không báo close.
// Mặc định pusher-js chỉ ping sau 120s idle + chờ pong 30s -> mất tới ~2.5 phút mới
// nhận ra kết nối đã chết. Hạ xuống để phát hiện trong ~20s và reconnect sớm.
const ACTIVITY_TIMEOUT_MS = 15000;
const PONG_TIMEOUT_MS = 7000;

type PusherChannel = {
  bind(eventName: string, callback: (data: unknown) => void): void;
  unbind_all(): void;
};

export type PusherConnectionLike = {
  state?: string;
  connect?(): void;
  bind(eventName: string, callback: (data: unknown) => void): void;
  unbind(eventName: string, callback: (data: unknown) => void): void;
};

type PusherClient = {
  connection?: PusherConnectionLike;
  subscribe(channelName: string): PusherChannel;
  unsubscribe(channelName: string): void;
};

type PusherConstructor = new (
  key: string,
  options: {
    cluster: string;
    activityTimeout: number;
    pongTimeout: number;
    channelAuthorization: {
      endpoint: string;
      transport: "ajax";
    };
  }
) => PusherClient;

let pusherClient: PusherClient | null = null;

export async function createPusherBrowserClient() {
  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (typeof window === "undefined" || !key || !cluster) {
    return null;
  }

  if (!pusherClient) {
    const pusherModule = (await import("pusher-js")) as unknown as {
      default?: unknown;
      Pusher?: unknown;
    };
    const PusherConstructor =
      ("default" in pusherModule && pusherModule.default) ||
      ("Pusher" in pusherModule && pusherModule.Pusher);

    if (typeof PusherConstructor !== "function") {
      throw new Error("Pusher client constructor is unavailable.");
    }

    pusherClient = new (PusherConstructor as PusherConstructor)(key, {
      cluster,
      activityTimeout: ACTIVITY_TIMEOUT_MS,
      pongTimeout: PONG_TIMEOUT_MS,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  }

  return pusherClient;
}

// Ép pusher-js thử kết nối lại ngay thay vì chờ hết backoff.
// Dùng khi app quay lại foreground trên iOS: socket cũ thường đã chết im lặng.
export async function reconnectPusherBrowserClient() {
  const pusher = await createPusherBrowserClient();
  const connection = pusher?.connection;

  if (!connection || connection.state === "connected" || connection.state === "connecting") {
    return;
  }

  connection.connect?.();
}
