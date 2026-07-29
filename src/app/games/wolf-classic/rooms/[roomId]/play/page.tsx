import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  return {
    title: `Đang chơi ${roomId.toUpperCase()} | Ma Sói Nhiều Đêm`,
    description: "Màn chơi Ma Sói nhiều đêm.",
  };
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
