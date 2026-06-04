const DEFAULT_WOLF_ROOM_CHANNEL_PREFIX = "presence-wolf-room-";

export const WOLF_ROOM_UPDATED_EVENT = "wolf-room-updated";
export const WOLF_PLAY_UPDATED_EVENT = "wolf-play-updated";

function getWolfRoomChannelPrefix() {
  return process.env.NEXT_PUBLIC_PUSHER_CHANNEL_PREFIX ?? DEFAULT_WOLF_ROOM_CHANNEL_PREFIX;
}

export function getWolfRoomChannelName(roomCode: string) {
  return `${getWolfRoomChannelPrefix()}${roomCode.trim().toLowerCase()}`;
}

export function getWolfRoomCodeFromChannel(channelName: string) {
  const channelPrefix = getWolfRoomChannelPrefix();

  if (!channelName.startsWith(channelPrefix)) {
    return null;
  }

  const roomCode = channelName.slice(channelPrefix.length);
  return /^[a-z]{4}$/.test(roomCode) ? roomCode : null;
}
