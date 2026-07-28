import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassicWolfLobbyState } from "../../actions";
import ClassicWolfRoomLobby from "./wolf-classic-room-lobby";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type ClassicWolfRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({
  params,
}: ClassicWolfRoomPageProps): Promise<Metadata> {
  const { roomId } = await params;

  return {
    title: `Phòng ${roomId.toUpperCase()} | Ma Sói Nhiều Đêm`,
    description: "Phòng chờ game Ma Sói nhiều đêm.",
  };
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
