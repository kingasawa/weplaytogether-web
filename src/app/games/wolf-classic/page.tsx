import type { Metadata } from "next";
import ClassicWolfGameScreen from "./wolf-classic-game-screen";

export const metadata: Metadata = {
  title: "Ma Sói Nhiều Đêm | Boardverse",
  description: "Chơi Ma Sói nhiều đêm online cùng bạn bè.",
};

export default function ClassicWolfGamePage() {
  return <ClassicWolfGameScreen />;
}
