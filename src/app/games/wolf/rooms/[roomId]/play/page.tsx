import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  return {
    title: `Đang chơi ${roomId.toUpperCase()} | Ma Sói Một Đêm`,
    description: "Màn chơi Ma Sói Một Đêm.",
  };
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
