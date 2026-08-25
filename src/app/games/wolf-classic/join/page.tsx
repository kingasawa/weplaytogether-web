import type { Metadata } from "next";
import { CLASSIC_WOLF_SHARE_IMAGE, buildGameShareMetadata } from "@/lib/game-share-metadata";
import ClassicWolfJoinScreen from "./wolf-classic-join-screen";

export const metadata: Metadata = buildGameShareMetadata({
  title: "Tham gia phòng Ma Sói Nhiều Đêm | WePlayTogether",
  description: "Chọn phòng public hoặc nhập mã phòng Ma Sói Nhiều Đêm.",
  path: "/games/wolf-classic/join",
  image: CLASSIC_WOLF_SHARE_IMAGE,
});

export default function ClassicWolfJoinPage() {
  return <ClassicWolfJoinScreen />;
}
