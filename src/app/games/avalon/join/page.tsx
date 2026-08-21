import type { Metadata } from "next";
import { AVALON_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import AvalonJoinScreen from "./avalon-join-screen";

export const metadata: Metadata = buildGameShareMetadata({
  title: "Tham gia phòng Avalon | Boardverse",
  description: "Chọn phòng public hoặc nhập mã phòng Avalon.",
  path: "/games/avalon/join",
  image: AVALON_SHARE_IMAGE,
});

export default function AvalonJoinPage() {
  return <AvalonJoinScreen />;
}
