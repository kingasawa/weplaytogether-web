import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AVALON_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import { getAvalonLobbyState, getAvalonPlayState } from "../../../actions";
import AvalonPlayScreen from "./avalon-play-screen";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type AvalonPlayPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function generateMetadata({ params }: AvalonPlayPageProps): Promise<Metadata> {
  const { roomId } = await params;
  const roomCode = roomId.toUpperCase();

  return buildGameShareMetadata({
    title: `Đang chơi ${roomCode} | Avalon`,
    description: "Màn chơi Avalon.",
    path: `/games/avalon/rooms/${roomId}/play`,
    image: AVALON_SHARE_IMAGE,
  });
}

export default async function AvalonPlayPage({ params }: AvalonPlayPageProps) {
  const { roomId } = await params;

  if (!ROOM_ID_PATTERN.test(roomId)) {
    notFound();
  }

  const playState = await getAvalonPlayState(roomId);

  if (!playState) {
    // Phòng tồn tại nhưng ván chưa sẵn sàng (hoặc chưa bắt đầu/đã kết thúc) -> về lobby,
    // lobby sẽ tự đưa lại vào ván khi state sẵn sàng. Chỉ 404 khi phòng không tồn tại.
    const lobbyState = await getAvalonLobbyState(roomId);

    if (lobbyState) {
      redirect(`/games/avalon/rooms/${roomId}`);
    }

    notFound();
  }

  return <AvalonPlayScreen initialState={playState} />;
}
