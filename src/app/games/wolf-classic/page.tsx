import type { Metadata } from "next";
import { CLASSIC_WOLF_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import ClassicWolfGameScreen from "./wolf-classic-game-screen";

export const metadata: Metadata = buildGameShareMetadata({
  title: "Ma Sói Nhiều Đêm | WePlayTogether",
  description: "Chơi Ma Sói nhiều đêm online cùng bạn bè.",
  path: "/games/wolf-classic",
  image: CLASSIC_WOLF_SHARE_IMAGE,
});

export default function ClassicWolfGamePage() {
  return <ClassicWolfGameScreen />;
}
