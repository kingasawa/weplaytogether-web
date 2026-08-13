import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CLASSIC_WOLF_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import { getClassicWolfLobbyState } from "../../actions";
import ClassicWolfRoomLobby from "./wolf-classic-room-lobby";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClassicWolfRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({
  params,
}: ClassicWolfRoomPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const roomCode = roomId.toUpperCase();

  return buildGameShareMetadata({
    title: `Phòng ${roomCode} | Ma Sói Nhiều Đêm`,
    description: "Phòng chờ game Ma Sói nhiều đêm.",
    path: `/games/wolf-classic/rooms/${roomId}`,
    image: CLASSIC_WOLF_SHARE_IMAGE,
  });
}

export default async function ClassicWolfRoomPage({ params }: ClassicWolfRoomPageProps) {
  const { roomId } = await params;

  if (!ROOM_ID_PATTERN.test(roomId)) {
    notFound();
  }

  const lobbyState = await getClassicWolfLobbyState(roomId);

  if (!lobbyState) {
    notFound();
  }

  return <ClassicWolfRoomLobby initialState={lobbyState} />;
}
