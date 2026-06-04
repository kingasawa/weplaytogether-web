import Pusher from "pusher";
import { getWolfRoomChannelName, WOLF_PLAY_UPDATED_EVENT, WOLF_ROOM_UPDATED_EVENT } from "./channels";

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
    pusherServer = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }

  return pusherServer;
}

export function authorizePusherPresenceChannel(
  socketId: string,
  channelName: string,
  user: { id: string; name: string }
) {
  const pusher = createPusherServerClient();

  if (!pusher) {
    return null;
  }

  return pusher.authorizeChannel(socketId, channelName, {
    user_id: user.id,
    user_info: {
      name: user.name,
    },
  });
}

export async function broadcastWolfRoomUpdate(roomCode: string) {
  const pusher = createPusherServerClient();

  if (!pusher) {
    return;
  }

  await pusher.trigger(getWolfRoomChannelName(roomCode), WOLF_ROOM_UPDATED_EVENT, {
    roomCode: roomCode.toLowerCase(),
  });
}

export async function broadcastWolfPlayUpdate(roomCode: string) {
  const pusher = createPusherServerClient();

  if (!pusher) {
    return;
  }

  await pusher.trigger(getWolfRoomChannelName(roomCode), WOLF_PLAY_UPDATED_EVENT, {
    roomCode: roomCode.toLowerCase(),
  });
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
