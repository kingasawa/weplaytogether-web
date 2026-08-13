import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CLASSIC_WOLF_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import { getClassicWolfPlayState } from "../../../actions";
import ClassicWolfPlayScreen from "./wolf-classic-play-screen";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClassicWolfPlayPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({
  params,
}: ClassicWolfPlayPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const roomCode = roomId.toUpperCase();

  return buildGameShareMetadata({
    title: `Đang chơi ${roomCode} | Ma Sói Nhiều Đêm`,
    description: "Màn chơi Ma Sói nhiều đêm.",
    path: `/games/wolf-classic/rooms/${roomId}/play`,
    image: CLASSIC_WOLF_SHARE_IMAGE,
  });
}

export default async function ClassicWolfPlayPage({ params }: ClassicWolfPlayPageProps) {
  const { roomId } = await params;

  if (!ROOM_ID_PATTERN.test(roomId)) {
    notFound();
  }

  const playState = await getClassicWolfPlayState(roomId);

  if (!playState) {
    notFound();
  }

  return <ClassicWolfPlayScreen initialState={playState} />;
}
