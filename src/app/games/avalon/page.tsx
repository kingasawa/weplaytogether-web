import type { Metadata } from "next";
import { AVALON_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import AvalonGameScreen from "./avalon-game-screen";

export const metadata: Metadata = buildGameShareMetadata({
  title: "Avalon | WePlayTogether",
  description: "Chơi Avalon online cùng bạn bè.",
  path: "/games/avalon",
  image: AVALON_SHARE_IMAGE,
});

export default function AvalonGamePage() {
  return <AvalonGameScreen />;
}
