import type { Metadata } from "next";
import WolfGameScreen from "./wolf-game-screen";

export const metadata: Metadata = {
  title: "Ma Sói Một Đêm | Boardverse",
  description: "Chơi Ma Sói Một Đêm online cùng bạn bè.",
};

export default function WolfGamePage() {
  return <WolfGameScreen />;
}
