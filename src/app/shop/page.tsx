import type { Metadata } from "next";
import ShopScreen from "./shop-screen";

export const metadata: Metadata = {
  title: "Cửa Hàng | WePlayTogether",
};

export default function ShopPage() {
  return <ShopScreen />;
}
