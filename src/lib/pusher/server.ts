import Pusher from "pusher";
import {
  getWolfRoomChannelName,
  getWolfRoomPublicChannelName,
  WOLF_PLAY_UPDATED_EVENT,
  WOLF_ROOM_UPDATED_EVENT,
} from "./channels";

// Auth only — uses crypto, works fine in Cloudflare Workers
let pusherServer: Pusher | null = null;

function createPusherServerClient() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    return null;
  }

  if (!pusherServer) {
    pusherServer = new Pusher({ appId, key, secret, cluster, useTLS: true });
  }

  return pusherServer;
}

export function authorizePusherPresenceChannel(
  socketId: string,
  channelName: string,
  user: { id: string; name: string }
) {
  const pusher = createPusherServerClient();
  if (!pusher) return null;

  return pusher.authorizeChannel(socketId, channelName, {
    user_id: user.id,
    user_info: { name: user.name },
  });
}

// Broadcast via native fetch — compatible with Cloudflare Workers
async function triggerPusherEvent(channel: string, event: string, data: unknown) {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) return;

  const body = JSON.stringify({ channel, name: event, data: JSON.stringify(data) });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const encoder = new TextEncoder();

  // MD5 via node:crypto (available with nodejs_compat in Cloudflare Workers)
  const nodeCrypto = await import("node:crypto");
  const bodyMd5 = nodeCrypto.createHash("md5").update(body).digest("hex");

  // Build sorted query string
  const params: Record<string, string> = {
    auth_key: key,
    auth_timestamp: timestamp,
    auth_version: "1.0",
    body_md5: bodyMd5,
  };
  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  // HMAC-SHA256 signature
  const stringToSign = `POST\n/apps/${appId}/events\n${sortedQuery}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(stringToSign));
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const url = `https://api-${cluster}.pusher.com/apps/${appId}/events?${sortedQuery}&auth_signature=${signature}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Pusher trigger failed:", res.status, text);
  }
}

export async function broadcastWolfRoomUpdate(roomCode: string) {
  const data = { roomCode: roomCode.toLowerCase() };

  await Promise.all([
    triggerPusherEvent(getWolfRoomChannelName(roomCode), WOLF_ROOM_UPDATED_EVENT, data),
    triggerPusherEvent(getWolfRoomPublicChannelName(roomCode), WOLF_ROOM_UPDATED_EVENT, data),
  ]);
}

export async function broadcastWolfPlayUpdate(roomCode: string) {
  const data = { roomCode: roomCode.toLowerCase() };

  await Promise.all([
    triggerPusherEvent(getWolfRoomChannelName(roomCode), WOLF_PLAY_UPDATED_EVENT, data),
    triggerPusherEvent(getWolfRoomPublicChannelName(roomCode), WOLF_PLAY_UPDATED_EVENT, data),
  ]);
}

export async function safeBroadcastWolfRoomUpdate(roomCode: string) {
  try {
    await broadcastWolfRoomUpdate(roomCode);
  } catch (error) {
    console.error("Failed to broadcast wolf room update.", error);
  }
}

export async function safeBroadcastWolfPlayUpdate(roomCode: string) {
  try {
    await broadcastWolfPlayUpdate(roomCode);
  } catch (error) {
    console.error("Failed to broadcast wolf play update.", error);
  }
}
