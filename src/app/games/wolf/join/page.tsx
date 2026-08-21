import type { Metadata } from "next";
import { buildGameShareMetadata, WOLF_SHARE_IMAGE } from "@/lib/game-share-metadata";
import WolfJoinScreen from "./wolf-join-screen";

export const metadata: Metadata = buildGameShareMetadata({
  title: "Tham gia phòng Ma Sói Một Đêm | Boardverse",
  description: "Chọn phòng public hoặc nhập mã phòng Ma Sói Một Đêm.",
  path: "/games/wolf/join",
  image: WOLF_SHARE_IMAGE,
});

export default function WolfJoinPage() {
  return <WolfJoinScreen />;
}
