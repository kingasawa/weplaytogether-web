import type { WolfGamePhase } from "@/lib/supabase/types";

const DEFAULT_WOLF_ROOM_CHANNEL_PREFIX = "presence-nicecode-websocket-";
const DEFAULT_WOLF_ROOM_PUBLIC_CHANNEL_PREFIX = "nicecode-websocket-";

export const WOLF_ROOM_UPDATED_EVENT = "wolf-room-updated";
export const WOLF_PLAY_UPDATED_EVENT = "wolf-play-updated";
export const WOLF_LOBBY_UPDATED_EVENT = "wolf-lobby-updated";

// `phase` không bắt buộc: khi caller không biết chắc phase mới (ví dụ lúc reset về lobby), cứ bỏ
// trống — phía client coi payload không có `phase` là tín hiệu "cứ fetch lại đầy đủ cho chắc".
export type WolfPlayUpdatePayload = {
  roomCode: string;
  phase?: WolfGamePhase;
};

function getWolfRoomChannelPrefix() {
  return process.env.NEXT_PUBLIC_PUSHER_CHANNEL_PREFIX ?? DEFAULT_WOLF_ROOM_CHANNEL_PREFIX;
}

function getWolfRoomPublicChannelPrefix() {
  return process.env.NEXT_PUBLIC_PUSHER_PUBLIC_CHANNEL_PREFIX ?? DEFAULT_WOLF_ROOM_PUBLIC_CHANNEL_PREFIX;
}

export function getWolfRoomChannelName(roomCode: string) {
  return `${getWolfRoomChannelPrefix()}${roomCode.trim().toLowerCase()}`;
}

export function getWolfRoomPublicChannelName(roomCode: string) {
  return `${getWolfRoomPublicChannelPrefix()}${roomCode.trim().toLowerCase()}`;
}

// Kênh chung cho các màn hình danh sách phòng public của mọi game.
// Mã phòng luôn là 4 chữ cái nên hậu tố "lobby" không thể trùng kênh phòng nào.
export function getWolfLobbyChannelName() {
  return `${getWolfRoomPublicChannelPrefix()}lobby`;
}

export function getWolfRoomCodeFromChannel(channelName: string) {
  const channelPrefix = getWolfRoomChannelPrefix();

  if (!channelName.startsWith(channelPrefix)) {
    return null;
  }

  const roomCode = channelName.slice(channelPrefix.length);
  return /^[a-z]{4}$/.test(roomCode) ? roomCode : null;
}
