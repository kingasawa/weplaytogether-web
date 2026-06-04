"use client";

type PusherChannel = {
  bind(eventName: string, callback: (data: unknown) => void): void;
  unbind_all(): void;
};

type PusherClient = {
  subscribe(channelName: string): PusherChannel;
  unsubscribe(channelName: string): void;
};

type PusherConstructor = new (
  key: string,
  options: {
    cluster: string;
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
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    });
  }

  return pusherClient;
}
