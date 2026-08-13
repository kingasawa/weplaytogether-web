import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildGameShareMetadata, WOLF_SHARE_IMAGE } from "@/lib/game-share-metadata";
import { getWolfLobbyState, getWolfSpectatorState } from "../../actions";
import WolfRoomLobby from "./wolf-room-lobby";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type WolfRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({
  params,
}: WolfRoomPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const roomCode = roomId.toUpperCase();

  return buildGameShareMetadata({
    title: `Phòng ${roomCode} | Ma Sói Một Đêm`,
    description: "Phòng chờ game Ma Sói Một Đêm.",
    path: `/games/wolf/rooms/${roomId}`,
    image: WOLF_SHARE_IMAGE,
  });
}

export default async function WolfRoomPage({ params }: WolfRoomPageProps) {
  const { roomId } = await params;

  if (!ROOM_ID_PATTERN.test(roomId)) {
    notFound();
  }

  const lobbyState = await getWolfLobbyState(roomId);

  if (!lobbyState) {
    notFound();
  }

  const spectatorState =
    lobbyState.room.status === "playing" ? await getWolfSpectatorState(roomId) : null;

  return <WolfRoomLobby initialSpectatorState={spectatorState} initialState={lobbyState} />;
}
