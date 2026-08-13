import type { Metadata } from "next";
import { buildGameShareMetadata, WOLF_SHARE_IMAGE } from "@/lib/game-share-metadata";
import WolfGameScreen from "./wolf-game-screen";

export const metadata: Metadata = buildGameShareMetadata({
  title: "Ma Sói Một Đêm | Boardverse",
  description: "Chơi Ma Sói Một Đêm online cùng bạn bè.",
  path: "/games/wolf",
  image: WOLF_SHARE_IMAGE,
});

export default function WolfGamePage() {
  return <WolfGameScreen />;
}
