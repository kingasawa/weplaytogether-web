import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildGameShareMetadata, WOLF_SHARE_IMAGE } from "@/lib/game-share-metadata";
import { getWolfPlayState } from "../../../actions";
import WolfPlayScreen from "./wolf-play-screen";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type WolfPlayPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({
  params,
}: WolfPlayPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const roomCode = roomId.toUpperCase();

  return buildGameShareMetadata({
    title: `Đang chơi ${roomCode} | Ma Sói Một Đêm`,
    description: "Màn chơi Ma Sói Một Đêm.",
    path: `/games/wolf/rooms/${roomId}/play`,
    image: WOLF_SHARE_IMAGE,
  });
}

export default async function WolfPlayPage({ params }: WolfPlayPageProps) {
  const { roomId } = await params;

  if (!ROOM_ID_PATTERN.test(roomId)) {
    notFound();
  }

  const playState = await getWolfPlayState(roomId);

  if (!playState) {
    notFound();
  }

  return <WolfPlayScreen initialState={playState} />;
}
