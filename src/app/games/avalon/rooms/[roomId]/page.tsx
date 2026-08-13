import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AVALON_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import { getAvalonLobbyState, getAvalonSpectatorState } from "../../actions";
import AvalonRoomLobby from "./avalon-room-lobby";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type AvalonRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: AvalonRoomPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const roomCode = roomId.toUpperCase();

  return buildGameShareMetadata({
    title: `Phòng ${roomCode} | Avalon`,
    description: "Phòng chờ game Avalon.",
    path: `/games/avalon/rooms/${roomId}`,
    image: AVALON_SHARE_IMAGE,
  });
}

export default async function AvalonRoomPage({ params }: AvalonRoomPageProps) {
  const { roomId } = await params;

  if (!ROOM_ID_PATTERN.test(roomId)) {
    notFound();
  }

  const lobbyState = await getAvalonLobbyState(roomId);

  if (!lobbyState) {
    notFound();
  }

  const spectatorState =
    lobbyState.room.status === "playing" ? await getAvalonSpectatorState(roomId) : null;

  return <AvalonRoomLobby initialSpectatorState={spectatorState} initialState={lobbyState} />;
}
